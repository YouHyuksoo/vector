/**
 * @file agent-monitor/src/routes/control.ts
 * @description Vector 프로세스 시작/중지/재시작 및 Aggregator 연결 테스트 라우트
 *
 * 초보자 가이드:
 * 1. 이 파일은 Vector 프로세스를 원격으로 제어합니다
 * 2. POST /api/vector/start   - Vector 바이너리를 실행합니다 (detached 모드)
 * 3. POST /api/vector/stop    - 실행 중인 Vector를 종료합니다 (taskkill)
 * 4. POST /api/vector/restart - 중지 후 재시작합니다
 * 5. POST /api/vector/test-connection - TOML의 sink address로 TCP 연결 테스트
 * 6. Windows 환경에서는 taskkill, Unix에서는 SIGTERM을 사용합니다
 */

import { FastifyInstance } from 'fastify';
import { spawn, execSync, ChildProcess } from 'child_process';
import { createConnection } from 'net';
import { readFileSync, existsSync } from 'fs';
import { ENV } from '../server.js';

/** 현재 관리 중인 Vector 자식 프로세스 */
let vectorProcess: ChildProcess | null = null;

/**
 * Vector 프로세스의 PID를 찾습니다 (Windows tasklist)
 * @returns PID 또는 null
 */
function findVectorPid(): number | null {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq vector.exe" /FO CSV /NH', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    const match = output.match(/"vector\.exe","(\d+)"/i);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Vector 프로세스를 시작합니다
 * @returns 성공 여부와 PID
 */
function startVector(): { success: boolean; pid?: number; error?: string } {
  if (!existsSync(ENV.VECTOR_BIN_PATH)) {
    return { success: false, error: `Binary not found: ${ENV.VECTOR_BIN_PATH}` };
  }
  if (!existsSync(ENV.VECTOR_CONFIG_PATH)) {
    return { success: false, error: `Config not found: ${ENV.VECTOR_CONFIG_PATH}` };
  }

  const existingPid = findVectorPid();
  if (existingPid) {
    return { success: true, pid: existingPid, error: 'Vector is already running' };
  }

  try {
    vectorProcess = spawn(ENV.VECTOR_BIN_PATH, ['--config', ENV.VECTOR_CONFIG_PATH], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    vectorProcess.unref();
    const pid = vectorProcess.pid ?? null;
    return { success: true, pid: pid ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Vector 프로세스를 중지합니다
 * @returns 성공 여부
 */
function stopVector(): { success: boolean; error?: string } {
  try {
    const pid = findVectorPid();
    if (!pid) {
      return { success: true, error: 'Vector is not running' };
    }

    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 });
    } else {
      process.kill(pid, 'SIGTERM');
    }

    vectorProcess = null;
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * TOML 설정에서 sink address를 파싱합니다
 * @returns { host, port } 또는 null
 */
function parseSinkAddress(): { host: string; port: number } | null {
  try {
    const content = readFileSync(ENV.VECTOR_CONFIG_PATH, 'utf-8');
    const match = content.match(/address\s*=\s*"([^"]+)"/);
    if (!match) return null;

    const addr = match[1];
    const colonIdx = addr.lastIndexOf(':');
    if (colonIdx === -1) return null;

    const host = addr.substring(0, colonIdx);
    const port = Number(addr.substring(colonIdx + 1));
    if (isNaN(port)) return null;

    return { host, port };
  } catch {
    return null;
  }
}

/**
 * TCP 소켓으로 연결 테스트를 수행합니다
 * @param host - 대상 호스트
 * @param port - 대상 포트
 * @param timeoutMs - 타임아웃 (ms)
 * @returns 연결 성공 여부
 */
function testTcpConnection(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
  });
}

/** sleep 유틸리티 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fastify 플러그인: Vector 프로세스 제어 라우트 등록 */
export default async function controlRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/vector/start - Vector 프로세스 시작 */
  app.post('/api/vector/start', async (_req, reply) => {
    const result = startVector();
    const code = result.success ? 200 : 500;
    return reply.status(code).send(result);
  });

  /** POST /api/vector/stop - Vector 프로세스 중지 */
  app.post('/api/vector/stop', async (_req, reply) => {
    const result = stopVector();
    const code = result.success ? 200 : 500;
    return reply.status(code).send(result);
  });

  /** POST /api/vector/restart - Vector 프로세스 재시작 */
  app.post('/api/vector/restart', async (_req, reply) => {
    const stopResult = stopVector();
    if (!stopResult.success && !stopResult.error?.includes('not running')) {
      return reply.status(500).send({ success: false, error: stopResult.error });
    }

    await sleep(1500);
    const startResult = startVector();
    const code = startResult.success ? 200 : 500;
    return reply.status(code).send({ ...startResult, restarted: true });
  });

  /** POST /api/vector/test-connection - Aggregator TCP 연결 테스트 */
  app.post('/api/vector/test-connection', async (_req, reply) => {
    const addr = parseSinkAddress();
    if (!addr) {
      return reply.status(400).send({
        connected: false,
        error: 'Could not parse sink address from config',
      });
    }

    const connected = await testTcpConnection(addr.host, addr.port);
    return reply.send({
      connected,
      host: addr.host,
      port: addr.port,
      testedAt: new Date().toISOString(),
    });
  });
}
