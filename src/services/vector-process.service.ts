/**
 * @file src/services/vector-process.service.ts
 * @description Vector aggregator 프로세스 관리 서비스
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Vector aggregator의 시작/중지/상태 확인을 관리
 * 2. **상태 확인**: Vector API(port 8687)의 /health 엔드포인트로 확인
 * 3. **프로세스 제어**: child_process.spawn으로 vector.exe 실행/중지
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';
import { pushVectorLog } from '../utils/log-buffer.js';

export const VECTOR_BIN = join(process.cwd(), 'vector-bin', 'bin', 'vector.exe');
export const VECTOR_CONFIG = join(process.cwd(), 'vector-config', 'aggregator', 'vector-aggregator.toml');
export const AGENT_CONFIG_DIR = join(process.cwd(), 'vector-config', 'agent');
export const FLUENT_CONFIG_DIR = join(process.cwd(), 'vector-config', 'agent-fluent');
const VECTOR_API_URL = 'http://127.0.0.1:8687';

let vectorProcess: ChildProcess | null = null;

export interface VectorStatus {
  running: boolean;
  pid: number | null;
  apiReachable: boolean;
  uptime: string | null;
  version: string | null;
}

/** Vector API /health 엔드포인트 호출 */
async function checkVectorApi(): Promise<{ reachable: boolean; uptime?: string; version?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${VECTOR_API_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return { reachable: true };
    }
    return { reachable: false };
  } catch {
    return { reachable: false };
  }
}

/** Vector GraphQL API로 상세 정보 조회 */
async function getVectorMeta(): Promise<{ uptime?: number; version?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${VECTOR_API_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ meta { uptime versionString } }' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json() as { data?: { meta?: { uptime?: number; versionString?: string } } };
      return {
        uptime: json.data?.meta?.uptime,
        version: json.data?.meta?.versionString,
      };
    }
    return {};
  } catch {
    return {};
  }
}

/** Vector 상태 조회 */
export async function getVectorStatus(): Promise<VectorStatus> {
  const apiCheck = await checkVectorApi();
  const meta = apiCheck.reachable ? await getVectorMeta() : {};

  const uptimeStr = meta.uptime != null
    ? formatUptime(meta.uptime)
    : null;

  return {
    running: apiCheck.reachable,
    pid: vectorProcess?.pid ?? null,
    apiReachable: apiCheck.reachable,
    uptime: uptimeStr,
    version: meta.version ?? null,
  };
}

/** Vector aggregator 시작 */
export async function startVector(): Promise<{ success: boolean; message: string }> {
  const status = await getVectorStatus();
  if (status.running) {
    return { success: false, message: 'Vector is already running' };
  }

  try {
    if (!existsSync(VECTOR_BIN)) {
      logger.warn({ path: VECTOR_BIN }, 'Vector binary not found, skipping start');
      return { success: false, message: `Vector binary not found: ${VECTOR_BIN}` };
    }

    vectorProcess = spawn(VECTOR_BIN, ['--config', VECTOR_CONFIG], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    vectorProcess.on('error', (err) => {
      logger.error({ err: err.message }, 'Vector process spawn error');
      vectorProcess = null;
    });

    vectorProcess.stdout?.on('data', (data: Buffer) => {
      pushVectorLog(data, 'info');
      logger.info({ component: 'vector-aggregator' }, data.toString().trim());
    });
    vectorProcess.stderr?.on('data', (data: Buffer) => {
      pushVectorLog(data, 'warn');
      logger.warn({ component: 'vector-aggregator' }, data.toString().trim());
    });

    vectorProcess.on('exit', (code) => {
      logger.info({ component: 'vector-aggregator', exitCode: code }, 'Vector process exited');
      vectorProcess = null;
    });

    vectorProcess.unref();

    // 잠시 대기 후 실제 기동 확인
    await new Promise(r => setTimeout(r, 2000));
    const check = await getVectorStatus();
    if (check.running) {
      logger.info({ pid: vectorProcess?.pid }, 'Vector aggregator started');
      return { success: true, message: `Vector started (PID: ${vectorProcess?.pid})` };
    }
    return { success: false, message: 'Vector started but API not reachable yet. It may take a few seconds.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'Failed to start Vector');
    return { success: false, message: msg };
  }
}

/** Vector aggregator 중지 */
export async function stopVector(): Promise<{ success: boolean; message: string }> {
  const status = await getVectorStatus();
  if (!status.running) {
    return { success: false, message: 'Vector is not running' };
  }

  // 방법 1: 관리 중인 프로세스가 있으면 직접 kill
  if (vectorProcess && vectorProcess.pid) {
    try {
      process.kill(vectorProcess.pid, 'SIGTERM');
      vectorProcess = null;
      await new Promise(r => setTimeout(r, 1000));
      logger.info('Vector aggregator stopped via process kill');
      return { success: true, message: 'Vector stopped' };
    } catch (err) {
      logger.warn({ err }, 'Failed to kill managed process, trying taskkill');
    }
  }

  // 방법 2: taskkill로 vector.exe 프로세스 종료 (외부에서 시작된 경우)
  try {
    const { execSync } = await import('child_process');
    execSync('taskkill /F /IM vector.exe', { stdio: 'ignore', windowsHide: true });
    vectorProcess = null;
    await new Promise(r => setTimeout(r, 1000));
    logger.info('Vector aggregator stopped via taskkill');
    return { success: true, message: 'Vector stopped' };
  } catch {
    return { success: false, message: 'Failed to stop Vector process' };
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
