/**
 * @file src/server/routes/remote-agent.route.ts
 * @description 원격 장비 agent-monitor(9090) 프록시 라우트
 *
 * 초보자 가이드:
 * 1. 프론트엔드 → 마스터서버 → agent-monitor로 요청 중계
 * 2. heartbeat store에서 equipmentId로 장비 IP 조회
 * 3. IP:AGENT_MONITOR_PORT로 HTTP 요청을 보내고 응답을 그대로 반환
 */

import { FastifyPluginAsync } from 'fastify';
import { heartbeatService } from '../../services/heartbeat.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/** agent-monitor에 HTTP 요청을 보내는 공통 함수 */
async function proxyToAgent(
  ip: string,
  path: string,
  method: 'GET' | 'PUT' | 'POST' = 'GET',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `http://${ip}:${env.AGENT_MONITOR_PORT}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    logger.warn({ ip, path, error: String(err) }, 'Agent-monitor proxy failed');
    return { ok: false, status: 0, data: { error: 'Agent monitor unreachable', detail: String(err) } };
  } finally {
    clearTimeout(timeout);
  }
}

/** equipmentId로 heartbeat store에서 IP를 조회 */
function resolveIp(equipmentId: string): string | null {
  const status = heartbeatService.getStatus(equipmentId);
  if (!status) return null;
  const ip = (status.metadata as Record<string, string>)?.ip;
  return ip || null;
}

export const remoteAgentRoute: FastifyPluginAsync = async (app) => {

  /** 원격 장비 상태 조회 */
  app.get('/api/monitor/remote/:equipmentId/status', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, '/api/status');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip, error: 'Agent monitor unreachable' });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 메트릭 조회 */
  app.get('/api/monitor/remote/:equipmentId/metrics', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, '/api/metrics');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 TOML 설정 조회 */
  app.get('/api/monitor/remote/:equipmentId/config', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, '/api/config');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 TOML 설정 저장 */
  app.put('/api/monitor/remote/:equipmentId/config', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const { content } = request.body as { content: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });
    if (!content || typeof content !== 'string') {
      return reply.status(400).send({ error: 'Invalid content' });
    }

    const result = await proxyToAgent(ip, '/api/config', 'PUT', { content });
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 Vector 제어 (start / stop / restart / test-connection) */
  app.post('/api/monitor/remote/:equipmentId/control/:action', async (request, reply) => {
    const { equipmentId, action } = request.params as { equipmentId: string; action: string };
    const validActions = ['start', 'stop', 'restart', 'test-connection'];
    if (!validActions.includes(action)) {
      return reply.status(400).send({ error: `Invalid action: ${action}` });
    }
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, `/api/vector/${action}`, 'POST');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 감시 로그 파일 목록 */
  app.get('/api/monitor/remote/:equipmentId/logs', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, '/api/logs/recent');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 Vector 실행 로그 (vector.log 마지막 100줄) */
  app.get('/api/monitor/remote/:equipmentId/vector-log', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, '/api/vector-log');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 재전송 폴더 파일 목록 */
  app.get('/api/monitor/remote/:equipmentId/resend-logs', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, '/api/logs/resend');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });
};
