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
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, mkdirSync, statSync, copyFileSync, rmSync, createReadStream } from 'fs';
import { join, dirname, basename } from 'path';
import { tmpdir, platform, cpus, totalmem, freemem } from 'os';
import { spawn, execSync } from 'child_process';
import { heartbeatService } from '../../services/heartbeat.service.js';
import { getConnection } from '../../database/oracle.pool.js';
import { logger, localNow, localISOString } from '../../utils/logger.js';
import { logBuffer } from '../../utils/log-buffer.js';
import iconv from 'iconv-lite';
import { errorLogRepository } from '../../database/repositories/error-log.repository.js';
import { saveRawLogFile } from './log-ingest.route.js';
import { env, updateEnvValue } from '../../config/env.js';
import type { Env } from '../../config/env.js';
import { getVectorStatus, startVector, stopVector, VECTOR_BIN, VECTOR_CONFIG, AGENT_CONFIG_DIR, FLUENT_CONFIG_DIR } from '../../services/vector-process.service.js';
import type { LogRecord, EquipmentStatus } from '../../types/index.js';
import { equipmentRegistry } from '../../services/equipment-registry.service.js';

/**
 * Win7(Vector 0.38) 호환 TOML 변환
 * 하트비트: Agent Manager가 직접 HTTP POST로 전송 (Vector TOML에서 제거)
 */
