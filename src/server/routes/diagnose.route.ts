/**
 * @file src/server/routes/diagnose.route.ts
 * @description 운영 진단 통합 라우트 — 설정·현상·상태를 한 응답으로 노출
 *
 * 초보자 가이드:
 * 1. **목적**: 적체/지연/재시작 같은 운영 이상을 한 화면에서 즉시 판단
 * 2. **수집 정보**: backend 자체 상태, Aggregator buffer, Oracle, 처리량, lag
 * 3. **자동 판정**: 임계값 기반으로 health = ok / warn / critical
 */

import type { FastifyPluginAsync } from 'fastify';
import { statSync, readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { totalmem, freemem, cpus } from 'os';
import { execSync } from 'child_process';
import { getConnection } from '../../database/oracle.pool.js';
import { errorLogRepository } from '../../database/repositories/error-log.repository.js';
import { equipmentRegistry } from '../../services/equipment-registry.service.js';
import { heartbeatService } from '../../services/heartbeat.service.js';
import { getVectorStatus } from '../../services/vector-process.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const VECTOR_DATA_DIR = join(process.cwd(), 'vector-data');
const VECTOR_AGGREGATOR_TOML = join(process.cwd(), 'vector-config', 'aggregator', 'vector-aggregator.toml');
const ECOSYSTEM_CFG = join(process.cwd(), 'ecosystem.config.cjs');

interface BufferSegment {
  name: string;
  sizeMB: number;
  mtime: string;
}

/** vector.exe process 메모리 (MB) — tasklist /fi 로 조회 */
function getVectorMemoryMB(): number | null {
  try {
    const out = execSync('tasklist /fi "imagename eq vector.exe" /fo csv /nh', {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000,
    });
    // CSV: "vector.exe","13592","Services","0","216,528 K"
    const line = out.split('\n').find(l => l.toLowerCase().includes('vector.exe'));
    if (!line) return null;
    const cols = line.split('","').map(s => s.replace(/"/g, '').trim());
    const memField = cols[4] || '';
    const kb = parseInt(memField.replace(/[,\sK]/g, ''), 10);
    if (isNaN(kb)) return null;
    return +(kb / 1024).toFixed(1);
  } catch {
    return null;
  }
}

/** Aggregator disk buffer 정보 — vector-data/buffer/v2/{component}/buffer-data-*.dat */
function getAggregatorBuffer(): { totalMB: number; segments: BufferSegment[] } {
  const out: BufferSegment[] = [];
  let totalBytes = 0;
  const bufRoot = join(VECTOR_DATA_DIR, 'buffer', 'v2');
  if (!existsSync(bufRoot)) return { totalMB: 0, segments: [] };

  for (const comp of readdirSync(bufRoot)) {
    const compDir = join(bufRoot, comp);
    if (!statSync(compDir).isDirectory()) continue;
    for (const f of readdirSync(compDir)) {
      if (!f.startsWith('buffer-data-') || !f.endsWith('.dat')) continue;
      const fp = join(compDir, f);
      const st = statSync(fp);
      totalBytes += st.size;
      out.push({
        name: `${comp}/${f}`,
        sizeMB: +(st.size / 1024 / 1024).toFixed(2),
        mtime: st.mtime.toISOString(),
      });
    }
  }
  return {
    totalMB: +(totalBytes / 1024 / 1024).toFixed(2),
    segments: out.sort((a, b) => b.sizeMB - a.sizeMB),
  };
}

/** Vector aggregator GraphQL — source/sink 누적 이벤트 수 */
async function getVectorMetrics(): Promise<{ sources: { id: string; received: number | null }[]; sinks: { id: string; sent: number | null }[] }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('http://127.0.0.1:8687/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          sources { edges { node { componentId metrics { receivedEventsTotal { receivedEventsTotal } } } } }
          sinks { edges { node { componentId metrics { sentEventsTotal { sentEventsTotal } } } } }
        }`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { sources: [], sinks: [] };
    const json = await res.json() as {
      data?: {
        sources?: { edges: { node: { componentId: string; metrics: { receivedEventsTotal: { receivedEventsTotal: number } | null } } }[] };
        sinks?: { edges: { node: { componentId: string; metrics: { sentEventsTotal: { sentEventsTotal: number } | null } } }[] };
      };
    };
    return {
      sources: (json.data?.sources?.edges || []).map(e => ({
        id: e.node.componentId,
        received: e.node.metrics.receivedEventsTotal?.receivedEventsTotal ?? null,
      })),
      sinks: (json.data?.sinks?.edges || []).map(e => ({
        id: e.node.componentId,
        sent: e.node.metrics.sentEventsTotal?.sentEventsTotal ?? null,
      })),
    };
  } catch {
    return { sources: [], sinks: [] };
  }
}

/** Oracle 연결 + 최근 처리량(LOG_* 테이블 전체 분당 INSERT) + lag */
async function getDbStats(): Promise<{
  connected: boolean;
  insertPerMin: number | null;
  perTable: { table: string; cnt: number }[];
  lagHours: number | null;
  latestStartTime: string | null;
  latestCreatedAt: string | null;
}> {
  try {
    const conn = await getConnection();
    try {
      // 등록 테이블 목록 (LOG_*만 — 동적 INSERT 대상)
      const regRes = await conn.execute<{ TABLE_NAME: string }>(
        `SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'LOG\\_%' ESCAPE '\\'`,
      );
      const tables = (regRes.rows || []).map(r => r.TABLE_NAME);

      // 각 테이블 최근 1분 INSERT 수 합산
      const perTable: { table: string; cnt: number }[] = [];
      let total = 0;
      for (const t of tables) {
        try {
          const r = await conn.execute<{ CNT: number }>(
            `SELECT COUNT(*) AS CNT FROM ${t} WHERE CREATED_AT >= SYSDATE - 1/24/60`,
          );
          const cnt = r.rows?.[0]?.CNT ?? 0;
          if (cnt > 0) perTable.push({ table: t, cnt });
          total += cnt;
        } catch {
          /* CREATED_AT 컬럼 없는 테이블 등 무시 */
        }
      }

      // lag — LOG_EOL 기준 (대표 테이블) MAX START_TIME vs MAX CREATED_AT
      let lagHours: number | null = null;
      let latestStartTime: string | null = null;
      let latestCreatedAt: string | null = null;
      try {
        const lagRes = await conn.execute<{ LATEST_START: string; LATEST_CREATED: Date }>(
          `SELECT MAX(START_TIME) AS LATEST_START, MAX(CREATED_AT) AS LATEST_CREATED FROM LOG_EOL`,
        );
        const row = lagRes.rows?.[0];
        if (row?.LATEST_START && row.LATEST_CREATED) {
          latestStartTime = String(row.LATEST_START);
          latestCreatedAt = row.LATEST_CREATED instanceof Date ? row.LATEST_CREATED.toISOString() : String(row.LATEST_CREATED);
          const startMs = Date.parse(String(row.LATEST_START).replace(' ', 'T'));
          const createdMs = row.LATEST_CREATED instanceof Date ? row.LATEST_CREATED.getTime() : Date.parse(String(row.LATEST_CREATED));
          if (!isNaN(startMs) && !isNaN(createdMs)) {
            lagHours = +((createdMs - startMs) / 1000 / 60 / 60).toFixed(2);
          }
        }
      } catch { /* LOG_EOL 없거나 컬럼 다름 */ }

      return {
        connected: true,
        insertPerMin: total,
        perTable: perTable.sort((a, b) => b.cnt - a.cnt).slice(0, 10),
        lagHours,
        latestStartTime,
        latestCreatedAt,
      };
    } finally {
      await conn.close();
    }
  } catch (err) {
    logger.warn({ err }, 'diagnose: Oracle stats failed');
    return { connected: false, insertPerMin: null, perTable: [], lagHours: null, latestStartTime: null, latestCreatedAt: null };
  }
}

/** ecosystem.config.cjs에서 max_memory_restart 값 추출 */
function getEcosystemConfig(): { maxMemoryRestart: string | null } {
  try {
    if (!existsSync(ECOSYSTEM_CFG)) return { maxMemoryRestart: null };
    const content = readFileSync(ECOSYSTEM_CFG, 'utf-8');
    const m = content.match(/max_memory_restart:\s*['"]([^'"]+)['"]/);
    return { maxMemoryRestart: m?.[1] ?? null };
  } catch {
    return { maxMemoryRestart: null };
  }
}

/** vector-aggregator.toml에서 to_api batch/concurrency/buffer 옵션 추출 */
function getVectorToApiConfig(): { batchMaxEvents: number | null; concurrency: number | string | null; bufferMaxMB: number | null } {
  try {
    if (!existsSync(VECTOR_AGGREGATOR_TOML)) return { batchMaxEvents: null, concurrency: null, bufferMaxMB: null };
    const content = readFileSync(VECTOR_AGGREGATOR_TOML, 'utf-8');
    const apiIdx = content.indexOf('[sinks.to_api]');
    if (apiIdx < 0) return { batchMaxEvents: null, concurrency: null, bufferMaxMB: null };
    const apiSection = content.slice(apiIdx, apiIdx + 2000);
    const batch = apiSection.match(/max_events\s*=\s*(\d+)/);
    const conc = apiSection.match(/concurrency\s*=\s*(\d+|"[^"]+")/);
    const bufSize = apiSection.match(/max_size\s*=\s*(\d+)/);
    return {
      batchMaxEvents: batch ? Number(batch[1]) : null,
      concurrency: conc ? (isNaN(Number(conc[1])) ? conc[1].replace(/"/g, '') : Number(conc[1])) : null,
      bufferMaxMB: bufSize ? +(Number(bufSize[1]) / 1024 / 1024).toFixed(0) : null,
    };
  } catch {
    return { batchMaxEvents: null, concurrency: null, bufferMaxMB: null };
  }
}

/** port 6000 ESTABLISHED 연결 IP 목록 (Aggregator에 붙은 설비들) */
function getPort6000Connections(): string[] {
  try {
    const out = execSync('netstat -an', { encoding: 'utf-8', windowsHide: true, timeout: 3000 });
    const ips = new Set<string>();
    for (const line of out.split('\n')) {
      if (!line.includes(':6000') || !line.includes('ESTABLISHED')) continue;
      // TCP    20.10.30.112:6000      20.9.30.95:64285       ESTABLISHED
      const parts = line.trim().split(/\s+/);
      // local 측이 :6000 일 때 remote 측 IP만 추출
      const local = parts[1] || '';
      const remote = parts[2] || '';
      if (local.endsWith(':6000') && remote.includes(':')) {
        const ip = remote.split(':')[0];
        if (ip) ips.add(ip);
      }
    }
    return Array.from(ips).sort();
  } catch {
    return [];
  }
}

/** 종합 판정 룰 */
function judge(input: {
  bufferMB: number;
  insertPerMin: number | null;
  backendRestartsRecent: boolean;
  lagHours: number | null;
  recentErrors: number;
}): { health: 'ok' | 'warn' | 'critical'; reasons: string[] } {
  const reasons: string[] = [];
  let level: 'ok' | 'warn' | 'critical' = 'ok';
  const bump = (lvl: 'warn' | 'critical') => {
    if (lvl === 'critical') level = 'critical';
    else if (level === 'ok') level = 'warn';
  };

  if (input.bufferMB > 400) {
    bump('critical');
    reasons.push(`Aggregator buffer 위험 (${input.bufferMB} MB / max 512 MB)`);
  } else if (input.bufferMB > 100) {
    bump('warn');
    reasons.push(`Aggregator buffer 적체 (${input.bufferMB} MB)`);
  }

  if (input.bufferMB > 50 && (input.insertPerMin ?? 0) < 100) {
    bump('critical');
    reasons.push(`처리 stuck — buffer ${input.bufferMB} MB 인데 분당 INSERT ${input.insertPerMin ?? 0}건`);
  }

  if (input.lagHours != null && input.lagHours > 1) {
    bump('warn');
    reasons.push(`데이터 lag ${input.lagHours}시간 (START_TIME vs CREATED_AT)`);
  }

  if (input.recentErrors > 10) {
    bump('warn');
    reasons.push(`최근 5분 ERROR ${input.recentErrors}건`);
  }

  if (input.backendRestartsRecent) {
    bump('warn');
    reasons.push('backend 최근 재시작 발생');
  }

  if (reasons.length === 0) reasons.push('모든 지표 정상');
  return { health: level, reasons };
}

export const diagnoseRoute: FastifyPluginAsync = async (app) => {
  app.get('/api/diagnose/health', async (_request, reply) => {
    const startedAt = Date.now();

    // 백엔드 자체 — process 정보 (PM2 ↺ 카운트는 별도 채널 필요, 우선 uptime/memory)
    const memUsage = process.memoryUsage();
    const memTotal = totalmem();
    const memFree = freemem();
    const cpuList = cpus();

    const backend = {
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      heapMB: +(memUsage.heapUsed / 1024 / 1024).toFixed(0),
      rssMB: +(memUsage.rss / 1024 / 1024).toFixed(0),
      systemMemoryPercent: Math.round(((memTotal - memFree) / memTotal) * 100),
      cpuCores: cpuList.length,
    };

    const aggregatorBuf = getAggregatorBuffer();
    const vectorStatus = await getVectorStatus();
    const vectorMetrics = await getVectorMetrics();

    const dbStats = await getDbStats();

    // 설비 상태 — heartbeat + registry
    const heartbeats = await heartbeatService.getAllStatuses();
    const hbMap = new Map(heartbeats.map(h => [h.equipment_id, h]));
    const registry = equipmentRegistry.getAll();
    const equipments = Object.entries(registry).map(([id, entry]) => {
      const hb = hbMap.get(id);
      const meta = (hb?.metadata as Record<string, string> | undefined) || {};
      return {
        equipment_id: id,
        equipment_type: entry.equipment_type,
        ip: meta.ip || null,
        online: hb?.online ?? false,
        vector_running: meta.vector_running === 'true' || meta.vector_running === true as unknown as string,
        last_seen: hb?.last_seen || entry.last_seen,
      };
    });

    // 최근 5분 ERROR 수
    const recentErrors = errorLogRepository.query({
      status: 'ERROR',
      startDate: new Date(Date.now() - 5 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
      limit: 500,
    }).total;

    const port6000 = getPort6000Connections();
    const ecosystem = getEcosystemConfig();
    const toApi = getVectorToApiConfig();

    const judgment = judge({
      bufferMB: aggregatorBuf.totalMB,
      insertPerMin: dbStats.insertPerMin,
      backendRestartsRecent: backend.uptimeSec < 120, // 2분 이내 = 방금 재시작
      lagHours: dbStats.lagHours,
      recentErrors,
    });

    const elapsed = Date.now() - startedAt;

    return reply.send({
      timestamp: new Date().toISOString(),
      diagnoseElapsedMs: elapsed,
      health: judgment.health,
      reasons: judgment.reasons,
      backend,
      aggregator: {
        running: vectorStatus.running,
        pid: vectorStatus.pid,
        apiReachable: vectorStatus.apiReachable,
        memoryMB: getVectorMemoryMB(),
        bufferTotalMB: aggregatorBuf.totalMB,
        bufferSegments: aggregatorBuf.segments,
        vectorMetrics,
      },
      oracle: {
        connected: dbStats.connected,
        poolMin: env.ORACLE_POOL_MIN,
        poolMax: env.ORACLE_POOL_MAX,
      },
      throughput: {
        insertPerMin: dbStats.insertPerMin,
        perTable: dbStats.perTable,
      },
      lag: {
        hours: dbStats.lagHours,
        latestStartTime: dbStats.latestStartTime,
        latestCreatedAt: dbStats.latestCreatedAt,
      },
      equipments: {
        total: equipments.length,
        online: equipments.filter(e => e.online).length,
        offline: equipments.filter(e => !e.online).length,
        list: equipments,
      },
      recentErrors,
      port6000Connections: port6000,
      config: {
        maxMemoryRestart: ecosystem.maxMemoryRestart,
        oraclePool: { min: env.ORACLE_POOL_MIN, max: env.ORACLE_POOL_MAX },
        vectorToApi: toApi,
        rawLogBasePath: env.RAW_LOG_BASE_PATH,
      },
    });
  });
};
