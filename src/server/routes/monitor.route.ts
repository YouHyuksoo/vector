/**
 * @file src/server/routes/monitor.route.ts
 * @description 모니터링 대시보드 API 엔드포인트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 시스템 상태를 한눈에 볼 수 있는 모니터링 엔드포인트
 * 2. **프론트엔드**: frontend/ Next.js 앱에서 이 API를 호출
 * 3. **GET /api/monitor/overview**: 큐, DB, 장비 상태 등 통합 JSON
 */

import { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, mkdirSync, statSync, copyFileSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { tmpdir, platform, cpus, totalmem, freemem } from 'os';
import { spawn, execSync } from 'child_process';
import { heartbeatService } from '../../services/heartbeat.service.js';
import { getConnection } from '../../database/oracle.pool.js';
import { logger } from '../../utils/logger.js';
import iconv from 'iconv-lite';
import { errorLogRepository } from '../../database/repositories/error-log.repository.js';
import { env, updateEnvValue } from '../../config/env.js';
import type { Env } from '../../config/env.js';
import { getVectorStatus, startVector, stopVector, VECTOR_BIN, VECTOR_CONFIG, AGENT_CONFIG_DIR } from '../../services/vector-process.service.js';
import {
  readRegistry, setTableColumns, getRegisteredTableNames,
  setProcedure, getProcedure, deleteTarget, getRegisteredProcedureKeys,
  isProcedureEntry, type RegistryColumn, type ProcedureEntry, type ProcedureParam,
} from '../../config/local-registry.js';
import { readParseFields, setFieldsByEquipment, deleteFieldsByEquipment, writeParseFields, type ParseField } from '../../config/local-parse-fields.js';
import { syncTomlRouting } from '../../config/vrl-target-updater.js';
import {
  buildCreateTableDDL, buildCreateProcedureDDL,
  buildRegistryColumns, buildRegistryProcedure, parseOracleError,
  type FieldDef,
} from '../../database/oracle-ddl.js';

export const monitorRoute: FastifyPluginAsync = async (app) => {

  // ─── TOML 백업 유틸 ───

  const BACKUP_DIR = join(dirname(VECTOR_CONFIG), 'backups');
  const MAX_BACKUPS = 20;

  /** 타임스탬프 기반 백업 생성 (source: 변경 출처) */
  function createTomlBackup(source: string): string {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const backupName = `vector-aggregator_${ts}_${source}.toml`;
    const backupPath = join(BACKUP_DIR, backupName);
    copyFileSync(VECTOR_CONFIG, backupPath);

    // 기존 .bak 호환 유지
    writeFileSync(VECTOR_CONFIG + '.bak', readFileSync(VECTOR_CONFIG, 'utf-8'), 'utf-8');

    // 오래된 백업 정리 (MAX_BACKUPS 초과 시)
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('vector-aggregator_') && f.endsWith('.toml'))
      .sort().reverse();
    for (let i = MAX_BACKUPS; i < files.length; i++) {
      try { unlinkSync(join(BACKUP_DIR, files[i])); } catch { /* ignore */ }
    }

    logger.info({ backupName, source }, 'TOML backup created');
    return backupName;
  }

  /** 하트비트 설비 목록에 서버 측 description 병합 (equipment_type ↔ agent name 매칭) */
  function mergeEquipmentDescriptions(equips: import('../../types/index.js').EquipmentStatus[]) {
    const descs = loadDescriptions();
    return equips.map(eq => {
      const eqType = (eq.metadata as Record<string, string>)?.equipment_type;
      const entry = eqType ? descs[eqType] : undefined;
      const desc = getDesc(entry);
      return {
        ...eq,
        metadata: {
          ...(eq.metadata ?? {}),
          ...(desc ? { description: desc } : {}),
        },
      };
    });
  }

  /** 통합 모니터링 데이터 */
  app.get('/api/monitor/overview', async (_request, reply) => {
    const [equipments, tableStats, recentErrors, recentLogs, vectorStatus, oracleStatus] =
      await Promise.allSettled([
        heartbeatService.getAllStatuses(),
        getTableStats(),
        getRecentErrors(),
        getRecentLogs(),
        getVectorStatus(),
        checkOracle(),
      ]);

    const disk = getDiskInfo();
    const mem = getMemoryInfo();
    const cpu = getCpuInfo();
    return reply.send({
      server: {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV ?? 'development',
        ...(disk && { disk }),
        memory: mem,
        cpu,
      },
      oracle: oracleStatus.status === 'fulfilled' ? oracleStatus.value : { connected: false },
      vector: vectorStatus.status === 'fulfilled'
        ? vectorStatus.value
        : { running: false, pid: null, apiReachable: false, uptime: null, version: null },
      equipments: equipments.status === 'fulfilled'
        ? mergeEquipmentDescriptions(equipments.value) : [],
      tables: tableStats.status === 'fulfilled' ? tableStats.value : [],
      recentErrors: recentErrors.status === 'fulfilled' ? recentErrors.value : [],
      recentLogs: recentLogs.status === 'fulfilled' ? recentLogs.value : [],
    });
  });

  /** Vector aggregator 상태 조회 */
  app.get('/api/monitor/vector', async (_request, reply) => {
    const status = await getVectorStatus();
    return reply.send(status);
  });

  /** Vector aggregator 시작 */
  app.post('/api/monitor/vector/start', async (_request, reply) => {
    const result = await startVector();
    if (result.success) {
      errorLogRepository.success('VECTOR_CONTROL', 'VECTOR_PROCESS', 'SYSTEM', result.message);
    } else {
      await errorLogRepository.record({
        source_table: 'VECTOR_PROCESS', equipment_id: 'SYSTEM',
        error_message: result.message, raw_data: JSON.stringify({ action: 'start' }),
        stage: 'VECTOR_CONTROL',
      });
    }
    return reply.status(result.success ? 200 : 400).send(result);
  });

  /** Vector aggregator 중지 */
  app.post('/api/monitor/vector/stop', async (_request, reply) => {
    const result = await stopVector();
    if (result.success) {
      errorLogRepository.success('VECTOR_CONTROL', 'VECTOR_PROCESS', 'SYSTEM', result.message);
    } else {
      await errorLogRepository.record({
        source_table: 'VECTOR_PROCESS', equipment_id: 'SYSTEM',
        error_message: result.message, raw_data: JSON.stringify({ action: 'stop' }),
        stage: 'VECTOR_CONTROL',
      });
    }
    return reply.status(result.success ? 200 : 400).send(result);
  });

  /** Vector aggregator TOML 설정 조회 */
  app.get('/api/monitor/aggregator/config', async (_request, reply) => {
    try {
      const content = readFileSync(VECTOR_CONFIG, 'utf-8');
      return reply.send({ content, filePath: VECTOR_CONFIG });
    } catch (err) {
      logger.error(err, 'Failed to read aggregator config');
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Vector aggregator TOML 설정 저장 (백업 포함) */
  app.put('/api/monitor/aggregator/config', async (request, reply) => {
    const { content } = request.body as { content: string };
    if (typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Invalid content' });
    }
    try {
      const backupName = createTomlBackup('editor');
      writeFileSync(VECTOR_CONFIG, content, 'utf-8');
      logger.info('Aggregator config updated via API');
      errorLogRepository.success('FILE_WRITE', 'AGGREGATOR_CONFIG', 'SYSTEM', 'Config saved');

      // VRL 변경 시 parse-fields 자동 동기화
      try {
        const extracted = extractVrlFields(content);
        if (Object.keys(extracted).length > 0) {
          const allFields = readParseFields();
          for (const [eqType, fields] of Object.entries(extracted)) {
            allFields[eqType] = fields.map((f, i) => ({
              fieldName: f, fieldLabel: f, fieldOrder: i + 1,
            }));
          }
          writeParseFields(allFields);
          logger.info('Parse-fields auto-synced after aggregator config save');
        }
      } catch (syncErr) {
        logger.warn({ err: syncErr }, 'Failed to auto-sync parse-fields');
      }

      return reply.send({ success: true, message: 'Config saved', backupName });
    } catch (err) {
      logger.error(err, 'Failed to save aggregator config');
      await errorLogRepository.record({
        source_table: 'AGGREGATOR_CONFIG',
        equipment_id: 'SYSTEM',
        error_message: err instanceof Error ? err.message : String(err),
        raw_data: content.substring(0, 4000),
        stage: 'FILE_WRITE',
      });
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ─── TOML 백업 이력 API ───

  /** 백업 이력 목록 조회 */
  app.get('/api/monitor/aggregator/backups', async (_request, reply) => {
    try {
      if (!existsSync(BACKUP_DIR)) return reply.send({ backups: [] });
      const files = readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('vector-aggregator_') && f.endsWith('.toml'))
        .sort().reverse();

      const backups = files.map(f => {
        const stat = statSync(join(BACKUP_DIR, f));
        // vector-aggregator_2026-02-20_04-30-00_editor.toml → source 추출
        const parts = f.replace('.toml', '').split('_');
        const source = parts.length >= 4 ? parts.slice(3).join('_') : 'unknown';
        return {
          name: f,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          source,
        };
      });

      return reply.send({ backups });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 특정 백업 내용 조회 */
  app.get('/api/monitor/aggregator/backups/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    // 경로 조작 방지
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid backup name' });
    }
    const filePath = join(BACKUP_DIR, name);
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Backup not found' });
    }
    try {
      const content = readFileSync(filePath, 'utf-8');
      return reply.send({ name, content });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 백업에서 복구 (현재 설정을 백업 후 교체) */
  app.post('/api/monitor/aggregator/backups/:name/restore', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid backup name' });
    }
    const filePath = join(BACKUP_DIR, name);
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Backup not found' });
    }
    try {
      createTomlBackup('restore');
      const backupContent = readFileSync(filePath, 'utf-8');
      writeFileSync(VECTOR_CONFIG, backupContent, 'utf-8');
      logger.info({ restoredFrom: name }, 'TOML restored from backup');
      return reply.send({ success: true, restoredFrom: name });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ─── 다운로드 API ───

  /** Vector 실행파일(zip) 다운로드 */
  app.get('/api/monitor/download/vector-zip', async (_request, reply) => {
    const zipPath = join(process.cwd(), 'vector-bin', 'vector.zip');
    if (!existsSync(zipPath)) {
      return reply.status(404).send({ error: 'vector.zip not found' });
    }
    try {
      const buf = readFileSync(zipPath);
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', 'attachment; filename="vector.zip"')
        .send(buf);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 설비별 Agent TOML 다운로드 */
  app.get('/api/monitor/download/agent/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      return reply.status(400).send({ error: 'Invalid name' });
    }
    const filePath = join(AGENT_CONFIG_DIR, `${name}.toml`);
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    try {
      const content = readFileSync(filePath, 'utf-8');
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${name}.toml"`)
        .send(content);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ─── 설비별 Agent 설정 관리 API ───

  /** 설비 이름 유효성 검사 (영문, 숫자, 하이픈, 언더스코어만 허용) */
  const isValidAgentName = (name: string) => /^[A-Za-z0-9_-]+$/.test(name);
  const agentPath = (name: string) => join(AGENT_CONFIG_DIR, `${name}.toml`);
  const AGENT_DESC_PATH = join(AGENT_CONFIG_DIR, 'descriptions.json');

  interface AgentMeta { description?: string; encoding?: string }
  type DescMap = Record<string, string | AgentMeta>;

  const loadDescriptions = (): DescMap => {
    try { if (existsSync(AGENT_DESC_PATH)) return JSON.parse(readFileSync(AGENT_DESC_PATH, 'utf-8')); }
    catch { /* ignore */ }
    return {};
  };
  const saveDescriptions = (data: DescMap) => {
    writeFileSync(AGENT_DESC_PATH, JSON.stringify(data, null, 2), 'utf-8');
  };
  /** description 문자열 추출 (하위 호환: string | { description }) */
  const getDesc = (entry: string | AgentMeta | undefined): string =>
    typeof entry === 'string' ? entry : entry?.description ?? '';
  /** encoding 추출 (기본값: utf-8) */
  const getEncoding = (entry: string | AgentMeta | undefined): string =>
    typeof entry === 'object' && entry?.encoding ? entry.encoding : 'utf-8';

  /** TOML 내용에서 설정 완료 단계를 분석 */
  function analyzeTomlStatus(content: string): Record<string, boolean> {
    const metaVal = (k: string) => (content.match(new RegExp(`\\.${k}\\s*=\\s*"([^"]*)"`))?.[1] ?? '').trim();
    const sinkM = content.match(/\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*"([^:]+):(\d+)"/);
    const includeM = content.match(/include\s*=\s*\[([\s\S]*?)\]/);
    const paths = includeM ? includeM[1].replace(/[",]/g, '').trim() : '';
    return {
      equip: !!(metaVal('equipment_type') && metaVal('equipment_id')),
      connection: !!(sinkM && sinkM[1] && sinkM[2] && sinkM[1] !== '0.0.0.0'),
      logPath: paths.length > 0,
      heartbeat: /\[sources\.heartbeat\]/.test(content),
    };
  }

  /** 설비 목록 조회 (설명 + 설정 상태 포함) */
  app.get('/api/monitor/agent/configs', async (_request, reply) => {
    try {
      if (!existsSync(AGENT_CONFIG_DIR)) mkdirSync(AGENT_CONFIG_DIR, { recursive: true });
      const files = readdirSync(AGENT_CONFIG_DIR)
        .filter(f => f.endsWith('.toml') && !f.endsWith('.bak.toml'))
        .map(f => f.replace('.toml', ''))
        .sort();

      const configStatus: Record<string, Record<string, boolean>> = {};
      for (const name of files) {
        try {
          const toml = readFileSync(agentPath(name), 'utf-8');
          configStatus[name] = analyzeTomlStatus(toml);
        } catch {
          configStatus[name] = { equip: false, connection: false, logPath: false, heartbeat: false };
        }
      }

      return reply.send({ names: files, descriptions: loadDescriptions(), configStatus });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 특정 설비 TOML 조회 */
  app.get('/api/monitor/agent/config/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    const filePath = agentPath(name);
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Not found' });
    try {
      const content = readFileSync(filePath, 'utf-8');
      return reply.send({ content, filePath, name });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 특정 설비 TOML 저장 (백업 포함) */
  app.put('/api/monitor/agent/config/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const { content } = request.body as { content: string };
    if (!isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    if (typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Invalid content' });
    }
    const filePath = agentPath(name);
    try {
      if (existsSync(filePath)) {
        const original = readFileSync(filePath, 'utf-8');
        writeFileSync(filePath + '.bak', original, 'utf-8');
      }
      writeFileSync(filePath, content, 'utf-8');
      logger.info({ name }, 'Agent config updated, backup created');
      return reply.send({ success: true, message: 'Config saved', backedUp: true });
    } catch (err) {
      await errorLogRepository.record({
        source_table: 'AGENT_CONFIG',
        equipment_id: name,
        error_message: err instanceof Error ? err.message : String(err),
        raw_data: content.substring(0, 4000),
        stage: 'FILE_WRITE',
      });
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 새 설비 생성 (설명 포함) */
  app.post('/api/monitor/agent/configs', async (request, reply) => {
    const { name, content, description, encoding } = request.body as { name: string; content?: string; description?: string; encoding?: string };
    if (!name || !isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    const filePath = agentPath(name);
    if (existsSync(filePath)) return reply.status(409).send({ error: 'Already exists' });
    try {
      const defaultContent = content || getDefaultAgentToml(name);
      writeFileSync(filePath, defaultContent, 'utf-8');
      addEquipmentToAggregatorVrl(name);
      if (description || encoding) {
        const descs = loadDescriptions();
        descs[name] = { description: description ?? '', encoding: encoding ?? 'utf-8' };
        saveDescriptions(descs);
      }
      logger.info({ name }, 'New agent config created');
      return reply.send({ success: true, name });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 설비 설명/인코딩 수정 */
  app.put('/api/monitor/agent/description/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const { description, encoding } = request.body as { description?: string; encoding?: string };
    if (!isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    try {
      const descs = loadDescriptions();
      const prev = descs[name];
      const prevDesc = getDesc(prev);
      const prevEnc = getEncoding(prev);
      descs[name] = { description: description ?? prevDesc, encoding: encoding ?? prevEnc };
      saveDescriptions(descs);
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 설비 설정 삭제 */
  app.delete('/api/monitor/agent/config/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    const filePath = agentPath(name);
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Not found' });
    try {
      unlinkSync(filePath);
      const bakPath = filePath + '.bak';
      if (existsSync(bakPath)) unlinkSync(bakPath);
      removeEquipmentFromAggregatorVrl(name);
      deleteFieldsByEquipment(name);
      const descs = loadDescriptions();
      if (descs[name]) { delete descs[name]; saveDescriptions(descs); }
      logger.info({ name }, 'Agent config deleted (+ VRL block & parse-fields cleaned)');
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 설비 TOML 파일 다운로드 */
  app.get('/api/monitor/agent/config/:name/download', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    const filePath = agentPath(name);
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Not found' });
    try {
      const content = readFileSync(filePath, 'utf-8');
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${name}.toml"`)
        .send(content);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 등록된 테이블 목록 (로컬 config/table-registry.json 기반, TABLE 타겟만) */
  app.get('/api/monitor/tables/oracle', async (_request, reply) => {
    try {
      const registry = readRegistry();
      const tables = Object.entries(registry)
        .filter(([, entry]) => !isProcedureEntry(entry))
        .map(([name, cols]) => ({
          TABLE_NAME: name,
          NUM_ROWS: null,
          COLUMN_COUNT: Array.isArray(cols) ? cols.length : 0,
        }));
      tables.sort((a, b) => a.TABLE_NAME.localeCompare(b.TABLE_NAME));
      return reply.send({ tables });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Oracle 전체 테이블 목록 (USER_TABLES — 매핑 페이지용) */
  app.get('/api/monitor/tables/oracle/all', async (_request, reply) => {
    const conn = await getConnection();
    try {
      const result = await conn.execute(
        `SELECT TABLE_NAME, NUM_ROWS FROM USER_TABLES ORDER BY TABLE_NAME`,
      );
      return reply.send({ tables: result.rows ?? [] });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    } finally {
      await conn.close();
    }
  });

  /** Oracle 테이블 자동 생성 (DDL 실행 + registry 매핑) */
  app.post('/api/monitor/tables/oracle/create', async (request, reply) => {
    const body = request.body as {
      tableName: string;
      logType: string;
      fields: FieldDef[];
      preview?: boolean;
      forceRecreate?: boolean;
    };
    if (!body.tableName || !body.logType || !Array.isArray(body.fields) || body.fields.length === 0) {
      return reply.status(400).send({ error: 'tableName, logType, fields required' });
    }
    const upperName = body.tableName.toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(upperName)) {
      return reply.status(400).send({ error: 'invalidName' });
    }
    if (upperName.length > 30) {
      return reply.status(400).send({ error: 'nameTooLong' });
    }

    const { ddl, commentsDDL, columns } = buildCreateTableDDL(upperName, body.fields);

    if (body.preview) {
      const fullDDL = [ddl, '', ...commentsDDL.map(c => `${c};`)].join('\n');
      return reply.send({ ddl: fullDDL, columns });
    }

    const conn = await getConnection();
    try {
      /* 테이블 존재 여부 확인 */
      const chk = await conn.execute(
        `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :t`,
        { t: upperName },
      );
      const exists = Number((chk.rows as Array<{ CNT: number }>)?.[0]?.CNT ?? 0) > 0;

      let created = false;
      if (exists && body.forceRecreate) {
        await conn.execute(`DROP TABLE ${upperName} CASCADE CONSTRAINTS PURGE`).catch(() => {});
        await conn.execute(ddl);
        created = true;
      } else if (!exists) {
        await conn.execute(ddl);
        created = true;
      }

      /* 컬럼 코멘트는 테이블이 생성/재생성됐을 때 + 이미 존재할 때 모두 실행 (덮어쓰기 안전) */
      for (const stmt of commentsDDL) {
        await conn.execute(stmt).catch(() => {});
      }

      const regCols = buildRegistryColumns(upperName, body.fields);
      setTableColumns(upperName, regCols);

      let tomlSync: { success: boolean; backupName?: string } | undefined;
      tomlSync = syncTomlRouting(body.logType, 'TABLE', upperName, createTomlBackup);

      logger.info({ tableName: upperName, logType: body.logType, existed: exists, created }, 'Auto-created/synced Oracle table + registry');
      return reply.send({ success: true, tableName: upperName, ddl, columns, tomlSync, alreadyExisted: exists && !body.forceRecreate });
    } catch (err) {
      const parsed = parseOracleError(err);
      logger.error({ err, tableName: upperName }, 'Failed to auto-create Oracle table');
      return reply.status(400).send({ error: parsed.message, code: parsed.code });
    } finally {
      await conn.close();
    }
  });

  /** Oracle 테이블 컬럼 메타데이터 */
  app.get('/api/monitor/tables/oracle/:tableName/columns', async (request, reply) => {
    const { tableName } = request.params as { tableName: string };
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(tableName)) {
      return reply.status(400).send({ error: 'Invalid table name' });
    }
    const conn = await getConnection();
    try {
      const result = await conn.execute(
        `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_LENGTH, COLUMN_ID
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`,
        { t: tableName.toUpperCase() },
      );
      return reply.send({ columns: result.rows ?? [] });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    } finally {
      await conn.close();
    }
  });

  /** 테이블 컬럼 레지스트리 조회 — TABLE 타겟만 (로컬 JSON) */
  app.get('/api/monitor/registry', async (request, reply) => {
    try {
      const { table } = request.query as { table?: string };
      const registry = readRegistry();
      const rows: Array<Record<string, unknown>> = [];

      const tables = table
        ? { [table.toUpperCase()]: registry[table.toUpperCase()] ?? [] }
        : registry;
      for (const [tName, entry] of Object.entries(tables)) {
        if (isProcedureEntry(entry)) continue;
        for (const col of entry) {
          rows.push({ TABLE_NAME: tName, ...col });
        }
      }
      rows.sort((a, b) => {
        const t = String(a.TABLE_NAME).localeCompare(String(b.TABLE_NAME));
        return t !== 0 ? t : (Number(a.COLUMN_ORDER) - Number(b.COLUMN_ORDER));
      });
      // 프로시져 엔트리도 SOURCE_FIELD 매핑 여부 포함하여 반환
      const procRows: Array<Record<string, unknown>> = [];
      for (const [key, entry] of Object.entries(tables)) {
        if (!isProcedureEntry(entry)) continue;
        const hasMapped = entry.params.some(p => !!p.SOURCE_FIELD);
        procRows.push({ PROC_KEY: key, PROCEDURE_NAME: entry.procedureName, HAS_MAPPING: hasMapped });
      }
      return reply.send({ rows, procRows });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 레지스트리에 등록된 테이블/프로시져 키 목록 (프론트엔드 검증용) */
  app.get('/api/monitor/registry-keys', async (_request, reply) => {
    return reply.send({
      tables: getRegisteredTableNames(),
      procedures: getRegisteredProcedureKeys(),
    });
  });

  /** 테이블 컬럼 레지스트리 저장 — TABLE 타겟 (로컬 JSON) */
  app.post('/api/monitor/registry', async (request, reply) => {
    const body = request.body as {
      table: string;
      equipmentType?: string;
      columns: Array<{
        COLUMN_NAME: string;
        DATA_TYPE: string;
        SOURCE_FIELD: string;
        IS_REQUIRED: string;
        COLUMN_ORDER: number;
      }>;
    };

    if (!body.table || !Array.isArray(body.columns)) {
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    try {
      /* Oracle에 실제 테이블이 존재하는지 확인 — 없는 테이블 등록 방지 */
      const conn = await getConnection();
      try {
        const chk = await conn.execute(
          `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :t`,
          { t: body.table.toUpperCase() },
        );
        const exists = Number((chk.rows as Array<{ CNT: number }>)?.[0]?.CNT ?? 0) > 0;
        if (!exists) {
          return reply.status(400).send({ error: 'tableNotFound', table: body.table });
        }
      } finally {
        await conn.close();
      }

      const columns: RegistryColumn[] = body.columns.map((col) => ({
        COLUMN_NAME: col.COLUMN_NAME,
        DATA_TYPE: col.DATA_TYPE,
        SOURCE_FIELD: col.SOURCE_FIELD || null,
        IS_REQUIRED: col.IS_REQUIRED || 'N',
        COLUMN_ORDER: col.COLUMN_ORDER,
      }));
      setTableColumns(body.table, columns);

      // equipmentType이 있으면 TOML 타겟 라우팅도 자동 동기화
      let tomlSync: { success: boolean; backupName?: string } | undefined;
      if (body.equipmentType) {
        tomlSync = syncTomlRouting(body.equipmentType, 'TABLE', body.table, createTomlBackup);
      }

      return reply.send({ success: true, count: columns.length, tomlSync });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Oracle 전체 프로시져/함수/패키지 목록 (매핑 페이지용) */
  app.get('/api/monitor/procedures/oracle/all', async (_request, reply) => {
    const conn = await getConnection();
    try {
      const result = await conn.execute(`
        SELECT
          CASE WHEN PROCEDURE_NAME IS NOT NULL
            THEN OBJECT_NAME || '.' || PROCEDURE_NAME
            ELSE OBJECT_NAME END AS DISPLAY_NAME,
          CASE WHEN PROCEDURE_NAME IS NOT NULL
            THEN PROCEDURE_NAME ELSE OBJECT_NAME END AS OBJECT_NAME,
          CASE WHEN PROCEDURE_NAME IS NOT NULL
            THEN up.OBJECT_NAME ELSE NULL END AS PACKAGE_NAME,
          up.OBJECT_TYPE
        FROM USER_PROCEDURES up
        WHERE (up.OBJECT_TYPE = 'PROCEDURE' AND up.PROCEDURE_NAME IS NULL)
           OR (up.OBJECT_TYPE = 'PACKAGE' AND up.PROCEDURE_NAME IS NOT NULL)
        ORDER BY 1
      `);
      return reply.send({ procedures: result.rows ?? [] });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    } finally {
      await conn.close();
    }
  });

  /** Oracle 프로시져 자동 생성 (DDL 실행 + registry 매핑) */
  app.post('/api/monitor/procedures/oracle/create', async (request, reply) => {
    const body = request.body as {
      procedureName: string;
      tableName: string;
      logType: string;
      fields: FieldDef[];
      preview?: boolean;
      forceRecreate?: boolean;
    };
    if (!body.procedureName || !body.tableName || !body.logType || !Array.isArray(body.fields) || body.fields.length === 0) {
      return reply.status(400).send({ error: 'procedureName, tableName, logType, fields required' });
    }
    const upperProc = body.procedureName.toUpperCase();
    const upperTable = body.tableName.toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(upperProc)) {
      return reply.status(400).send({ error: 'invalidName' });
    }
    if (upperProc.length > 30) {
      return reply.status(400).send({ error: 'nameTooLong' });
    }

    const { ddl, params } = buildCreateProcedureDDL(upperProc, upperTable, body.fields);

    if (body.preview) {
      return reply.send({ ddl, params });
    }

    const conn = await getConnection();
    try {
      /* --- 대상 테이블 존재 여부 확인 → 없으면 자동 생성 (forceRecreate여도 테이블은 건들지 않음) --- */
      let tableCreated = false;
      const tblCheck = await conn.execute(
        `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :t`,
        { t: upperTable },
      );
      const tblExists = Number((tblCheck.rows as Array<{ CNT: number }>)?.[0]?.CNT ?? 0) > 0;
      if (!tblExists) {
        const tblResult = buildCreateTableDDL(upperTable, body.fields);
        await conn.execute(tblResult.ddl);
        for (const stmt of tblResult.commentsDDL) {
          await conn.execute(stmt).catch(() => {});
        }
        const regCols = buildRegistryColumns(upperTable, body.fields);
        setTableColumns(upperTable, regCols);
        tableCreated = true;
        logger.info({ tableName: upperTable, logType: body.logType }, 'Auto-created target table for procedure');
      }

      if (body.forceRecreate) {
        await conn.execute(`DROP PROCEDURE ${upperProc}`).catch(() => {});
      }
      await conn.execute(ddl);
      const regProc = buildRegistryProcedure(upperProc, body.fields);
      setProcedure(upperProc, regProc);

      let tomlSync: { success: boolean; backupName?: string } | undefined;
      tomlSync = syncTomlRouting(body.logType, 'PROCEDURE', upperProc, createTomlBackup);

      logger.info({ procedureName: upperProc, tableName: upperTable, logType: body.logType }, 'Auto-created Oracle procedure + registry');
      return reply.send({ success: true, procedureName: upperProc, ddl, params, tomlSync, tableCreated, tableName: upperTable });
    } catch (err) {
      const parsed = parseOracleError(err);
      logger.error({ err, procedureName: upperProc }, 'Failed to auto-create Oracle procedure');
      return reply.status(400).send({ error: parsed.message, code: parsed.code });
    } finally {
      await conn.close();
    }
  });

  /** Oracle 프로시져 파라미터(인수) 조회 */
  app.get('/api/monitor/procedures/oracle/:objectName/arguments', async (request, reply) => {
    const { objectName } = request.params as { objectName: string };
    const { package: packageName } = request.query as { package?: string };
    const conn = await getConnection();
    try {
      const sql = packageName
        ? `SELECT ARGUMENT_NAME, POSITION, DATA_TYPE, IN_OUT, DATA_LENGTH
           FROM USER_ARGUMENTS
           WHERE OBJECT_NAME = :obj AND PACKAGE_NAME = :pkg AND ARGUMENT_NAME IS NOT NULL
           ORDER BY POSITION`
        : `SELECT ARGUMENT_NAME, POSITION, DATA_TYPE, IN_OUT, DATA_LENGTH
           FROM USER_ARGUMENTS
           WHERE OBJECT_NAME = :obj AND PACKAGE_NAME IS NULL AND ARGUMENT_NAME IS NOT NULL
           ORDER BY POSITION`;
      const binds = packageName
        ? { obj: objectName.toUpperCase(), pkg: packageName.toUpperCase() }
        : { obj: objectName.toUpperCase() };
      const result = await conn.execute(sql, binds);
      return reply.send({ arguments: result.rows ?? [] });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    } finally {
      await conn.close();
    }
  });

  /** 저장된 프로시져 매핑 목록 조회 (로컬 레지스트리) */
  app.get('/api/monitor/procedures', async (_request, reply) => {
    try {
      const keys = getRegisteredProcedureKeys();
      const procedures = keys.map(key => {
        const entry = getProcedure(key);
        return { key, procedureName: entry?.procedureName ?? key, paramCount: entry?.params.length ?? 0 };
      });
      return reply.send({ procedures });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 프로시져 상세 조회 */
  app.get('/api/monitor/procedures/:key', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      const entry = getProcedure(key);
      if (!entry) return reply.status(404).send({ error: 'Not found' });
      return reply.send(entry);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 프로시져 매핑 저장 (생성/수정) */
  app.post('/api/monitor/procedures', async (request, reply) => {
    const body = request.body as {
      key: string;
      procedureName: string;
      callMode?: 'NAMED' | 'ARRAY';
      arrayTypeName?: string;
      equipmentType?: string;
      params: Array<{
        PARAM_ORDER: number;
        ARGUMENT_NAME: string;
        DATA_TYPE: string;
        IN_OUT: string;
        SOURCE_FIELD: string;
        IS_REQUIRED: string;
      }>;
    };

    if (!body.key || !body.procedureName) {
      return reply.status(400).send({ error: 'key and procedureName are required' });
    }

    try {
      const entry: ProcedureEntry = {
        targetType: 'PROCEDURE',
        procedureName: body.procedureName,
        ...(body.callMode ? { callMode: body.callMode } : {}),
        ...(body.arrayTypeName ? { arrayTypeName: body.arrayTypeName } : {}),
        params: (body.params || []).map((p, i) => ({
          PARAM_ORDER: p.PARAM_ORDER ?? i + 1,
          ARGUMENT_NAME: p.ARGUMENT_NAME || '',
          DATA_TYPE: p.DATA_TYPE || '',
          IN_OUT: p.IN_OUT || 'IN',
          SOURCE_FIELD: p.SOURCE_FIELD || '',
          IS_REQUIRED: p.IS_REQUIRED || 'N',
        })),
      };
      setProcedure(body.key, entry);

      // equipmentType이 있으면 TOML 타겟 라우팅도 자동 동기화
      let tomlSync: { success: boolean; backupName?: string } | undefined;
      if (body.equipmentType) {
        tomlSync = syncTomlRouting(body.equipmentType, 'PROCEDURE', body.key, createTomlBackup);
      }

      return reply.send({ success: true, count: entry.params.length, tomlSync });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 프로시져 삭제 */
  app.delete('/api/monitor/procedures/:key', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      deleteTarget(key);
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 로그 데이터 조회 */
  app.get('/api/monitor/logs', async (request, reply) => {
    const { table, limit: limitStr } = request.query as { table?: string; limit?: string };
    if (!table || !/^[A-Z_][A-Z0-9_]*$/i.test(table)) {
      return reply.status(400).send({ error: 'Invalid or missing table name' });
    }
    const rowLimit = Math.min(Number(limitStr) || 50, 500);
    const tableName = table.toUpperCase();

    const conn = await getConnection();
    try {
      // 컬럼 목록 조회
      const colResult = await conn.execute<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS
         WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`,
        { t: tableName },
      );
      const columns = (colResult.rows ?? []).map((r: any) => r.COLUMN_NAME);
      if (columns.length === 0) {
        return reply.send({ columns: [], rows: [] });
      }

      // 데이터 조회 (최신순)
      const sql = `SELECT ${columns.join(', ')} FROM ${tableName}
                    ORDER BY ROWID DESC FETCH FIRST :lim ROWS ONLY`;
      const result = await conn.execute(sql, { lim: rowLimit });
      return reply.send({ columns, rows: result.rows ?? [] });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    } finally {
      await conn.close();
    }
  });

  /** 처리 로그 조회 — 파일 기반 (DB 불필요, 정상+오류 통합) */
  app.get('/api/monitor/errors', async (request, reply) => {
    const {
      status, stage, sourceTable, equipmentId,
      startDate, endDate, limit: rawLimit,
    } = request.query as Record<string, string | undefined>;

    try {
      const result = errorLogRepository.query({
        status, stage, sourceTable, equipmentId,
        startDate, endDate,
        limit: Number(rawLimit) || 100,
      });
      return reply.send(result);
    } catch (err) {
      logger.error({ err }, 'Failed to query process logs');
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 오류 로그 전체 삭제 — 파일 비우기 (DB 불필요) */
  app.delete('/api/monitor/errors', async (_request, reply) => {
    try {
      const deleted = errorLogRepository.deleteAll();
      logger.info({ deleted }, 'Error logs deleted via API');
      return reply.send({ success: true, deleted });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ─── 재전송(Retry) API ───

  /** 선택된 LOG_ID 배열로 개별 재전송 */
  app.post('/api/monitor/retry', async (request, reply) => {
    const { logIds } = request.body as { logIds: number[] };
    if (!Array.isArray(logIds) || logIds.length === 0) {
      return reply.status(400).send({ error: 'logIds array required' });
    }

    try {
      const { logIngestService } = await import('../../services/log-ingest.service.js');
      const records = errorLogRepository.findByIds(logIds);
      let retried = 0;
      let failed = 0;
      const retriedIds: number[] = [];

      for (const rec of records) {
        if (!rec.RAW_DATA) { failed++; continue; }
        try {
          const logRecord = JSON.parse(rec.RAW_DATA);
          await logIngestService.processLog(logRecord);
          retried++;
          retriedIds.push(rec.LOG_ID);
        } catch {
          failed++;
        }
      }

      if (retriedIds.length > 0) {
        errorLogRepository.updateStatus(retriedIds, 'RETRIED');
      }

      logger.info({ retried, failed, requested: logIds.length }, 'Retry selected logs');
      return reply.send({ success: true, retried, failed });
    } catch (err) {
      logger.error({ err }, 'Failed to retry selected logs');
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** ERROR 상태 전체 재전송 */
  app.post('/api/monitor/retry/all', async (_request, reply) => {
    try {
      const { logIngestService } = await import('../../services/log-ingest.service.js');
      const records = errorLogRepository.findRetryable();
      let retried = 0;
      let failed = 0;
      const retriedIds: number[] = [];

      for (const rec of records) {
        try {
          const logRecord = JSON.parse(rec.RAW_DATA!);
          await logIngestService.processLog(logRecord);
          retried++;
          retriedIds.push(rec.LOG_ID);
        } catch {
          failed++;
        }
      }

      if (retriedIds.length > 0) {
        errorLogRepository.updateStatus(retriedIds, 'RETRIED');
      }

      logger.info({ retried, failed, total: records.length }, 'Retry all error logs');
      return reply.send({ success: true, retried, failed });
    } catch (err) {
      logger.error({ err }, 'Failed to retry all error logs');
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ─── 원본 로그 파일 탐색 API ───

  /** 폴더/파일 트리 조회 — path 쿼리로 하위 탐색 */
  app.get('/api/monitor/log-files', async (request, reply) => {
    const { path: relPath } = request.query as { path?: string };
    const baseDir = env.RAW_LOG_BASE_PATH;

    try {
      const targetDir = relPath ? join(baseDir, relPath) : baseDir;
      if (!existsSync(targetDir)) {
        return reply.send({ entries: [], currentPath: relPath || '' });
      }

      const entries: Array<{ name: string; type: 'dir' | 'file'; size?: number }> = [];
      for (const name of readdirSync(targetDir)) {
        const fp = join(targetDir, name);
        const st = statSync(fp);
        if (st.isDirectory()) {
          entries.push({ name, type: 'dir' });
        } else {
          entries.push({ name, type: 'file', size: st.size });
        }
      }
      entries.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
      return reply.send({ entries, currentPath: relPath || '' });
    } catch (err) {
      logger.error({ err }, 'Failed to list log directory');
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 특정 파일 원본 텍스트 반환 */
  app.get('/api/monitor/log-files/read', async (request, reply) => {
    const { path: relPath, search } = request.query as { path?: string; search?: string };
    if (!relPath) {
      return reply.status(400).send({ error: 'path required' });
    }
    // 경로 조작 방지
    if (relPath.includes('..')) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const filePath = join(env.RAW_LOG_BASE_PATH, relPath);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      return reply.status(404).send({ error: 'File not found' });
    }

    try {
      // 경로에서 equipment_type 추출 (예: LOWCURRENT/LOWCURRENT-001/... → LOWCURRENT)
      const parts = relPath.replace(/\\/g, '/').split('/');
      const eqType = parts[0] || '';
      const descs = loadDescriptions();
      const enc = getEncoding(descs[eqType]);
      const buf = readFileSync(filePath);
      const raw = enc === 'utf-8' ? buf.toString('utf-8') : iconv.decode(buf, enc);
      const lines = raw.split('\n');
      const total = lines.length;

      let filtered = lines;
      if (search) {
        const kw = search.toLowerCase();
        filtered = lines.filter(l => l.toLowerCase().includes(kw));
      }

      return reply.send({
        path: relPath,
        content: filtered.join('\n'),
        total,
        filtered: filtered.length,
      });
    } catch (err) {
      logger.error({ err, relPath }, 'Failed to read log file');
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 로그 파일/폴더 삭제 */
  app.delete('/api/monitor/log-files', async (request, reply) => {
    const { paths } = request.body as { paths: string[] };
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ error: 'paths array required' });
    }
    const baseDir = env.RAW_LOG_BASE_PATH;
    const results: Array<{ path: string; ok: boolean; error?: string }> = [];

    for (const relPath of paths) {
      if (relPath.includes('..')) {
        results.push({ path: relPath, ok: false, error: 'Invalid path' });
        continue;
      }
      const fullPath = join(baseDir, relPath);
      try {
        if (!existsSync(fullPath)) {
          results.push({ path: relPath, ok: false, error: 'Not found' });
          continue;
        }
        const st = statSync(fullPath);
        if (st.isDirectory()) {
          rmSync(fullPath, { recursive: true, force: true });
        } else {
          unlinkSync(fullPath);
        }
        results.push({ path: relPath, ok: true });
      } catch (err) {
        logger.error({ err, relPath }, 'Failed to delete log file');
        results.push({ path: relPath, ok: false, error: String(err) });
      }
    }

    const deleted = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    return reply.send({ success: true, deleted, failed, results });
  });

  // ─── VRL 파싱 룰 관리 API ───

  /** 전체 파싱 룰 조회 (로컬 JSON — 설비 유형별 그룹핑) */
  app.get('/api/monitor/parse-rules', async (_request, reply) => {
    try {
      const rules = readParseFields();
      return reply.send({ rules });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 특정 설비 유형의 파싱 룰 저장 (로컬 JSON) */
  app.post('/api/monitor/parse-rules', async (request, reply) => {
    const body = request.body as {
      equipmentType: string;
      fields: Array<{ fieldName: string; fieldLabel?: string }>;
    };
    if (!body.equipmentType || !Array.isArray(body.fields)) {
      return reply.status(400).send({ error: 'Invalid payload: equipmentType and fields required' });
    }
    const eqType = body.equipmentType.toUpperCase();

    try {
      const fields: ParseField[] = body.fields.map((f, i) => ({
        fieldName: f.fieldName,
        fieldLabel: f.fieldLabel || f.fieldName,
        fieldOrder: i + 1,
      }));
      setFieldsByEquipment(eqType, fields);
      logger.info({ equipmentType: eqType, count: fields.length }, 'Parse rules saved to local config');
      return reply.send({ success: true, count: fields.length });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 특정 설비 유형의 모든 파싱 룰 삭제 (로컬 JSON) */
  app.delete('/api/monitor/parse-rules/:equipmentType', async (request, reply) => {
    const { equipmentType } = request.params as { equipmentType: string };
    if (!equipmentType || !/^[A-Za-z0-9_-]+$/.test(equipmentType)) {
      return reply.status(400).send({ error: 'Invalid equipment type' });
    }
    try {
      const existed = deleteFieldsByEquipment(equipmentType);
      logger.info({ equipmentType, existed }, 'Parse rules deleted from local config');
      return reply.send({ success: true, deleted: existed ? 1 : 0 });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** VRL 코드에서 data.* 필드를 자동 추출하여 로컬 JSON에 동기화 */
  app.post('/api/monitor/parse-rules/sync', async (_request, reply) => {
    try {
      const tomlContent = readFileSync(VECTOR_CONFIG, 'utf-8');
      const extracted = extractVrlFields(tomlContent);

      if (Object.keys(extracted).length === 0) {
        return reply.send({ success: true, synced: {}, message: 'No data.* fields found in VRL' });
      }

      const allFields = readParseFields();
      for (const [eqType, fields] of Object.entries(extracted)) {
        allFields[eqType] = fields.map((f, i) => ({
          fieldName: f,
          fieldLabel: f,
          fieldOrder: i + 1,
        }));
      }
      writeParseFields(allFields);

      const synced: Record<string, number> = {};
      for (const [k, v] of Object.entries(extracted)) synced[k] = v.length;
      logger.info({ synced }, 'Parse rules synced from VRL to local config');
      return reply.send({ success: true, synced, details: extracted });
    } catch (err) {
      logger.error(err, 'Failed to sync parse rules from VRL');
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ─── AI 모델 설정 API ───

  const AI_CONFIG_PATH = join(process.cwd(), 'config', 'ai-config.json');
  const SYSTEM_PROMPT_PATH = join(process.cwd(), 'config', 'ai-system-prompt.txt');

  /** 저장된 시스템 프롬프트 로드 (없으면 기본값) */
  function loadSavedSystemPrompt(): string {
    if (existsSync(SYSTEM_PROMPT_PATH)) {
      return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    }
    return getDefaultVrlSystemPrompt();
  }

  interface AiModelConfig {
    apiKey: string;
    model: string;
    enabled: boolean;
  }
  interface AiConfig {
    gemini: AiModelConfig;
    mistral: AiModelConfig;
    claude: AiModelConfig;
  }

  const DEFAULT_AI_CONFIG: AiConfig = {
    gemini:  { apiKey: '', model: 'gemini-2.5-flash', enabled: false },
    mistral: { apiKey: '', model: 'mistral-large-latest', enabled: false },
    claude:  { apiKey: '', model: 'claude-sonnet-4-20250514', enabled: false },
  };

  function loadAiConfig(): AiConfig {
    try {
      if (existsSync(AI_CONFIG_PATH)) {
        return { ...DEFAULT_AI_CONFIG, ...JSON.parse(readFileSync(AI_CONFIG_PATH, 'utf-8')) };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_AI_CONFIG };
  }

  /** AI 모델 설정 조회 (API 키 마스킹) */
  app.get('/api/monitor/ai/config', async (_request, reply) => {
    const cfg = loadAiConfig();
    const masked: Record<string, any> = {};
    for (const [name, m] of Object.entries(cfg)) {
      masked[name] = { ...m, apiKey: m.apiKey ? '••••••••' + m.apiKey.slice(-4) : '' };
    }
    return reply.send(masked);
  });

  /** AI 모델 설정 저장 */
  app.put('/api/monitor/ai/config', async (request, reply) => {
    const body = request.body as Record<string, Partial<AiModelConfig>>;
    const current = loadAiConfig();

    for (const [name, updates] of Object.entries(body)) {
      if (name in current) {
        const key = name as keyof AiConfig;
        if (updates.model !== undefined) current[key].model = updates.model;
        if (updates.enabled !== undefined) current[key].enabled = updates.enabled;
        if (updates.apiKey !== undefined && !updates.apiKey.startsWith('••••')) {
          current[key].apiKey = updates.apiKey;
        }
      }
    }

    writeFileSync(AI_CONFIG_PATH, JSON.stringify(current, null, 2), 'utf-8');
    logger.info('AI config updated');
    return reply.send({ success: true });
  });

  /** AI 모델 연결 테스트 — 간단한 프롬프트로 API 키 유효성 확인 */
  app.post('/api/monitor/ai/test', async (request, reply) => {
    const { provider } = request.body as { provider: string };
    if (!provider) return reply.status(400).send({ error: 'provider is required' });

    const cfg = loadAiConfig();
    const modelCfg = cfg[provider as keyof AiConfig];
    if (!modelCfg?.apiKey) {
      return reply.send({ success: false, error: 'API key is not configured' });
    }

    const testPrompt = 'Say "Hello" in one word.';
    const start = Date.now();

    try {
      let responseText = '';

      if (provider === 'claude') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': modelCfg.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: modelCfg.model,
            max_tokens: 32,
            messages: [{ role: 'user', content: testPrompt }],
          }),
        });
        const json = await res.json() as any;
        if (!res.ok) throw new Error(json.error?.message || `Claude API ${res.status}`);
        responseText = json.content?.[0]?.text || '';

      } else if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCfg.model}:generateContent?key=${modelCfg.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: testPrompt }] }],
          }),
        });
        const json = await res.json() as any;
        if (!res.ok) throw new Error(json.error?.message || `Gemini API ${res.status}`);
        responseText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

      } else if (provider === 'mistral') {
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${modelCfg.apiKey}`,
          },
          body: JSON.stringify({
            model: modelCfg.model,
            messages: [{ role: 'user', content: testPrompt }],
            max_tokens: 32,
          }),
        });
        const json = await res.json() as any;
        if (!res.ok) throw new Error(json.message || json.detail || `Mistral API ${res.status}`);
        responseText = json.choices?.[0]?.message?.content || '';

      } else {
        return reply.status(400).send({ success: false, error: `Unknown provider: ${provider}` });
      }

      const elapsed = Date.now() - start;
      logger.info({ provider, elapsed }, 'AI model test succeeded');
      return reply.send({
        success: true,
        response: responseText.trim(),
        model: modelCfg.model,
        latencyMs: elapsed,
      });
    } catch (err) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ provider, err: msg }, 'AI model test failed');
      return reply.send({ success: false, error: msg, latencyMs: elapsed });
    }
  });

  /** 활성화된 AI 모델 목록 조회 */
  app.get('/api/monitor/ai/models', async (_request, reply) => {
    const cfg = loadAiConfig();
    const models = Object.entries(cfg)
      .filter(([, m]) => m.enabled && m.apiKey)
      .map(([name, m]) => ({ name, model: m.model }));
    return reply.send({ models });
  });

  /** AI VRL 시스템 프롬프트 조회 (저장본 우선, 없으면 기본값) */
  app.get('/api/monitor/ai/system-prompt', async (_request, reply) => {
    return reply.send({
      prompt: loadSavedSystemPrompt(),
      isCustom: existsSync(SYSTEM_PROMPT_PATH),
    });
  });

  /** AI VRL 시스템 프롬프트 저장 */
  app.put('/api/monitor/ai/system-prompt', async (request, reply) => {
    const { prompt } = request.body as { prompt: string };
    writeFileSync(SYSTEM_PROMPT_PATH, prompt, 'utf-8');
    return reply.send({ success: true });
  });

  /** AI VRL 시스템 프롬프트 초기화 (저장본 삭제) */
  app.delete('/api/monitor/ai/system-prompt', async (_request, reply) => {
    if (existsSync(SYSTEM_PROMPT_PATH)) unlinkSync(SYSTEM_PROMPT_PATH);
    return reply.send({ success: true, prompt: getDefaultVrlSystemPrompt() });
  });

  /** AI로 VRL 코드 생성 */
  app.post('/api/monitor/ai/generate-vrl', async (request, reply) => {
    const { provider, sampleLog, equipmentType, userInstruction } = request.body as {
      provider: string;
      sampleLog: string;
      equipmentType: string;
      userInstruction?: string;
    };

    if (!provider || !sampleLog) {
      return reply.status(400).send({ error: 'provider and sampleLog are required' });
    }

    const cfg = loadAiConfig();
    const modelCfg = cfg[provider as keyof AiConfig];
    if (!modelCfg?.apiKey || !modelCfg.enabled) {
      return reply.status(400).send({ error: `AI model "${provider}" is not configured or disabled` });
    }

    const systemPrompt = (request.body as any).systemPrompt || loadSavedSystemPrompt();

    const userPrompt = `Equipment type: ${equipmentType}
Sample log:
${sampleLog}
${userInstruction ? `\nParsing instructions from user:\n${userInstruction}\n` : ''}
Generate VRL parsing code for this log.`;

    try {
      let vrlCode: string;

      if (provider === 'claude') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': modelCfg.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: modelCfg.model,
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        const json = await res.json() as any;
        if (!res.ok) throw new Error(json.error?.message || `Claude API ${res.status}`);
        vrlCode = json.content?.[0]?.text || '';

      } else if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCfg.model}:generateContent?key=${modelCfg.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
          }),
        });
        const json = await res.json() as any;
        if (!res.ok) throw new Error(json.error?.message || `Gemini API ${res.status}`);
        vrlCode = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

      } else if (provider === 'mistral') {
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${modelCfg.apiKey}`,
          },
          body: JSON.stringify({
            model: modelCfg.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        const json = await res.json() as any;
        if (!res.ok) throw new Error(json.message || json.detail || `Mistral API ${res.status}`);
        vrlCode = json.choices?.[0]?.message?.content || '';

      } else {
        return reply.status(400).send({ error: `Unknown provider: ${provider}` });
      }

      // 코드 펜스 제거 (AI가 넣을 수 있으므로)
      vrlCode = vrlCode.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();

      logger.info({ provider, equipmentType }, 'VRL code generated by AI');
      return reply.send({ success: true, vrlCode });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ provider, err: msg }, 'AI VRL generation failed');
      return reply.send({ success: false, error: msg });
    }
  });

  // ─── VRL 시뮬레이터 API ───

  /** 설비유형 → target_table/target_type 매핑 일괄 조회 */
  app.get('/api/monitor/vrl/target-map', async (_request, reply) => {
    try {
      const toml = readFileSync(VECTOR_CONFIG, 'utf-8');
      const sourceMatch = toml.match(
        /\[transforms\.parse_logs\][\s\S]*?source\s*=\s*'''([\s\S]*?)'''/,
      );
      if (!sourceMatch) return reply.send({ map: {} });
      const vrl = sourceMatch[1];
      const map: Record<string, { targetTable: string; targetType: string }> = {};
      const eqMatches = vrl.matchAll(/\.equipment_type\s*==\s*"([^"]+)"/g);
      for (const m of eqMatches) {
        const eqType = m[1];
        const block = extractEquipmentBlock(vrl, eqType);
        if (!block) continue;
        const tblMatch = block.match(/\.target_table\s*=\s*"([^"]+)"/);
        const typeMatch = block.match(/\.target_type\s*=\s*"([^"]+)"/);
        map[eqType] = {
          targetTable: tblMatch?.[1] || `LOG_INSPECTION`,
          targetType: typeMatch?.[1] || 'TABLE',
        };
      }
      return reply.send({ map });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 특정 설비 유형의 기존 VRL 코드 조회 */
  app.get('/api/monitor/vrl/code/:equipmentType', async (request, reply) => {
    const { equipmentType } = request.params as { equipmentType: string };
    const eqType = equipmentType.toUpperCase();

    try {
      const tomlContent = readFileSync(VECTOR_CONFIG, 'utf-8');
      const sourceMatch = tomlContent.match(
        /\[transforms\.parse_logs\][\s\S]*?source\s*=\s*'''([\s\S]*?)'''/,
      );
      if (!sourceMatch) {
        return reply.status(404).send({ error: 'parse_logs source block not found' });
      }

      const code = extractEquipmentBlock(sourceMatch[1], eqType);
      if (code === null) {
        return reply.send({ equipmentType: eqType, code: '' });
      }
      return reply.send({ equipmentType: eqType, code });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** VRL 코드 시뮬레이션 (vector.exe vrl 실행) */
  app.post('/api/monitor/vrl/simulate', async (request, reply) => {
    const { equipmentType, logType, sampleLog, vrlCode } = request.body as {
      equipmentType: string;
      logType: string;
      sampleLog: string;
      vrlCode: string;
    };

    if (!sampleLog || !vrlCode) {
      return reply.status(400).send({ error: 'sampleLog and vrlCode are required' });
    }

    const ts = Date.now();
    const inputFile = join(tmpdir(), `vrl-input-${ts}.json`);
    const vrlFile = join(tmpdir(), `vrl-program-${ts}.vrl`);

    try {
      const inputData = JSON.stringify({
        message: sampleLog.replace(/\r\n/g, '\n').replace(/\r/g, ''),
        equipment_type: equipmentType || '',
        log_type: logType || 'INSPECTION',
      });
      writeFileSync(inputFile, inputData, 'utf-8');
      writeFileSync(vrlFile, vrlCode, 'utf-8');

      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const proc = spawn(VECTOR_BIN, [
          'vrl', '--input', inputFile, '--program', vrlFile, '--print-object',
        ], { windowsHide: true });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0) resolve({ stdout, stderr });
          else {
            // stderr에서 INFO/DEBUG 로그 줄 제거하여 실제 에러만 추출
            const cleanErr = stderr.split('\n')
              .filter(l => !l.match(/^\d{4}-\d{2}-\d{2}T.*\s+(INFO|DEBUG)\s+/))
              .join('\n').trim();
            reject(new Error(cleanErr || `Process exited with code ${code}`));
          }
        });
        proc.on('error', reject);
        const timer = setTimeout(() => { proc.kill(); reject(new Error('VRL execution timeout (10s)')); }, 10000);
        proc.on('close', () => clearTimeout(timer));
      });

      // stdout에서 JSON 부분만 추출 (앞뒤 로그 텍스트 제거)
      const raw = result.stdout.trim();
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        logger.warn({ stdout: raw.slice(0, 500), stderr: result.stderr.slice(0, 500) }, 'VRL produced no JSON output');
        return reply.send({
          success: false,
          error: result.stderr.trim() || 'VRL produced no JSON output.\nstdout: ' + (raw.slice(0, 200) || '(empty)'),
        });
      }
      const jsonStr = raw.slice(jsonStart, jsonEnd + 1);

      let output: Record<string, unknown>;
      try {
        output = JSON.parse(jsonStr);
      } catch {
        return reply.send({ success: false, error: 'Failed to parse VRL output as JSON:\n' + jsonStr.slice(0, 300) });
      }

      // 입력 필드는 제외하고 VRL이 생성한 필드만 추출
      const inputKeys = new Set(['message', 'equipment_type', 'log_type']);
      const fields: Array<{ name: string; value: unknown }> = [];

      const flatten = (obj: Record<string, unknown>, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (!prefix && inputKeys.has(key)) continue;
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            flatten(value as Record<string, unknown>, path);
          } else {
            fields.push({ name: path, value });
          }
        }
      };
      flatten(output);

      return reply.send({ success: true, output, fields });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, 'VRL simulation failed');
      return reply.send({ success: false, error: msg });
    } finally {
      try { if (existsSync(inputFile)) unlinkSync(inputFile); } catch { /* ignore */ }
      try { if (existsSync(vrlFile)) unlinkSync(vrlFile); } catch { /* ignore */ }
    }
  });

  /** VRL 코드를 aggregator TOML에 반영 + 파싱 룰 DB 동기화 */
  app.post('/api/monitor/vrl/apply', async (request, reply) => {
    const { equipmentType, vrlCode } = request.body as {
      equipmentType: string;
      vrlCode: string;
    };

    if (!equipmentType || !vrlCode) {
      return reply.status(400).send({ error: 'equipmentType and vrlCode are required' });
    }

    try {
      const tomlContent = readFileSync(VECTOR_CONFIG, 'utf-8');
      const eqType = equipmentType.toUpperCase();

      // source = ''' ... ''' 블록 내부의 VRL 코드 추출
      const sourceMatch = tomlContent.match(
        /(\[transforms\.parse_logs\][\s\S]*?source\s*=\s*''')([\s\S]*?)(''')/,
      );
      if (!sourceMatch) {
        return reply.status(400).send({ error: 'parse_logs source block not found in TOML' });
      }

      const vrlSource = sourceMatch[2];
      const updatedSource = replaceEquipmentBlock(vrlSource, eqType, vrlCode);
      if (updatedSource === null) {
        return reply.status(400).send({ error: `Equipment type "${eqType}" not found in VRL source` });
      }

      const newToml = tomlContent.replace(sourceMatch[2], updatedSource);

      // 백업 + 저장
      createTomlBackup('vrl-apply');
      writeFileSync(VECTOR_CONFIG, newToml, 'utf-8');
      logger.info({ equipmentType: eqType }, 'VRL code applied to aggregator TOML');

      // 파싱 룰 로컬 파일 동기화
      let syncCount = 0;
      const extracted = extractVrlFields(newToml);
      if (extracted[eqType] && extracted[eqType].length > 0) {
        try {
          const fields = extracted[eqType].map((fieldName: string, i: number) => ({
            fieldName,
            fieldLabel: fieldName,
            fieldOrder: i + 1,
          }));
          setFieldsByEquipment(eqType, fields);
          syncCount = fields.length;
          logger.info({ equipmentType: eqType, syncCount }, 'Parse rules synced to local file after VRL apply');
        } catch (syncErr) {
          logger.warn({ err: syncErr }, 'Failed to sync parse rules to local file after VRL apply');
        }
      }

      return reply.send({ success: true, message: 'VRL applied', syncCount });
    } catch (err) {
      logger.error(err, 'Failed to apply VRL to TOML');
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** .env 설정 저장 (허용된 키만 업데이트) */
  app.put('/api/monitor/config', async (request, reply) => {
    const ALLOWED_KEYS = new Set([
      'HOST', 'PORT', 'NODE_ENV',
      'ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING', 'ORACLE_POOL_MIN', 'ORACLE_POOL_MAX',
      'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD',
      'QUEUE_CONCURRENCY', 'BATCH_SIZE', 'BATCH_TIMEOUT_MS',
      'RAW_LOG_BASE_PATH', 'HEARTBEAT_TTL_SECONDS',
    ]);
    const RESTART_KEYS = new Set([
      'HOST', 'PORT', 'NODE_ENV',
      'ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING', 'ORACLE_POOL_MIN', 'ORACLE_POOL_MAX',
      'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD',
    ]);

    const body = request.body as Record<string, string>;
    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_KEYS.has(key) && value !== '••••••••') {
        updates[key] = String(value);
      }
    }
    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ success: false, error: 'No valid keys to update' });
    }

    try {
      const envPath = join(process.cwd(), '.env');
      let envContent = readFileSync(envPath, 'utf-8');

      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
        updateEnvValue(key as keyof Env, value);
      }
      writeFileSync(envPath, envContent, 'utf-8');

      const needsRestart = Object.keys(updates).some(k => RESTART_KEYS.has(k));
      logger.info({ updated: Object.keys(updates), needsRestart }, 'Config updated via API');
      return reply.send({ success: true, updated: Object.keys(updates), needsRestart });
    } catch (err) {
      logger.error(err, 'Failed to update config');
      return reply.status(500).send({ success: false, error: String(err) });
    }
  });

  /** Oracle 접속 테스트 */
  app.post('/api/monitor/test-connection', async (request, reply) => {
    const { type } = request.body as { type: 'oracle' };
    const start = Date.now();

    try {
      if (type === 'oracle') {
        const conn = await getConnection();
        try {
          await conn.execute('SELECT 1 FROM DUAL');
          return reply.send({ success: true, latencyMs: Date.now() - start });
        } finally {
          await conn.close();
        }
      } else {
        return reply.code(400).send({ success: false, error: 'Invalid type: must be oracle' });
      }
    } catch (err: any) {
      return reply.send({
        success: false,
        latencyMs: Date.now() - start,
        error: err.message || String(err),
      });
    }
  });

  /** 시스템 환경설정 조회 (비밀번호 마스킹) */
  app.get('/api/monitor/config', async (_request, reply) => {
    const oracleConnParts = env.ORACLE_CONNECT_STRING.split('/');
    const oracleHost = oracleConnParts[0] || env.ORACLE_CONNECT_STRING;
    const oracleService = oracleConnParts[1] || '—';

    return reply.send({
      server: {
        host: env.HOST,
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        memoryUsage: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      },
      oracle: {
        host: oracleHost,
        service: oracleService,
        connectString: env.ORACLE_CONNECT_STRING,
        user: env.ORACLE_USER,
        password: env.ORACLE_PASSWORD ? '••••••••' : '',
        poolMin: env.ORACLE_POOL_MIN,
        poolMax: env.ORACLE_POOL_MAX,
      },
      storage: {
        rawLogBasePath: env.RAW_LOG_BASE_PATH,
      },
      heartbeat: {
        ttlSeconds: env.HEARTBEAT_TTL_SECONDS,
      },
    });
  });

  // ─── 통합 파이프라인 상태 API ───

  /** 모든 agent의 5단계 파이프라인 진행률을 한 번에 조회 */
  app.get('/api/monitor/pipeline-status', async (_request, reply) => {
    try {
      // 1) agent TOML 목록 + 각 TOML에서 equipment_type 추출
      if (!existsSync(AGENT_CONFIG_DIR)) mkdirSync(AGENT_CONFIG_DIR, { recursive: true });
      const files = readdirSync(AGENT_CONFIG_DIR)
        .filter(f => f.endsWith('.toml') && !f.endsWith('.bak.toml'))
        .map(f => f.replace('.toml', ''))
        .sort();

      const agentToml: Record<string, string> = {};
      const equipTypes: Record<string, string> = {};
      for (const name of files) {
        try {
          const content = readFileSync(agentPath(name), 'utf-8');
          agentToml[name] = content;
          equipTypes[name] = (content.match(/\.equipment_type\s*=\s*"([^"]*)"/)?.[1] ?? '').trim();
        } catch { agentToml[name] = ''; equipTypes[name] = ''; }
      }

      // 2) aggregator config 존재 여부
      let aggOk = false;
      try { aggOk = readFileSync(VECTOR_CONFIG, 'utf-8').trim().length > 0; } catch { /* */ }

      // 3) parseRules
      const parseRules = readParseFields();

      // 4) registry
      const registry = readRegistry();
      const registryTables = getRegisteredTableNames();
      const registryProcs = getRegisteredProcedureKeys();

      // matchesType 유틸
      const matchType = (name: string, type: string) => {
        if (!type) return false;
        return new RegExp(`(^|[_.])${type}([_.]|$)`, 'i').test(name);
      };

      // 5) VRL target-map (설비별 TABLE/PROCEDURE 설정)
      let targetMap: Record<string, { targetTable: string; targetType: string }> = {};
      try {
        const aggToml = readFileSync(VECTOR_CONFIG, 'utf-8');
        const srcMatch = aggToml.match(/\[transforms\.parse_logs\][\s\S]*?source\s*=\s*'''([\s\S]*?)'''/);
        if (srcMatch) {
          const vrlSrc = srcMatch[1];
          const eqMatches = vrlSrc.matchAll(/\.equipment_type\s*==\s*"([^"]+)"/g);
          for (const m of eqMatches) {
            const block = extractEquipmentBlock(vrlSrc, m[1]);
            if (!block) continue;
            const tblM = block.match(/\.target_table\s*=\s*"([^"]+)"/);
            const typM = block.match(/\.target_type\s*=\s*"([^"]+)"/);
            targetMap[m[1]] = { targetTable: tblM?.[1] || `LOG_INSPECTION`, targetType: typM?.[1] || 'TABLE' };
          }
        }
      } catch { /* ignore */ }

      // 6) 각 agent별 5단계 판정
      const agents: Record<string, {
        steps: { sender: boolean; receiver: boolean; vrl: boolean; table: boolean; mapping: boolean };
        equipmentType: string;
        doneCount: number;
        targetType?: string;
        targetTable?: string;
      }> = {};

      for (const name of files) {
        const et = equipTypes[name];
        const toml = agentToml[name];
        const tomlStatus = analyzeTomlStatus(toml);
        const senderOk = tomlStatus.equip && tomlStatus.connection && tomlStatus.logPath;

        const vrlOk = et ? (parseRules[et]?.length ?? 0) > 0 : false;

        const mTbl = registryTables.filter(t => matchType(t, et));
        const mProc = registryProcs.filter(p => matchType(p, et));
        const tableOk = mTbl.length + mProc.length > 0;

        let mappingOk = false;
        if (tableOk) {
          for (const tName of mTbl) {
            const entry = registry[tName];
            if (entry && !isProcedureEntry(entry)) {
              if (entry.some((col: RegistryColumn) => !!col.SOURCE_FIELD)) { mappingOk = true; break; }
            }
          }
          if (!mappingOk) {
            for (const pKey of mProc) {
              const entry = registry[pKey];
              if (entry && isProcedureEntry(entry)) {
                if (entry.params.some((p: ProcedureParam) => !!p.SOURCE_FIELD)) { mappingOk = true; break; }
              }
            }
          }
        }

        const steps = {
          sender: senderOk,
          receiver: aggOk,
          vrl: vrlOk,
          table: tableOk,
          mapping: mappingOk,
        };
        const doneCount = Object.values(steps).filter(Boolean).length;
        const tm = et ? targetMap[et] : undefined;
        agents[name] = { steps, equipmentType: et, doneCount, targetType: tm?.targetType, targetTable: tm?.targetTable };
      }

      return reply.send({ agents });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });
};

/**
 * Aggregator VRL source에 새 설비 블록을 자동 추가
 * - 이미 존재하면 스킵
 * - 마지막 `} else {` 앞에 블록 삽입
 */
function addEquipmentToAggregatorVrl(name: string): void {
  const tomlContent = readFileSync(VECTOR_CONFIG, 'utf-8');

  // 이미 해당 설비 블록이 존재하면 스킵
  if (tomlContent.includes(`.equipment_type == "${name}"`)) {
    logger.info({ name }, 'Equipment block already exists in aggregator VRL, skipping');
    return;
  }

  const newBlock = `} else if .equipment_type == "${name}" {
  # ── ${name} ──
  if .log_type == "INSPECTION" {
    .data = {}
  } else if .log_type == "ALARM" {
    .data = {}
  } else if .log_type == "PROCESS" {
    .data = {}
  } else {
    .data = {}
  }

`;

  // 마지막 `} else {` 앞에 삽입 (Unknown equipment_type 처리 블록 앞)
  const lastElseIdx = tomlContent.lastIndexOf('} else {');
  if (lastElseIdx === -1) {
    logger.warn({ name }, 'Could not find "} else {" in aggregator VRL, skipping auto-insert');
    return;
  }

  const updated = tomlContent.substring(0, lastElseIdx) + newBlock + tomlContent.substring(lastElseIdx);
  writeFileSync(VECTOR_CONFIG, updated, 'utf-8');
  logger.info({ name }, 'Equipment block added to aggregator VRL');
}

/**
 * Aggregator VRL source에서 설비 블록을 제거
 * - 존재하지 않으면 스킵
 * - 첫 번째 블록(if) 제거 시 다음 블록을 if로 변환
 */
function removeEquipmentFromAggregatorVrl(name: string): void {
  const tomlContent = readFileSync(VECTOR_CONFIG, 'utf-8');

  if (!tomlContent.includes(`.equipment_type == "${name}"`)) {
    logger.info({ name }, 'Equipment block not found in aggregator VRL, skipping removal');
    return;
  }

  const sourceMatch = tomlContent.match(
    /(\[transforms\.parse_logs\][\s\S]*?source\s*=\s*''')([\s\S]*?)(''')/,
  );
  if (!sourceMatch) return;

  const vrlSource = sourceMatch[2];
  const lines = vrlSource.split('\n');

  // 헤더 라인 탐색 (} else if ... 또는 if ...)
  const elseIfRe = new RegExp(
    `^\\s*\\}\\s*else\\s+if\\s+\\.equipment_type\\s*==\\s*"${name}"\\s*\\{\\s*$`,
  );
  const ifRe = new RegExp(
    `^\\s*if\\s+\\.equipment_type\\s*==\\s*"${name}"\\s*\\{\\s*$`,
  );

  let headerIdx = -1;
  let isFirstBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (elseIfRe.test(lines[i])) { headerIdx = i; break; }
    if (ifRe.test(lines[i])) { headerIdx = i; isFirstBlock = true; break; }
  }
  if (headerIdx === -1) return;

  // 중괄호 깊이 추적으로 블록 끝 탐색
  let depth = 1;
  let closingIdx = -1;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) { closingIdx = i; break; }
      }
    }
    if (closingIdx !== -1) break;
  }
  if (closingIdx === -1) return;

  // 블록 제거: [headerIdx, closingIdx) 범위 삭제
  const newLines = [...lines.slice(0, headerIdx), ...lines.slice(closingIdx)];

  // 첫 번째 블록 제거 시: 다음 블록의 "} else if" → "if"로 변환
  if (isFirstBlock) {
    for (let i = headerIdx; i < newLines.length; i++) {
      const fixed = newLines[i].replace(/^\s*\}\s*else\s+if\s+/, 'if ');
      if (fixed !== newLines[i]) {
        newLines[i] = fixed;
        break;
      }
    }
  }

  const newToml = tomlContent.replace(sourceMatch[2], newLines.join('\n'));
  // 백업은 DELETE 핸들러에서 처리 (createTomlBackup은 route 스코프 내부 함수)
  writeFileSync(VECTOR_CONFIG, newToml, 'utf-8');
  logger.info({ name }, 'Equipment block removed from aggregator VRL');
}

/** AI VRL 생성용 기본 시스템 프롬프트 */
function getDefaultVrlSystemPrompt(): string {
  return `You are a VRL (Vector Remap Language) expert for the Vector log collection tool.
Your task: parse a raw log into structured .data.FIELD fields.

CRITICAL VRL syntax rules:
- Input: .message contains the raw log string (may be single-line or multi-line)
- Infallible "!" suffix rules:
  MUST use "!": get!(), to_string!(), slice!(), split!(.message, ...) — these can fail
  MUST NOT use "!": strip_whitespace(), split() when input is from to_string!() — these are already infallible on string input
- Get element: get!(array, [index]) — returns "any" type, use "!" because index may be out of bounds
- To use string functions on get! results, wrap with to_string! first
- ALL fields MUST be parsed as STRING. NEVER use to_int!(), to_float!(), or any numeric conversion.
  Always use: strip_whitespace(to_string!(get!(cols, [N])))
  Reason: equipment logs contain unexpected values like "CC", "N/A", "-" in numeric columns.
  Type conversion is handled at the DB insert layer, not in VRL.
- Use UPPERCASE_SNAKE_CASE for field names
- Only assign to .data.* fields (NEVER .FIELD directly)
- for_each requires explicit type via array!(): for_each(array!(items)) -> |_idx, row| { ... }
- push() returns new array: .data.ITEMS = push(.data.ITEMS, item)
- NEVER use "if" inside object literals { "key": if ... }. VRL forbids this.
  Instead, compute the value BEFORE the object and use a variable:
    val = if condition { x } else { y }
    item = { "KEY": val }
- NEVER use null in VRL. Use "" as default instead.

PATTERN 1 — Single-line CSV (no header):
  values = split!(.message, ",")
  .data.NAME = strip_whitespace(to_string!(get!(values, [0])))
  .data.COUNT = strip_whitespace(to_string!(get!(values, [1])))

PATTERN 2 — Multi-line CSV with header row (MOST COMMON for equipment logs):
  lines = split!(.message, "\\n")
  # Skip header (line 0), parse first data row (line 1)
  first_row = split(to_string!(get!(lines, [1])), ",")
  .data.BARCODE = strip_whitespace(to_string!(get!(first_row, [0])))
  .data.RESULT = strip_whitespace(to_string!(get!(first_row, [2])))
  .data.VALUE = strip_whitespace(to_string!(get!(first_row, [5])))

  # Parse ALL data rows into array:
  .data.DETAILS = []
  detail_lines = slice!(lines, 1)
  for_each(array!(detail_lines)) -> |_idx, row| {
    if row != "" {
      cols = split(to_string!(row), ",")
      item = {
        "BARCODE": strip_whitespace(to_string!(get!(cols, [0]))),
        "RESULT": strip_whitespace(to_string!(get!(cols, [2]))),
      }
      .data.DETAILS = push(.data.DETAILS, item)
    }
  }

PATTERN 3 — Key=Value or fixed-format logs:
  # Use parse_key_value!, parse_csv!, parse_json!, regex patterns as needed.

STRATEGY:
1. Look at the sample log structure carefully — identify if it has a header row.
2. For CSV with headers: use PATTERN 2. Map EVERY column from the header to a .data.FIELD.
3. Parse the first data row into individual .data.FIELD values for the board/summary info.
4. If multiple data rows exist, also parse them into a .data.DETAILS or .data.ITEMS array.
5. Name fields exactly matching the header column names (converted to UPPERCASE_SNAKE_CASE, spaces/special chars replaced with _).
6. ALL columns are parsed as strings — no numeric conversion. DB handles type casting at insert time.

IMPORTANT: Return ONLY the VRL code. No markdown, no explanations, no code fences.`;
}

/** 새 설비용 기본 TOML 템플릿 */
function getDefaultAgentToml(name: string): string {
  return `# =============================================================================
#  Vector Agent (송신기) - ${name} 설비
# =============================================================================

data_dir = "C:\\\\vector-data-${name.toLowerCase()}"

[api]
enabled = true
address = "127.0.0.1:8686"

[sources.work_logs]
type = "file"
include = [
  "C:\\\\logs\\\\${name.toLowerCase()}\\\\*.txt",
  "C:\\\\logs\\\\${name.toLowerCase()}\\\\*.csv",
  "C:\\\\logs\\\\${name.toLowerCase()}\\\\*.log",
]
read_from = "beginning"
fingerprint.strategy = "checksum"
fingerprint.lines = 1
ignore_older_secs = 86400

# ── [하트비트] 주기적 상태 전송 (30초 간격) ──
[sources.heartbeat]
type = "static_metrics"
interval_secs = 30
namespace = "agent"

[[sources.heartbeat.metrics]]
name = "heartbeat"
kind = "absolute"

[sources.heartbeat.metrics.value.gauge]
value = 1

[sources.heartbeat.metrics.tags]
equipment_type = "${name}"
equipment_id = "${name}-001"
line_code = "LINE-01"
log_type = "INSPECTION"

[transforms.add_metadata]
type = "remap"
inputs = ["work_logs"]
source = '''
.equipment_type = "${name}"
.log_type = "INSPECTION"
.line_code = "LINE-01"
.equipment_id = "${name}-001"
'''

[sinks.to_aggregator]
type = "vector"
inputs = ["add_metadata", "heartbeat"]
address = "127.0.0.1:6000"

[sinks.to_aggregator.buffer]
type = "disk"
max_size = 268435488
when_full = "block"
`;
}


function getTableStats() {
  try {
    const registry = readRegistry();
    return Object.entries(registry)
      .filter(([, entry]) => !isProcedureEntry(entry))
      .map(([tableName, columns]) => ({
        TABLE_NAME: tableName,
        COLUMN_COUNT: Array.isArray(columns) ? columns.length : 0,
      }))
      .sort((a, b) => a.TABLE_NAME.localeCompare(b.TABLE_NAME));
  } catch {
    return [];
  }
}

/** 서버 시작 시 1회 실행 — Oracle에 없는 테이블/프로시져를 레지스트리에서 제거 */
async function cleanupOrphanedRegistry() {
  try {
    const registry = readRegistry();
    const keys = Object.keys(registry);
    if (keys.length === 0) return;

    const conn = await getConnection();
    try {
      const tblRes = await conn.execute(`SELECT TABLE_NAME FROM USER_TABLES`);
      const tables = new Set((tblRes.rows as Array<{ TABLE_NAME: string }>).map(r => r.TABLE_NAME));

      const objRes = await conn.execute(`SELECT OBJECT_NAME FROM USER_OBJECTS WHERE OBJECT_TYPE IN ('PROCEDURE','PACKAGE')`);
      const procs = new Set((objRes.rows as Array<{ OBJECT_NAME: string }>).map(r => r.OBJECT_NAME));

      const removed: string[] = [];
      for (const [key, entry] of Object.entries(registry)) {
        if (isProcedureEntry(entry)) {
          const procName = entry.procedureName.split('.')[0];
          if (!procs.has(procName)) {
            deleteTarget(key);
            removed.push(key);
          }
        } else {
          if (!tables.has(key)) {
            deleteTarget(key);
            removed.push(key);
          }
        }
      }

      if (removed.length > 0) {
        logger.info({ removed }, 'Startup cleanup: removed orphaned registry entries');
      }
    } finally {
      await conn.close();
    }
  } catch (err) {
    logger.warn({ err }, 'Startup registry cleanup skipped (Oracle unavailable)');
  }
}

// 서버 시작 시 1회 정리
cleanupOrphanedRegistry();

function getRecentErrors() {
  return errorLogRepository.query({ status: 'ERROR', limit: 20 }).logs;
}

function getRecentLogs() {
  return errorLogRepository.query({ limit: 100 }).logs;
}

/** 시스템 메모리 사용량 조회 */
function getMemoryInfo() {
  const total = totalmem();
  const free = freemem();
  const used = total - free;
  return { total, used, free, percent: Math.round((used / total) * 100) };
}

/** CPU 사용률 조회 (직전 1초 평균) */
let prevCpuIdle = 0;
let prevCpuTotal = 0;
let cachedCpuPercent = 0;

function getCpuInfo() {
  const cores = cpus();
  let idle = 0;
  let total = 0;
  for (const c of cores) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  if (prevCpuTotal > 0) {
    const dTotal = total - prevCpuTotal;
    const dIdle = idle - prevCpuIdle;
    cachedCpuPercent = dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 100) : 0;
  }
  prevCpuIdle = idle;
  prevCpuTotal = total;
  return { percent: cachedCpuPercent, cores: cores.length, model: cores[0]?.model ?? '' };
}

/** 서버 디스크 사용량 조회 (C: 드라이브 기준, Linux는 /) */
function getDiskInfo(): { total: number; used: number; free: number; percent: number } | null {
  try {
    if (platform() === 'win32') {
      const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:csv', { encoding: 'utf-8', windowsHide: true });
      const lines = out.trim().split('\n').filter(l => l.trim());
      const last = lines[lines.length - 1].split(',');
      const free = Number(last[1]);
      const total = Number(last[2]);
      const used = total - free;
      return { total, used, free, percent: Math.round((used / total) * 100) };
    }
    const out = execSync("df -B1 / | tail -1 | awk '{print $2,$3,$4}'", { encoding: 'utf-8', windowsHide: true });
    const [t, u, f] = out.trim().split(/\s+/).map(Number);
    return { total: t, used: u, free: f, percent: Math.round((u / t) * 100) };
  } catch {
    return null;
  }
}

async function checkOracle() {
  try {
    const conn = await getConnection();
    try {
      await conn.execute('SELECT 1 FROM DUAL');
      return { connected: true };
    } finally {
      await conn.close();
    }
  } catch {
    return { connected: false };
  }
}


/**
 * VRL source 블록에서 특정 설비 유형의 코드를 새 VRL 코드로 교체
 *
 * 동작 원리:
 *   1. `if .equipment_type == "TYPE" {` 또는 `} else if .equipment_type == "TYPE" {` 헤더 탐색
 *   2. 중괄호 깊이 추적으로 블록 끝 탐색
 *   3. 헤더와 닫는 줄 사이 내용을 새 코드로 교체
 */
/**
 * VRL source 블록에서 특정 설비 유형의 기존 코드를 추출하여 반환
 */
function extractEquipmentBlock(vrlSource: string, equipmentType: string): string | null {
  const lines = vrlSource.split('\n');

  const headerPattern = new RegExp(
    `(?:}\\s*else\\s+)?if\\s+\\.equipment_type\\s*==\\s*"${equipmentType}"\\s*\\{`,
  );
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i].trim())) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  let depth = 1;
  let closingIdx = -1;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) { closingIdx = i; break; }
      }
    }
    if (closingIdx !== -1) break;
  }
  if (closingIdx === -1) return null;

  // 헤더+1 ~ 닫는줄-1 사이의 코드를 추출, 앞쪽 공통 인덴트 제거
  const blockLines = lines.slice(headerIdx + 1, closingIdx);
  const minIndent = blockLines
    .filter(l => l.trim().length > 0)
    .reduce((min, l) => Math.min(min, l.length - l.trimStart().length), Infinity);
  const dedented = blockLines
    .map(l => l.trim().length === 0 ? '' : l.slice(minIndent))
    .join('\n')
    .trim();

  return dedented;
}

function replaceEquipmentBlock(vrlSource: string, equipmentType: string, newCode: string): string | null {
  const lines = vrlSource.split('\n');

  // 헤더 라인 탐색
  const headerPattern = new RegExp(
    `(?:}\\s*else\\s+)?if\\s+\\.equipment_type\\s*==\\s*"${equipmentType}"\\s*\\{`,
  );
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i].trim())) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  // 중괄호 깊이 추적으로 블록 끝 탐색
  // 헤더 라인의 마지막 `{`에서 depth=1로 시작
  let depth = 1;
  let closingIdx = -1;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          closingIdx = i;
          break;
        }
      }
    }
    if (closingIdx !== -1) break;
  }
  if (closingIdx === -1) return null;

  // 새 VRL 코드를 2스페이스 인덴트로 포맷
  const indent = '  ';
  const indentedCode = newCode.split('\n')
    .map(l => l.trim() ? indent + l : '')
    .join('\n');

  // 헤더~닫는줄 사이 내용 교체
  const newLines = [
    ...lines.slice(0, headerIdx + 1),
    indentedCode,
    ...lines.slice(closingIdx),
  ];

  return newLines.join('\n');
}

/**
 * Aggregator TOML의 VRL source에서 설비 유형별 .data.* 필드를 추출
 *
 * VRL 코드 구조:
 *   if .equipment_type == "AOI" {
 *     .data.INSPECTOR = get!(board, [0])
 *     .data.MODEL     = get!(board, [1])
 *   } else if .equipment_type == "SP" { ... }
 *
 * → { AOI: ["data.INSPECTOR", "data.MODEL"], SP: [...] }
 */
function extractVrlFields(tomlContent: string): Record<string, string[]> {
  // source = ''' ... ''' 블록 추출 (parse_logs transform)
  const sourceMatch = tomlContent.match(
    /\[transforms\.parse_logs\][\s\S]*?source\s*=\s*'''([\s\S]*?)'''/,
  );
  if (!sourceMatch) return {};

  const vrlSource = sourceMatch[1];
  const result: Record<string, string[]> = {};
  let currentType: string | null = null;

  for (const line of vrlSource.split('\n')) {
    const trimmed = line.trim();

    // equipment_type 블록 감지: if/else if .equipment_type == "XXX"
    const typeMatch = trimmed.match(
      /(?:else\s+)?if\s+\.equipment_type\s*==\s*"([A-Z_]+)"/,
    );
    if (typeMatch) {
      currentType = typeMatch[1];
      if (!result[currentType]) result[currentType] = [];
      continue;
    }

    // .data.FIELD = 값 패턴 추출 (배열/객체 초기화 = [] / {} 제외)
    if (currentType) {
      const fieldMatch = trimmed.match(/^\.data\.([A-Z][A-Z0-9_]*)\s*=(.*)/);
      if (fieldMatch) {
        const rhs = fieldMatch[2].trim();
        if (rhs.startsWith('[') || rhs.startsWith('{')) continue;
        const fieldName = `data.${fieldMatch[1]}`;
        if (!result[currentType].includes(fieldName)) {
          result[currentType].push(fieldName);
        }
      }
    }
  }

  return result;
}