// convertTomlForWin7 — 제거됨: generator 타입으로 통일하여 변환 불필요
import {
  readRegistry, setTableColumns, getRegisteredTableNames,
  setProcedure, getProcedure, deleteTarget, getRegisteredProcedureKeys,
  isProcedureEntry, type RegistryColumn, type ProcedureEntry, type ProcedureParam,
} from '../../config/local-registry.js';
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
    const ts = localNow().replace(' ', '_').replace(/:/g, '-');
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
        timestamp: localISOString(),
        nodeEnv: process.env.NODE_ENV ?? 'development',
        ...(disk && { disk }),
        memory: mem,
        cpu,
      },
      oracle: oracleStatus.status === 'fulfilled' ? oracleStatus.value : { connected: false },
      vector: vectorStatus.status === 'fulfilled'
        ? vectorStatus.value
        : { running: false, pid: null, apiReachable: false, uptime: null, version: null },
      equipments: (() => {
        const heartbeats = equipments.status === 'fulfilled' ? equipments.value : [];
        const heartbeatMap = new Map(heartbeats.map(h => [h.equipment_id, h]));
        const registry = equipmentRegistry.getAll();
        const ttlMs = env.HEARTBEAT_TTL_SECONDS * 1000;
        const now = Date.now();
        const result: EquipmentStatus[] = [];

        // 레지스트리 기준으로 전체 장비 표시
        for (const [id, entry] of Object.entries(registry)) {
          const hb = heartbeatMap.get(id);
          const online = hb ? hb.online : (now - new Date(entry.last_seen).getTime() < ttlMs);
          result.push({
            equipment_id: id,
            online,
            last_seen: hb?.last_seen || entry.last_seen,
            metadata: {
              equipment_type: entry.equipment_type,
              line_code: entry.line_code,
              description: entry.description,
              excluded: String(entry.excluded),
              registered_at: entry.registered_at,
              ...(hb?.metadata || {}),
            },
          });
          heartbeatMap.delete(id);
        }

        // 레지스트리에 없는 하트비트만 남은 것 추가
        for (const hb of heartbeatMap.values()) {
          result.push(hb);
        }

        return mergeEquipmentDescriptions(result);
      })(),
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

  /** Vector aggregator 리로드 (stop → start) */
  app.post('/api/monitor/vector/reload', async (_request, reply) => {
    try {
      const stopResult = await stopVector();
      if (!stopResult.success) {
        return reply.status(400).send({ success: false, message: `Stop failed: ${stopResult.message}` });
      }
      await new Promise(r => setTimeout(r, 1500));
      const startResult = await startVector();
      const msg = startResult.success
        ? `Vector reloaded (PID: ${startResult.message.match(/\d+/)?.[0] ?? '?'})`
        : `Restart partial: stopped OK, start issue: ${startResult.message}`;
      errorLogRepository.success('VECTOR_CONTROL', 'VECTOR_PROCESS', 'SYSTEM', msg);
      return reply.send({ success: startResult.success, message: msg });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, 'Failed to reload Vector');
      return reply.status(500).send({ success: false, message: msg });
    }
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

  /** Vector aggregator TOML 설정 저장 (validate → 백업 → 저장) */
  app.put('/api/monitor/aggregator/config', async (request, reply) => {
    const { content, skipValidation } = request.body as { content: string; skipValidation?: boolean };
    if (typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Invalid content' });
    }

    // vector validate 실행 (skipValidation이 아닌 경우)
    if (!skipValidation) {
      const tmpPath = join(VECTOR_CONFIG + '.validate.tmp');
      try {
        writeFileSync(tmpPath, content, 'utf-8');
        const { execSync } = await import('child_process');
        execSync(`"${VECTOR_BIN}" validate --no-environment "${tmpPath}"`, {
          timeout: 15000,
          windowsHide: true,
        });
      } catch (validateErr: any) {
        try { unlinkSync(tmpPath); } catch {}
        const stderr = validateErr.stderr?.toString?.() || '';
        const stdout = validateErr.stdout?.toString?.() || '';
        const details = stderr || stdout || validateErr.message || 'Unknown error';
        logger.warn({ details }, 'Aggregator config validation failed');
        return reply.status(400).send({ error: 'Validation failed', details });
      }
      try { unlinkSync(tmpPath); } catch {}
    }

    try {
      const backupName = createTomlBackup('editor');
      writeFileSync(VECTOR_CONFIG, content, 'utf-8');
      logger.info('Aggregator config updated via API');
      errorLogRepository.success('FILE_WRITE', 'AGGREGATOR_CONFIG', 'SYSTEM', 'Config saved');

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
          createdAt: (() => { const d = stat.mtime; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; })(),
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

  /** Vector 실행파일(zip) 다운로드 — ?edition=x86 으로 32-bit 선택 */
  app.get('/api/monitor/download/vector-zip', async (_request, reply) => {
    const edition = (_request.query as { edition?: string }).edition;
    const zipMap: Record<string, string> = { win7: 'vector-win7.zip', x86: 'vector-x86.zip', 'win7-x86': 'vector-x86.zip' };
    const zipFile = zipMap[edition ?? ''] ?? 'vector.zip';
    const zipPath = join(process.cwd(), 'vector-bin', zipFile);
    if (!existsSync(zipPath)) {
      return reply.status(404).send({ error: `${zipFile} not found` });
    }
    try {
      const stat = statSync(zipPath);
      const stream = createReadStream(zipPath);
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${zipFile}"`)
        .header('Content-Length', stat.size)
        .send(stream);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Agent Manager 다운로드 — Go 단일 exe (x64/x86) */
  app.get('/api/monitor/download/agent-manager', async (request, reply) => {
    const { arch } = request.query as { arch?: string };
    const fileName = arch === 'x86' ? 'agent-manager-x86.exe' : 'agent-manager-x64.exe';
    const filePath = join(process.cwd(), 'vector-bin', fileName);
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: `${fileName} not found` });
    }
    try {
      const stat = statSync(filePath);
      const stream = createReadStream(filePath);
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${fileName}"`)
        .header('Content-Length', stat.size)
        .send(stream);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 설비별 Agent TOML 다운로드 */
  app.get('/api/monitor/download/agent/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const edition = (request.query as { edition?: string }).edition;
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

  /** Fluent Bit 실행파일(zip) 다운로드 */
  app.get('/api/monitor/download/fluent-bit', async (_request, reply) => {
    const zipPath = join(process.cwd(), 'vector-bin', 'fluent-bit.zip');
    if (!existsSync(zipPath)) {
      return reply.status(404).send({ error: 'fluent-bit.zip not found' });
    }
    try {
      const stat = statSync(zipPath);
      const stream = createReadStream(zipPath);
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', 'attachment; filename="fluent-bit.zip"')
        .header('Content-Length', stat.size)
        .send(stream);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Fluent Bit 설비 설정 목록 조회 */
  app.get('/api/monitor/agent-fluent/configs', async (_request, reply) => {
    try {
      if (!existsSync(FLUENT_CONFIG_DIR)) mkdirSync(FLUENT_CONFIG_DIR, { recursive: true });
      const files = readdirSync(FLUENT_CONFIG_DIR)
        .filter(f => f.endsWith('.conf'))
        .map(f => f.replace('.conf', ''));
      return reply.send({ names: files });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Fluent Bit 설비 설정 다운로드 */
  app.get('/api/monitor/download/agent-fluent/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      return reply.status(400).send({ error: 'Invalid name' });
    }
    const filePath = join(FLUENT_CONFIG_DIR, `${name}.conf`);
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    try {
      const content = readFileSync(filePath, 'utf-8');
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${name}.conf"`)
        .send(content);
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ─── Fluent Bit Agent 설정 CRUD API ───

  const fluentPath = (name: string) => join(FLUENT_CONFIG_DIR, `${name}.conf`);

  /** Fluent Bit 특정 설비 설정 조회 */
  app.get('/api/monitor/agent-fluent/config/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return reply.status(400).send({ error: 'Invalid name' });
    const filePath = fluentPath(name);
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Not found' });
    try {
      const content = readFileSync(filePath, 'utf-8');
      return reply.send({ content, filePath, name });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Fluent Bit 설비 설정 저장 (백업 포함) */
  app.put('/api/monitor/agent-fluent/config/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const { content } = request.body as { content: string };
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return reply.status(400).send({ error: 'Invalid name' });
    if (typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Invalid content' });
    }
    const filePath = fluentPath(name);
    try {
      if (existsSync(filePath)) {
        writeFileSync(filePath + '.bak', readFileSync(filePath, 'utf-8'), 'utf-8');
      }
      writeFileSync(filePath, content, 'utf-8');
      logger.info({ name }, 'Fluent Bit config updated');
      return reply.send({ success: true, backedUp: true });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 새 Fluent Bit 설비 생성 */
  app.post('/api/monitor/agent-fluent/configs', async (request, reply) => {
    const { name, content } = request.body as { name: string; content?: string };
    if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return reply.status(400).send({ error: 'Invalid name' });
    if (!existsSync(FLUENT_CONFIG_DIR)) mkdirSync(FLUENT_CONFIG_DIR, { recursive: true });
    const filePath = fluentPath(name);
    if (existsSync(filePath)) return reply.status(409).send({ error: 'Already exists' });
    try {
      writeFileSync(filePath, content || getDefaultFluentConf(name), 'utf-8');
      logger.info({ name }, 'Fluent Bit config created');
      return reply.send({ success: true, name });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** Fluent Bit 설비 설정 삭제 */
  app.delete('/api/monitor/agent-fluent/config/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return reply.status(400).send({ error: 'Invalid name' });
    const filePath = fluentPath(name);
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Not found' });
    try {
      unlinkSync(filePath);
      const bakPath = filePath + '.bak';
      if (existsSync(bakPath)) unlinkSync(bakPath);
      logger.info({ name }, 'Fluent Bit config deleted');
      return reply.send({ success: true });
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
    const { content, skipValidation } = request.body as { content: string; skipValidation?: boolean };
    if (!isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    if (typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Invalid content' });
    }

    // vector validate 실행
    if (!skipValidation) {
      const tmpPath = agentPath(name) + '.validate.tmp';
      try {
        writeFileSync(tmpPath, content, 'utf-8');
        const { execSync } = await import('child_process');
        execSync(`"${VECTOR_BIN}" validate --no-environment "${tmpPath}"`, {
          timeout: 15000,
          windowsHide: true,
        });
      } catch (validateErr: any) {
        // tmp 파일은 디버깅을 위해 남겨두지 않고 삭제
        try { unlinkSync(tmpPath); } catch {}
        const stderr = validateErr.stderr?.toString?.() || '';
        const stdout = validateErr.stdout?.toString?.() || '';
        const details = stderr || stdout || validateErr.message || 'Unknown error';
        logger.warn({ name, details }, 'Agent TOML validation failed');
        return reply.status(400).send({ error: 'Validation failed', details });
      }
      try { unlinkSync(tmpPath); } catch {}
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
      const descs = loadDescriptions();
      if (descs[name]) { delete descs[name]; saveDescriptions(descs); }
      logger.info({ name }, 'Agent config deleted (+ VRL block & parse-fields cleaned)');
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 설비 TOML 검증 — vector validate 실행 */
  app.post('/api/monitor/agent/config/:name/validate', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!isValidAgentName(name)) return reply.status(400).send({ error: 'Invalid name' });
    const filePath = agentPath(name);
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Not found' });

    try {
      const result = execSync(
        `"${VECTOR_BIN}" validate --no-environment "${filePath}"`,
        { encoding: 'utf-8', timeout: 10000, windowsHide: true },
      );
      return reply.send({
        valid: true,
        message: result.trim() || 'Validation passed',
      });
    } catch (err: any) {
      const output = (err.stdout || '') + (err.stderr || '');
      return reply.send({
        valid: false,
        message: output.trim() || err.message,
      });
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
      let renamedFrom: string | undefined;
      if (exists && body.forceRecreate) {
        const ts = localNow().replace(/[-: ]/g, '').slice(0, 14);
        const backupName = `${upperName}_BK_${ts}`;

        /* 1) 백업 테이블의 제약조건 이름 변경 (PK 등) — 새 테이블 생성 시 이름 충돌 방지 */
        const conRows = await conn.execute(
          `SELECT CONSTRAINT_NAME FROM USER_CONSTRAINTS WHERE TABLE_NAME = :t`,
          { t: upperName },
        );
        const bkSuffix = ts.slice(-6); // HHmmss — 초 단위까지 포함하여 고유성 보장
        for (const row of (conRows.rows as Array<{ CONSTRAINT_NAME: string }>) || []) {
          const newConName = `${row.CONSTRAINT_NAME}_${bkSuffix}`.slice(0, 30);
          await conn.execute(`ALTER TABLE ${upperName} RENAME CONSTRAINT ${row.CONSTRAINT_NAME} TO ${newConName}`).catch(() => {});
        }

        /* 2) 백업 테이블의 인덱스 이름 변경 */
        const idxRows = await conn.execute(
          `SELECT INDEX_NAME FROM USER_INDEXES WHERE TABLE_NAME = :t`,
          { t: upperName },
        );
        for (const row of (idxRows.rows as Array<{ INDEX_NAME: string }>) || []) {
          const newIdxName = `${row.INDEX_NAME}_${bkSuffix}`.slice(0, 30);
          await conn.execute(`ALTER INDEX ${row.INDEX_NAME} RENAME TO ${newIdxName}`).catch(() => {});
        }

        /* 3) 트리거 소스 백업 후 DROP — 새 테이블에 재적용하기 위해 */
        const trgRows = await conn.execute(
          `SELECT TRIGGER_NAME, TRIGGER_TYPE, TRIGGERING_EVENT, TRIGGER_BODY
           FROM USER_TRIGGERS WHERE TABLE_NAME = :t`,
          { t: upperName },
        );
        const triggerSources: Array<{ name: string; type: string; event: string; body: string }> = [];
        for (const row of (trgRows.rows as Array<{ TRIGGER_NAME: string; TRIGGER_TYPE: string; TRIGGERING_EVENT: string; TRIGGER_BODY: string }>) || []) {
          triggerSources.push({ name: row.TRIGGER_NAME, type: row.TRIGGER_TYPE, event: row.TRIGGERING_EVENT, body: row.TRIGGER_BODY });
          await conn.execute(`DROP TRIGGER ${row.TRIGGER_NAME}`).catch(() => {});
        }

        /* 4) 테이블 RENAME */
        await conn.execute(`ALTER TABLE ${upperName} RENAME TO ${backupName}`);
        renamedFrom = backupName;
        logger.info({ original: upperName, backup: backupName }, 'Table renamed as backup before recreate');
        await conn.execute(ddl);
        created = true;

        /* 5) 백업한 트리거를 새 테이블에 재적용 */
        for (const trg of triggerSources) {
          const timing = trg.type.includes('BEFORE') ? 'BEFORE' : 'AFTER';
          const eachRow = trg.type.includes('EACH ROW') ? 'FOR EACH ROW' : '';
          const createTrg = `CREATE OR REPLACE TRIGGER ${trg.name}\n${timing} ${trg.event} ON ${upperName}\n${eachRow}\n${trg.body}`;
          await conn.execute(createTrg).catch((err) => {
            logger.warn({ trigger: trg.name, err }, 'Failed to recreate trigger on new table');
          });
        }
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

      logger.info({ tableName: upperName, logType: body.logType, existed: exists, created, renamedFrom }, 'Auto-created/synced Oracle table + registry');
      return reply.send({ success: true, tableName: upperName, ddl, columns, tomlSync, alreadyExisted: exists && !body.forceRecreate, renamedFrom });
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
    const { table, limit: limitStr, startDate, endDate } = request.query as {
      table?: string; limit?: string; startDate?: string; endDate?: string;
    };
    if (!table || !/^[A-Z_][A-Z0-9_]*$/i.test(table)) {
      return reply.status(400).send({ error: 'Invalid or missing table name' });
    }
    const rowLimit = Math.min(Number(limitStr) || 50, 500);
    const tableName = table.toUpperCase();

    const conn = await getConnection();
    try {
      // 컬럼 목록 + 타입 조회
      const colResult = await conn.execute<{ COLUMN_NAME: string; DATA_TYPE: string }>(
        `SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS
         WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`,
        { t: tableName },
      );
      const colInfos = (colResult.rows ?? []) as { COLUMN_NAME: string; DATA_TYPE: string }[];
      const columns = colInfos.map(r => r.COLUMN_NAME);
      if (columns.length === 0) {
        return reply.send({ columns: [], rows: [] });
      }

      // TIMESTAMP/DATE 컬럼은 TO_CHAR로 변환 (JS Date 변환 방지)
      const tsTypes = new Set(['TIMESTAMP(6)', 'TIMESTAMP', 'DATE']);
      const selectCols = colInfos.map(r =>
        tsTypes.has(r.DATA_TYPE) ? `TO_CHAR(${r.COLUMN_NAME}, 'YYYY-MM-DD HH24:MI:SS') AS ${r.COLUMN_NAME}` : r.COLUMN_NAME,
      );

      // 날짜 필터 컬럼 결정 (LOG_TIMESTAMP 또는 CREATED_AT)
      const dateCol = columns.includes('LOG_TIMESTAMP') ? 'LOG_TIMESTAMP'
        : columns.includes('CREATED_AT') ? 'CREATED_AT' : null;

      // 데이터 조회 (최신순 + 날짜 필터)
      const binds: Record<string, unknown> = { lim: rowLimit };
      const whereClauses: string[] = [];
      if (dateCol && startDate) {
        whereClauses.push(`${dateCol} >= TO_TIMESTAMP(:sd, 'YYYY-MM-DD HH24:MI:SS')`);
        binds.sd = startDate.replace('T', ' ').length < 19 ? `${startDate.replace('T', ' ')}:00` : startDate.replace('T', ' ');
      }
      if (dateCol && endDate) {
        whereClauses.push(`${dateCol} <= TO_TIMESTAMP(:ed, 'YYYY-MM-DD HH24:MI:SS')`);
        binds.ed = endDate.replace('T', ' ').length < 19 ? `${endDate.replace('T', ' ')}:59` : endDate.replace('T', ' ');
      }
      const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const sql = `SELECT ${selectCols.join(', ')} FROM ${tableName}
                    ${whereStr} ORDER BY ROWID DESC FETCH FIRST :lim ROWS ONLY`;
      const result = await conn.execute(sql, binds);
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

  /** 선택된 오류 로그 삭제 — LOG_ID 배열로 개별 삭제 */
  app.post('/api/monitor/errors/delete', async (request, reply) => {
    try {
      const { logIds } = request.body as { logIds: number[] };
      if (!Array.isArray(logIds) || logIds.length === 0) {
        return reply.status(400).send({ error: 'logIds array required' });
      }
      const deleted = errorLogRepository.deleteByIds(logIds);
      logger.info({ deleted, requested: logIds.length }, 'Error logs deleted by IDs');
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
          try { await saveRawLogFile(logRecord); } catch (err) { logger.warn({ err, logId: rec.LOG_ID }, 'Failed to save raw log file on retry'); }
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
          try { await saveRawLogFile(logRecord); } catch (err) { logger.warn({ err, logId: rec.LOG_ID }, 'Failed to save raw log file on retry/all'); }
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

  /** 로그 파일 다운로드 — 단일 파일 스트림 전송 */
  app.get('/api/monitor/log-files/download', async (request, reply) => {
    const { path: relPath } = request.query as { path?: string };
    if (!relPath) {
      return reply.status(400).send({ error: 'path required' });
    }
    if (relPath.includes('..')) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const filePath = join(env.RAW_LOG_BASE_PATH, relPath);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      return reply.status(404).send({ error: 'File not found' });
    }
    try {
      const fileName = relPath.replace(/\\/g, '/').split('/').pop() || 'download';
      const stat = statSync(filePath);
      const stream = createReadStream(filePath);
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
        .header('Content-Length', stat.size)
        .send(stream);
    } catch (err) {
      logger.error({ err, relPath }, 'Failed to download log file');
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

  // ─── VRL 파싱 룰 조회 API (TOML에서 실시간 추출) ───

  /** 전체 파싱 룰 조회 — VRL 코드에서 data.* 필드 실시간 추출 */
  app.get('/api/monitor/parse-rules', async (_request, reply) => {
    try {
      const tomlContent = readFileSync(VECTOR_CONFIG, 'utf-8');
      const extracted = extractVrlFields(tomlContent);
      const rules: Record<string, Array<{ fieldName: string; fieldLabel: string; fieldOrder: number }>> = {};
      for (const [eqType, fields] of Object.entries(extracted)) {
        rules[eqType] = fields.map((f, i) => ({
          fieldName: f, fieldLabel: f, fieldOrder: i + 1,
        }));
      }
      return reply.send({ rules });
    } catch (err) {
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
    const { provider, sampleLog, equipmentType, userInstruction,
      logStructure, multiRowMode, hasHeader, headerLines, startRow, kvDelimiter, sectionMarkers,
    } = request.body as {
      provider: string;
      sampleLog: string;
      equipmentType: string;
      userInstruction?: string;
      logStructure?: string;
      multiRowMode?: string;
      hasHeader?: boolean;
      headerLines?: string;
      startRow?: string;
      kvDelimiter?: string;
      sectionMarkers?: string;
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

    // 로그 구조 옵션을 프롬프트에 포함
    const structureLines: string[] = [];
    if (logStructure) structureLines.push(`Log structure type: ${logStructure}`);
    if (logStructure === 'MULTI_ROW' && multiRowMode) structureLines.push(`Multi-row mode: ${multiRowMode}`);
    if (hasHeader !== undefined) structureLines.push(`Has header: ${hasHeader}`);
    if (hasHeader && headerLines) structureLines.push(`Header lines: ${headerLines}`);
    if (startRow) structureLines.push(`Data starts at row: ${startRow}`);
    if (kvDelimiter) structureLines.push(`Key-value delimiter: "${kvDelimiter}"`);
    if (sectionMarkers) structureLines.push(`Section markers: ${sectionMarkers}`);
    const structureInfo = structureLines.length > 0 ? `\nLog structure options:\n${structureLines.join('\n')}\n` : '';

    const userPrompt = `Equipment type: ${equipmentType}
${structureInfo}
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
        return reply.send({ equipmentType: eqType, code: '', logStructure: detectLogStructure('') });
      }
      return reply.send({ equipmentType: eqType, code, logStructure: detectLogStructure(code) });
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
      // Vector VRL 출력에 이스케이프되지 않은 제어 문자(TAB 등)가 있을 수 있으므로 치환
      const jsonStr = raw.slice(jsonStart, jsonEnd + 1)
        .replace(/"(?:[^"\\]|\\.)*"/g, (strLiteral) =>
          strLiteral.replace(/[\x00-\x1F\x7F]/g, (ch) =>
            `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
          ),
        );

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

  /**
   * 수동 로그 투입 — 누락 파일 재전송용
   * 1. TOML에서 해당 설비의 VRL 코드 자동 추출
   * 2. Vector VRL로 파싱 실행
   * 3. 파싱 결과를 /api/logs 파이프라인과 동일하게 DB INSERT
   */
  app.post('/api/monitor/vrl/manual-ingest', async (request, reply) => {
    const { equipmentType, equipmentId, logContent } = request.body as {
      equipmentType: string;
      equipmentId: string;
      logContent: string;
    };

    if (!equipmentType || !equipmentId || !logContent) {
      return reply.status(400).send({ error: 'equipmentType, equipmentId, logContent are required' });
    }

    const eqType = equipmentType.toUpperCase();

    try {
      // 1) TOML에서 VRL 코드 추출
      const tomlContent = readFileSync(VECTOR_CONFIG, 'utf-8');
      const sourceMatch = tomlContent.match(
        /\[transforms\.parse_logs\][\s\S]*?source\s*=\s*'''([\s\S]*?)'''/,
      );
      if (!sourceMatch) {
        return reply.status(500).send({ error: 'parse_logs source block not found in TOML' });
      }
      const vrlBlock = extractEquipmentBlock(sourceMatch[1], eqType);
      if (!vrlBlock) {
        return reply.status(404).send({ error: `No VRL block found for equipment type: ${eqType}` });
      }

      // 2) VRL 시뮬레이션 실행
      const ts = Date.now();
      const inputFile = join(tmpdir(), `manual-ingest-input-${ts}.json`);
      const vrlFile = join(tmpdir(), `manual-ingest-vrl-${ts}.vrl`);

      const inputData = JSON.stringify({
        message: logContent.replace(/\r\n/g, '\n').replace(/\r/g, ''),
        equipment_type: eqType,
        log_type: 'INSPECTION',
      });
      writeFileSync(inputFile, inputData, 'utf-8');
      writeFileSync(vrlFile, vrlBlock, 'utf-8');

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
            const cleanErr = stderr.split('\n')
              .filter(l => !l.match(/^\d{4}-\d{2}-\d{2}T.*\s+(INFO|DEBUG)\s+/))
              .join('\n').trim();
            reject(new Error(cleanErr || `VRL exited with code ${code}`));
          }
        });
        proc.on('error', reject);
        const timer = setTimeout(() => { proc.kill(); reject(new Error('VRL execution timeout (10s)')); }, 10000);
        proc.on('close', () => clearTimeout(timer));
      });

      // 3) VRL 출력 파싱
      const raw = result.stdout.trim();
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        return reply.status(500).send({ error: 'VRL produced no JSON output' });
      }
      const jsonStr = raw.slice(jsonStart, jsonEnd + 1)
        .replace(/"(?:[^"\\]|\\.)*"/g, (strLiteral) =>
          strLiteral.replace(/[\x00-\x1F\x7F]/g, (ch) =>
            `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
          ),
        );

      let output: Record<string, unknown>;
      try {
        output = JSON.parse(jsonStr);
      } catch {
        return reply.status(500).send({ error: 'Failed to parse VRL output' });
      }

      // 4) 파싱 결과를 LogRecord로 변환 → processLogBatch로 DB INSERT
      const data = output.data as Record<string, unknown> | undefined;
      const targetTable = (output.target_table as string) || `LOG_${eqType}`;
      const targetType = (output.target_type as string) || 'TABLE';
      const now = localISOString();

      // ROWS 배열을 통째로 한 LogRecord에 담아 정상 vector 경로와 동일한 흐름 사용.
      // 그래야 log-ingest.service의 data.ROWS 분기(replaceMany 등)가 적용됨.
      //
      // 다중 테이블 적재: VRL이 .data.TABLES = [{ TABLE, ROWS }, ...] 를 채운 경우
      // 테이블 하나당 LogRecord 하나로 쪼갠다. aggregator의 format_for_api가 이벤트를
      // 쪼개는 것과 동일한 규약이며, 대상 테이블 목록은 설비별 VRL 블록에만 존재한다.
      const logs: LogRecord[] = [];
      const base = {
        equipment_id: equipmentId,
        equipment_type: eqType,
        log_type: 'INSPECTION',
        target_type: targetType as 'TABLE' | 'PROCEDURE',
        timestamp: now,
      };

      const tables = data?.TABLES as Array<{ TABLE?: string; ROWS?: unknown[] }> | undefined;
      if (Array.isArray(tables) && tables.length > 0) {
        for (const entry of tables) {
          if (!entry?.TABLE || !Array.isArray(entry.ROWS)) continue;
          logs.push({ ...base, target_table: entry.TABLE, data: { ROWS: entry.ROWS } });
        }
      } else if (data) {
        logs.push({ ...base, target_table: targetTable, data });
      }

      if (logs.length === 0) {
        return reply.send({ success: true, accepted: 0, failed: 0, message: 'No data rows parsed' });
      }

      const { logIngestService: svc } = await import('../../services/log-ingest.service.js');
      const { accepted, failed } = await svc.processLogBatch(logs);
      logger.info({ equipmentType: eqType, equipmentId, accepted, failed }, 'Manual ingest completed');

      return reply.send({ success: true, accepted, failed, totalRows: logs.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, equipmentType: eqType }, 'Manual ingest failed');
      return reply.status(500).send({ error: msg });
    }
  });

  /** VRL 코드 문법 검증 (샘플 로그 없이 컴파일만 체크) */
  app.post('/api/monitor/vrl/validate', async (request, reply) => {
    const { vrlCode } = request.body as { vrlCode: string };
    if (!vrlCode) {
      return reply.status(400).send({ success: false, error: 'vrlCode is required' });
    }

    const ts = Date.now();
    const inputFile = join(tmpdir(), `vrl-validate-input-${ts}.json`);
    const vrlFile = join(tmpdir(), `vrl-validate-${ts}.vrl`);

    try {
      // 최소한의 더미 입력으로 문법 검증
      writeFileSync(inputFile, JSON.stringify({ message: '', equipment_type: '', log_type: '' }), 'utf-8');
      writeFileSync(vrlFile, vrlCode, 'utf-8');

      const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
        const proc = spawn(VECTOR_BIN, [
          'vrl', '--input', inputFile, '--program', vrlFile, '--print-object',
        ], { windowsHide: true });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
        proc.on('error', () => resolve({ stdout, stderr, code: 1 }));
        const timer = setTimeout(() => { proc.kill(); resolve({ stdout, stderr, code: 1 }); }, 10000);
        proc.on('close', () => clearTimeout(timer));
      });

      if (result.code === 0) {
        return reply.send({ success: true });
      }
      // stderr에서 INFO/DEBUG 로그 제거하여 실제 에러만 추출
      const cleanErr = result.stderr.split('\n')
        .filter(l => !l.match(/^\d{4}-\d{2}-\d{2}T.*\s+(INFO|DEBUG|WARN)\s+/))
        .join('\n').trim();
      return reply.send({ success: false, error: cleanErr || `Validation failed (exit code ${result.code})` });
    } catch (err) {
      return reply.send({ success: false, error: err instanceof Error ? err.message : String(err) });
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

      const extracted = extractVrlFields(newToml);
      const syncCount = extracted[eqType]?.length ?? 0;

      return reply.send({ success: true, message: 'VRL applied', syncCount });
    } catch (err) {
      logger.error(err, 'Failed to apply VRL to TOML');
      return reply.status(500).send({ error: String(err) });
    }
  });

  /** 설비 레지스트리 전체 목록 */
  app.get('/api/monitor/equipment-registry', async (_request, reply) => {
    return reply.send(equipmentRegistry.getAll());
  });

  /** 설비 정보 수정 (description, excluded 등) */
  app.put('/api/monitor/equipment-registry/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { description?: string; excluded?: boolean };
    const ok = equipmentRegistry.update(id, body);
    if (!ok) return reply.status(404).send({ error: 'Equipment not found' });
    return reply.send({ success: true });
  });

  /** 설비 삭제 */
  app.delete('/api/monitor/equipment-registry/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = equipmentRegistry.remove(id);
    if (!ok) return reply.status(404).send({ error: 'Equipment not found' });
    return reply.send({ success: true });
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

      // 3) parseRules — TOML에서 실시간 추출
      const aggTomlForParse = readFileSync(VECTOR_CONFIG, 'utf-8');
      const parseRules = extractVrlFields(aggTomlForParse);

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

  // ─── 시스템 로그 (메모리 링버퍼) ───

  /**
   * GET /api/monitor/system-logs
   * 메모리 링버퍼에서 최근 시스템 로그 조회
   * @query limit - 최대 반환 줄 수 (기본 100, 최대 500)
   * @query level - 필터할 레벨: all, debug, info, warn, error, fatal (기본 all)
   * @query search - 메시지 내 검색 문자열
   */
  app.get('/api/monitor/system-logs', async (request, reply) => {
    const query = request.query as { limit?: string; level?: string; search?: string };
    const limit = Math.min(Math.max(parseInt(query.limit || '100', 10) || 100, 1), 500);
    const level = query.level || 'all';
    const search = query.search || undefined;

    const entries = logBuffer.getEntries({ limit, level, search });
    return reply.send({ total: logBuffer.size, count: entries.length, entries });
  });

  // ─── PM2 로그 파일 읽기 ───

  /** 허용된 PM2 로그 파일 목록 */
  const PM2_LOG_FILES = [
    'backend-out.log',
    'backend-error.log',
    'frontend-out.log',
    'frontend-error.log',
  ];

  /**
   * GET /api/monitor/pm2-logs
   * PM2 디스크 로그 파일의 마지막 N줄 조회
   * @query file - 파일명 (기본 backend-out.log)
   * @query tail - 마지막 줄 수 (기본 200, 최대 1000)
   * @query search - 검색 문자열 (대소문자 무시)
   */
  app.get('/api/monitor/pm2-logs', async (request, reply) => {
    const query = request.query as { file?: string; tail?: string; search?: string };
    const fileName = query.file || 'backend-out.log';

    if (!PM2_LOG_FILES.includes(fileName)) {
      return reply.status(400).send({ error: `허용되지 않는 파일: ${fileName}` });
    }

    const filePath = join(process.cwd(), 'logs', fileName);

    if (!existsSync(filePath)) {
      return reply.send({ file: fileName, lines: [], total: 0 });
    }

    const tail = Math.min(Math.max(parseInt(query.tail || '200', 10) || 200, 1), 1000);
    const searchStr = query.search?.toLowerCase();

    const content = readFileSync(filePath, 'utf-8');
    let lines = content.split('\n').filter(Boolean);

    if (searchStr) {
      lines = lines.filter(line => line.toLowerCase().includes(searchStr));
    }

    const total = lines.length;
    const sliced = lines.slice(-tail);

    return reply.send({ file: fileName, lines: sliced, total });
  });

  /**
   * GET /api/monitor/pm2-logs/files
   * 사용 가능한 PM2 로그 파일 목록 + 크기 반환
   */
  app.get('/api/monitor/pm2-logs/files', async (_request, reply) => {
    const logsDir = join(process.cwd(), 'logs');
    const files = PM2_LOG_FILES.map(name => {
      const fp = join(logsDir, name);
      const exists = existsSync(fp);
      return {
        name,
        exists,
        size: exists ? statSync(fp).size : 0,
      };
    });
    return reply.send({ files });
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

ABSOLUTE FORBIDDEN — VRL compilation will FAIL if you use ANY of these:
- "for" — RESERVED KEYWORD, causes E205 error. "for x in 0..N" does NOT exist in VRL.
- "while" — RESERVED KEYWORD, causes E205 error. NEVER use while loops.
- "loop" — RESERVED KEYWORD, causes E205 error.
- "break" — RESERVED KEYWORD, causes E205 error.
- "continue" — RESERVED KEYWORD, causes E205 error.
- "range()" — UNDEFINED FUNCTION, causes E105 error. VRL has NO range function.
- "0..N" range syntax — VRL does NOT support range literals.
- obj[variable] or .data[field] — VRL does NOT support dynamic field access. Only integer literals allowed in brackets.
VRL has ONLY ONE iteration construct: for_each(array!(items)) -> |_idx, val| { ... }
Use for_each() with array slicing (slice!) for iteration. See PATTERN 2 below.
For many columns (e.g. 50+), assign each field explicitly with get!(cols, [N]) — do NOT try to generate indices dynamically with arithmetic.

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
- NEVER use dynamic field access like obj[field] or .data[field]. VRL only allows integer literals in brackets: get!(array, [0]).
  To set named fields, use explicit assignment: .data.FIELD_NAME = value
  WRONG: .data[field] = val / item[field] = val
  RIGHT: .data.MY_FIELD = val / item = { "MY_FIELD": val }

PATTERN 1 — Single-line CSV (no header):
  values = split!(.message, ",")
  .data.NAME = strip_whitespace(to_string!(get!(values, [0])))
  .data.COUNT = strip_whitespace(to_string!(get!(values, [1])))

PATTERN 2 — Multi-line CSV with header row (MOST COMMON for equipment logs):
  lines = split!(.message, "\\n")
  # Skip header (line 0), parse ALL data rows (lines 1+) into .data.ROWS array
  # CRITICAL: Node.js processLog detects .data.ROWS array and INSERTs each row individually.
  # NEVER use .data.DETAILS, .data.TEST_RESULTS, or any other name — ONLY .data.ROWS.
  # NEVER parse the first row into individual .data.FIELD values — it's redundant with ROWS[0].
  .data.ROWS = []
  data_lines = slice!(lines, 1)
  for_each(array!(data_lines)) -> |_idx, row| {
    if row != "" {
      cols = split(to_string!(row), ",")
      item = {
        "BARCODE": strip_whitespace(to_string!(get!(cols, [0]))),
        "RESULT": strip_whitespace(to_string!(get!(cols, [2]))),
      }
      .data.ROWS = push(.data.ROWS, item)
    }
  }

PATTERN 3 — Key=Value or fixed-format logs:
  # Use parse_key_value!, parse_csv!, parse_json!, regex patterns as needed.

PATTERN 4 — Multi-section log (sections separated by section headers like "Panel", "ComponentID,..."):
  lines = split!(.message, "\\n")
  # Section 1: Master (line 0 = header, line 1 = data)
  master = split(to_string!(get!(lines, [1])), ",")
  .data.BARCODE = strip_whitespace(to_string!(get!(master, [0])))

  # Section 2: Panel (line 2 = "Panel" label, line 3 = header, line 4 = data)
  panel = split(to_string!(get!(lines, [4])), ",")
  .data.PANEL_RESULT = strip_whitespace(to_string!(get!(panel, [1])))

  # Section 3: Components (line 5 = header, line 6+ = data rows)
  # Use .data.ROWS for multi-row data — Node.js will INSERT each row individually
  .data.ROWS = []
  component_lines = slice!(lines, 6)
  for_each(array!(component_lines)) -> |_idx, row| {
    if row != "" {
      cols = split(to_string!(row), ",")
      item = { "ID": strip_whitespace(to_string!(get!(cols, [0]))) }
      .data.ROWS = push(.data.ROWS, item)
    }
  }

STRATEGY:
1. Count lines carefully — identify EVERY section header and label line in the sample log.
2. Section headers (e.g. "Panel", "ComponentID,PadResult,...") are NOT data. Skip them.
   - A section label like "Panel" on its own line takes 1 line.
   - A CSV header like "ArrayBarcode,PanelResult" takes 1 line.
   - Data starts AFTER both the label and header lines.
3. Use exact line indices: count from line 0 and verify which line contains actual data.
4. For CSV with headers: use PATTERN 2. Map EVERY column from the header to a .data.FIELD.
5. For multi-section logs: use PATTERN 4. Each section has label + header + data lines.
6. If multiple data rows exist, parse them ALL into .data.ROWS array. NEVER use .data.DETAILS, .data.ITEMS, .data.TEST_RESULTS — ONLY .data.ROWS.
7. Do NOT parse the first row into individual .data.FIELD values separately — it creates duplicates. All rows go into .data.ROWS only.
8. Name fields exactly matching the header column names (converted to UPPERCASE_SNAKE_CASE, spaces/special chars replaced with _).
9. NEVER put an array into a single DB column — Oracle VARCHAR2(500) will overflow. The .data.ROWS array is handled specially by Node.js (row-by-row INSERT).
9. ALL columns are parsed as strings — no numeric conversion. DB handles type casting at insert time.
10. NEVER use dot prefix for local variables. ".panel_line" stores to the event — use "panel_line" instead.

OUTPUT FORMAT:
- Add a comment block at the top explaining the log structure analysis:
  # Log Structure: (describe sections, line numbers, headers vs data)
  # Line 0: header row (MasterBarcode,PCBID,...)
  # Line 1: master data
  # Line 2: "Panel" (section label — skip)
  # ...
- Add inline comments for each section explaining what is being parsed and why.
- Return ONLY VRL code with comments. No markdown, no code fences.`;
}

/** aggregator TOML에서 Agent 수신 주소(host:port)를 읽어온다 */
function getAggregatorAddress(): string {
  try {
    const toml = readFileSync(VECTOR_CONFIG, 'utf-8');
    const m = toml.match(/\[sources\.vector_agents\][\s\S]*?address\s*=\s*"([^"]+)"/);
    if (m) {
      const addr = m[1];
      const host = addr.split(':')[0];
      const port = addr.split(':')[1] ?? '6000';
      // 0.0.0.0은 모든 인터페이스 수신 → 실제 서버 IP로 변환
      if (host === '0.0.0.0' || host === '127.0.0.1') {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        for (const ifaces of Object.values(nets) as any[]) {
          for (const iface of ifaces ?? []) {
            if (iface.family === 'IPv4' && !iface.internal) return `${iface.address}:${port}`;
          }
        }
      }
      return addr;
    }
  } catch { /* fallback */ }
  return '20.10.30.112:6000';
}

/** 새 설비용 기본 TOML 템플릿 */
function getDefaultAgentToml(name: string): string {
  const aggregatorAddr = getAggregatorAddress();
  return `# =============================================================================
#  Vector Agent (송신기) - ${name} 설비
# =============================================================================

data_dir = 'C:\\vector-data-${name.toLowerCase()}'

[api]
enabled = true
address = "127.0.0.1:8686"

[sources.work_logs]
type = "file"
include = [
  'C:\\logs\\${name.toLowerCase()}\\*.txt',
  'C:\\logs\\${name.toLowerCase()}\\*.csv',
  'C:\\logs\\${name.toLowerCase()}\\*.log',
]
read_from = "beginning"
fingerprint.strategy = "checksum"
fingerprint.bytes = 256
ignore_older_secs = 604800

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
inputs = ["add_metadata"]
address = "${aggregatorAddr}"

[sinks.to_aggregator.buffer]
type = "memory"
max_events = 500
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
      const out = execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \\"DeviceID=\'C:\'\\" | Select-Object FreeSpace,Size | ConvertTo-Csv -NoTypeInformation"',
        { encoding: 'utf-8', windowsHide: true },
      );
      const lines = out.trim().split('\n').filter(l => l.trim());
      const last = lines[lines.length - 1].replace(/"/g, '').split(',');
      const free = Number(last[0]);
      const total = Number(last[1]);
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

/** VRL 코드에서 로그 구조(단일행/멀티행/KV 등)를 자동 감지 */
function detectLogStructure(code: string): {
  type: 'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION';
  multiRowMode?: 'BATCH' | 'ACCUMULATE';
  hasHeader: boolean;
  headerLines: number;
  delimiter?: string;
} {
  if (!code.trim()) {
    return { type: 'SINGLE', hasHeader: true, headerLines: 1 };
  }

  const hasForEach = /for_each/.test(code);
  const hasSplitMessage = /split!\s*\(\s*to_string!\s*\(\s*\.message\s*\)\s*,\s*"\\n"\s*\)/.test(code);
  const hasGetLines = /get!\s*\(\s*lines/.test(code);
  const hasKeyValuePattern = /split!\s*\([^,]+,\s*["'](:|=)["']\s*\)/.test(code);

  // KEY_VALUE: key:value 또는 key=value 패턴
  if (hasKeyValuePattern && !hasForEach) {
    const delimMatch = code.match(/split!\s*\([^,]+,\s*["'](:|=)["']\s*\)/);
    return { type: 'KEY_VALUE', hasHeader: false, headerLines: 0, delimiter: delimMatch?.[1] || ':' };
  }

  // MULTI_ROW: for_each 루프로 여러 행 처리
  if (hasForEach && hasSplitMessage) {
    // 헤더 감지: get!(lines, [0]) 또는 get!(lines, [1]) 패턴 확인
    const headerAccess = code.match(/get!\s*\(\s*lines\s*,\s*\[(\d+)\]\s*\)/g);
    let headerLines = 0;
    if (headerAccess) {
      // for_each 이전에 접근하는 라인 인덱스를 확인
      const forEachPos = code.indexOf('for_each');
      const beforeForEach = code.slice(0, forEachPos);
      const lineAccesses = beforeForEach.match(/get!\s*\(\s*lines\s*,\s*\[(\d+)\]\s*\)/g);
      if (lineAccesses) {
        const indices = lineAccesses.map(a => {
          const m = a.match(/\[(\d+)\]/);
          return m ? parseInt(m[1]) : 0;
        });
        headerLines = Math.max(...indices) + 1;
      }
    }
    // startRow 감지: for_each에서 slice 시작 인덱스
    return {
      type: 'MULTI_ROW',
      multiRowMode: 'BATCH',
      hasHeader: headerLines > 0,
      headerLines: headerLines || 1,
    };
  }

  // SINGLE: 단일행 또는 split 후 고정 인덱스 접근
  if (hasSplitMessage && hasGetLines && !hasForEach) {
    // 헤더 행 수 감지: get!(lines, [N]) 중 데이터 시작 인덱스
    const lineAccesses = code.match(/get!\s*\(\s*lines\s*,\s*\[(\d+)\]\s*\)/g) || [];
    const indices = lineAccesses.map(a => {
      const m = a.match(/\[(\d+)\]/);
      return m ? parseInt(m[1]) : 0;
    });
    const minDataIdx = indices.length > 0 ? Math.min(...indices) : 0;
    return {
      type: 'SINGLE',
      hasHeader: minDataIdx > 0,
      headerLines: minDataIdx > 0 ? minDataIdx : 1,
    };
  }

  // 기본: 단일행
  return { type: 'SINGLE', hasHeader: true, headerLines: 1 };
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

  // 새 VRL 코드를 2스페이스 인덴트로 포맷
  const indent = '  ';
  const indentedCode = newCode.split('\n')
    .map(l => l.trim() ? indent + l : '')
    .join('\n');

  // 기존 블록이 없으면 → else 체인 마지막에 새 블록 추가
  if (headerIdx === -1) {
    // else 체인의 마지막 `} else {` (unknown 분기) 또는 마지막 `}` 찾기
    const lastElsePattern = /}\s*else\s*\{/;
    let lastElseIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lastElsePattern.test(lines[i])) {
        lastElseIdx = i;
        break;
      }
    }

    if (lastElseIdx !== -1) {
      // `} else {` 앞에 새 `} else if` 블록 삽입
      const newBlock = `} else if .equipment_type == "${equipmentType}" {\n${indentedCode}\n`;
      const newLines = [
        ...lines.slice(0, lastElseIdx),
        newBlock,
        ...lines.slice(lastElseIdx),
      ];
      return newLines.join('\n');
    }

    // else 블록이 없으면 마지막 닫는 `}` 앞에 추가
    let lastClosingIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}') {
        lastClosingIdx = i;
        break;
      }
    }
    if (lastClosingIdx === -1) return null;

    const newBlock = `} else if .equipment_type == "${equipmentType}" {\n${indentedCode}\n`;
    const newLines = [
      ...lines.slice(0, lastClosingIdx),
      newBlock,
      ...lines.slice(lastClosingIdx),
    ];
    return newLines.join('\n');
  }

  // 기존 블록이 있으면 → 내용 교체
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
      /(?:else\s+)?if\s+\.equipment_type\s*==\s*"([A-Z0-9_]+)"/,
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

      // ROWS item 내부 필드 추출: "FIELD_NAME": strip_whitespace(...)
      const itemFieldMatch = trimmed.match(/^"([A-Z][A-Z0-9_]*)"\s*:/);
      if (itemFieldMatch) {
        const fieldName = `data.${itemFieldMatch[1]}`;
        if (!result[currentType].includes(fieldName)) {
          result[currentType].push(fieldName);
        }
      }
    }
  }

  return result;
}

/** Fluent Bit 새 설비 기본 conf 템플릿 */
function getDefaultFluentConf(name: string): string {
  const lower = name.toLowerCase();
  return `# =============================================================================
#  Fluent Bit Agent (송신기) - ${name} 설비
# =============================================================================
#
#  역할: ${name} 설비 PC의 로그 파일을 중앙 서버(Aggregator)로 전송합니다.
#
#  설치 방법:
#    1. 설비 PC에 Fluent Bit를 설치합니다 (fluent-bit.exe)
#    2. 이 파일을 설비 PC에 복사합니다
#    3. [FILTER] 섹션에서 equipment_id, line_code 등을 변경합니다  ← 변경 필요
#    4. [INPUT] 섹션에서 Path를 실제 로그 위치로 변경합니다       ← 변경 필요
#    5. [OUTPUT] 섹션에서 Host를 실제 서버 IP로 변경합니다        ← 변경 필요
#
#  실행: fluent-bit -c ${name}.conf
#
# =============================================================================

[SERVICE]
    Flush        1
    Log_Level    info
    storage.path C:\\fluent-bit-data\\${lower}
    storage.sync normal

# ── [파서] 파일 전체를 하나의 이벤트로 묶기 ──
[MULTILINE_PARSER]
    Name          multiline_all
    Type          regex
    Flush_timeout 1000
    Rule          "start_state" "/^.+$/" "cont"
    Rule          "cont"        "/^.+$/" "cont"

# ── [소스] 파일 감시 ──
[INPUT]
    Name             tail
    Tag              work_logs
    Path             C:\\logs\\${lower}\\*.txt,C:\\logs\\${lower}\\*.csv    # ← 변경 필요
    Read_from_Head   true
    DB               C:\\fluent-bit-data\\${lower}\\tail.db
    Refresh_Interval 5
    Multiline        On
    Parser_Firstline multiline_all

# ── [메타데이터 태깅] ──
[FILTER]
    Name          modify
    Match         work_logs
    Add           equipment_type ${name}
    Add           log_type       INSPECTION
    Add           line_code      LINE-01        # ← 변경 필요
    Add           equipment_id   ${name}-001    # ← 변경 필요

# ── [출력] Aggregator 서버로 전송 ──
[OUTPUT]
    Name            forward
    Match           *
    Host            20.10.30.112    # ← 변경 필요
    Port            24224
    storage.total_limit_size 256M
`;
}
