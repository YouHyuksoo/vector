/**
 * @file agent-monitor/src/routes/service.ts
 * @description Windows 서비스 등록/해제/상태 API
 *
 * 초보자 가이드:
 * 1. GET /api/service/status     - VectorAgent + VectorAgentManager 서비스 상태
 * 2. POST /api/service/install   - sc create로 Windows 서비스 등록
 * 3. POST /api/service/uninstall - sc delete로 Windows 서비스 해제
 * 4. 관리자 권한이 필요합니다 — 권한 부족 시 에러 반환
 */

import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { ENV } from '../server.js';

const SVC_VECTOR = 'VectorAgent';
const SVC_MANAGER = 'VectorAgentManager';

/** 서비스 상태 조회 (sc query) */
function getServiceState(name: string): string {
  try {
    const out = execSync(`sc query "${name}"`, {
      encoding: 'utf-8', timeout: 5000, windowsHide: true,
    });
    const m = out.match(/STATE\s*:\s*\d+\s+(\w+)/);
    return m?.[1] ?? 'UNKNOWN';
  } catch {
    return 'NOT_INSTALLED';
  }
}

/** sc create 실행 */
function installService(name: string, binPath: string): { success: boolean; error?: string } {
  try {
    execSync(`sc create "${name}" binPath= "${binPath}" start= auto`, {
      encoding: 'utf-8', timeout: 10000, windowsHide: true,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Access is denied')) {
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }
    return { success: false, error: message };
  }
}

/** sc delete 실행 */
function uninstallService(name: string): { success: boolean; error?: string } {
  try {
    /* 먼저 중지 시도 */
    try { execSync(`sc stop "${name}"`, { timeout: 10000, windowsHide: true }); } catch { /* 이미 중지 */ }
    execSync(`sc delete "${name}"`, {
      encoding: 'utf-8', timeout: 10000, windowsHide: true,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Access is denied')) {
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }
    return { success: false, error: message };
  }
}

export default async function serviceRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/service/status — 서비스 상태 조회 */
  app.get('/api/service/status', async (_req, reply) => {
    return reply.send({
      vector: {
        name: SVC_VECTOR,
        state: getServiceState(SVC_VECTOR),
      },
      manager: {
        name: SVC_MANAGER,
        state: getServiceState(SVC_MANAGER),
      },
    });
  });

  /** POST /api/service/install — 서비스 등록 */
  app.post<{ Body: { target: 'vector' | 'manager' | 'both' } }>(
    '/api/service/install', async (req, reply) => {
      const { target = 'both' } = req.body || {};
      const results: Record<string, any> = {};

      if (target === 'vector' || target === 'both') {
        const binPath = `${ENV.VECTOR_BIN_PATH} --config ${ENV.VECTOR_CONFIG_PATH}`;
        results.vector = installService(SVC_VECTOR, binPath);
      }
      if (target === 'manager' || target === 'both') {
        const exePath = process.execPath;
        results.manager = installService(SVC_MANAGER, exePath);
      }

      const allSuccess = Object.values(results).every((r: any) => r.success);
      return reply.status(allSuccess ? 200 : 500).send(results);
    },
  );

  /** POST /api/service/uninstall — 서비스 해제 */
  app.post<{ Body: { target: 'vector' | 'manager' | 'both' } }>(
    '/api/service/uninstall', async (req, reply) => {
      const { target = 'both' } = req.body || {};
      const results: Record<string, any> = {};

      if (target === 'vector' || target === 'both') {
        results.vector = uninstallService(SVC_VECTOR);
      }
      if (target === 'manager' || target === 'both') {
        results.manager = uninstallService(SVC_MANAGER);
      }

      const allSuccess = Object.values(results).every((r: any) => r.success);
      return reply.status(allSuccess ? 200 : 500).send(results);
    },
  );
}
