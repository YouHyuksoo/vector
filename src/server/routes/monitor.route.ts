/**
 * @file src/server/routes/monitor.route.ts
 * @description 모니터링 대시보드 API + HTML 페이지 서빙
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 시스템 상태를 한눈에 볼 수 있는 모니터링 엔드포인트
 * 2. **GET /monitor**: 대시보드 HTML 페이지 반환
 * 3. **GET /api/monitor/overview**: 큐, DB, 장비 상태 등 통합 JSON
 */

import { FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getQueue } from '../../queue/queue.manager.js';
import { QUEUE_NAMES } from '../../config/constants.js';
import { heartbeatService } from '../../redis/heartbeat.service.js';
import { getConnection } from '../../database/oracle.pool.js';
import { getRedisClient } from '../../redis/redis.client.js';
import { logger } from '../../utils/logger.js';

let dashboardHtml: string;

try {
  dashboardHtml = readFileSync(join(process.cwd(), 'public/monitor.html'), 'utf-8');
} catch {
  dashboardHtml = '<h1>Dashboard file not found</h1>';
}

export const monitorRoute: FastifyPluginAsync = async (app) => {
  /** 대시보드 HTML 페이지 */
  app.get('/monitor', async (_request, reply) => {
    reply.type('text/html').send(dashboardHtml);
  });

  /** 통합 모니터링 데이터 */
  app.get('/api/monitor/overview', async (_request, reply) => {
    const [queueStats, equipments, tableStats, recentErrors, redisStatus] =
      await Promise.allSettled([
        getQueueStats(),
        heartbeatService.getAllStatuses(),
        getTableStats(),
        getRecentErrors(),
        checkRedis(),
      ]);

    return reply.send({
      server: {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV ?? 'development',
      },
      redis: redisStatus.status === 'fulfilled' ? redisStatus.value : { connected: false },
      queue: queueStats.status === 'fulfilled'
        ? queueStats.value
        : { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, error: true },
      equipments: equipments.status === 'fulfilled' ? equipments.value : [],
      tables: tableStats.status === 'fulfilled' ? tableStats.value : [],
      recentErrors: recentErrors.status === 'fulfilled' ? recentErrors.value : [],
    });
  });
};

async function getQueueStats() {
  const queue = getQueue(QUEUE_NAMES.LOG_INSERT);
  const counts = await queue.getJobCounts(
    'waiting', 'active', 'completed', 'failed', 'delayed', 'paused',
  );
  return counts;
}

async function getTableStats() {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ TABLE_NAME: string; ROW_COUNT: number }>(
      `SELECT 'LOG_INSPECTION' AS TABLE_NAME, COUNT(*) AS ROW_COUNT FROM LOG_INSPECTION
       UNION ALL SELECT 'LOG_ALARM', COUNT(*) FROM LOG_ALARM
       UNION ALL SELECT 'LOG_PROCESS', COUNT(*) FROM LOG_PROCESS
       UNION ALL SELECT 'LOG_ERROR', COUNT(*) FROM LOG_ERROR`,
    );
    return (result.rows ?? []) as unknown as Array<{ TABLE_NAME: string; ROW_COUNT: number }>;
  } finally {
    await conn.close();
  }
}

async function getRecentErrors() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT ERROR_ID, SOURCE_TABLE, EQUIPMENT_ID, ERROR_MESSAGE,
              TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT
       FROM LOG_ERROR ORDER BY CREATED_AT DESC FETCH FIRST 20 ROWS ONLY`,
    );
    return result.rows ?? [];
  } finally {
    await conn.close();
  }
}

async function checkRedis() {
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    return { connected: pong === 'PONG' };
  } catch {
    return { connected: false };
  }
}
