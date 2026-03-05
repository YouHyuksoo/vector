/**
 * @file src/lib/api.ts
 * @description API 클라이언트 유틸리티 및 타입 정의
 *
 * 초보자 가이드:
 * 1. **apiFetch**: 백엔드 API를 호출하는 범용 fetch 래퍼. 에러 시 자동으로 예외를 던짐
 * 2. **MonitorOverview**: /api/monitor/overview 응답 타입
 * 3. **SystemConfig**: /api/monitor/config 응답 타입
 */

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    let msg = `API Error: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) msg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
    } catch { /* JSON 파싱 실패 시 기본 메시지 사용 */ }
    throw new Error(msg);
  }
  return res.json();
}

export interface MonitorOverview {
  server: {
    status: string; uptime: number; timestamp: string; nodeEnv: string;
    disk?: { total: number; used: number; free: number; percent: number };
    memory?: { total: number; used: number; free: number; percent: number };
    cpu?: { percent: number; cores: number; model: string };
  };
  oracle: { connected: boolean };
  redis: { connected: boolean };
  vector: { running: boolean; pid: number | null; apiReachable: boolean; uptime: string | null; version: string | null };
  queue: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  equipments: Array<{ equipment_id: string; online: boolean; last_seen: string; metadata: Record<string, string> }>;
  tables: Array<{ TABLE_NAME: string; COLUMN_COUNT: number }>;
  recentErrors: Array<{ LOG_ID: number; SOURCE_TABLE: string; EQUIPMENT_ID: string; MESSAGE: string; STAGE: string; STATUS: string; CREATED_AT: string }>;
  recentLogs: Array<{ LOG_ID: number; SOURCE_TABLE: string; EQUIPMENT_ID: string; MESSAGE: string; STAGE: string; STATUS: string; CREATED_AT: string }>;
}

export interface ProcessLogRow {
  LOG_ID: number;
  SOURCE_TABLE: string;
  EQUIPMENT_ID: string;
  MESSAGE: string;
  STAGE: string;
  STATUS: string;
  CREATED_AT: string;
  RAW_DATA?: string;
}

export interface RetryResponse {
  success: boolean;
  retried: number;
  failed: number;
}

export interface ProcessLogResponse {
  logs: ProcessLogRow[];
  total: number;
  sourceTables: string[];
  equipmentIds: string[];
}

export interface SystemConfig {
  server: { host: string; port: number; nodeEnv: string; nodeVersion: string; platform: string; pid: number; memoryUsage: { rss: number; heapUsed: number; heapTotal: number } };
  oracle: { host: string; service: string; connectString: string; user: string; password: string; poolMin: number; poolMax: number };
  redis: { host: string; port: number; hasPassword: boolean; password: string };
  queue: { concurrency: number; batchSize: number; batchTimeoutMs: number };
  storage: { rawLogBasePath: string };
  heartbeat: { ttlSeconds: number };
}
