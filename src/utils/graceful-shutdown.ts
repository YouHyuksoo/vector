/**
 * @file src/utils/graceful-shutdown.ts
 * @description Graceful Shutdown 핸들러
 *
 * 초보자 가이드:
 * 1. **주요 개념**: SIGINT/SIGTERM 수신 시 순차적으로 리소스를 정리
 * 2. **종료 순서**: Fastify(요청 중단) → Worker(작업 완료) → Queue → Oracle → Redis
 * 3. **왜 순서가 중요한가**: Worker가 Oracle을 사용하므로 Worker를 먼저 종료해야 안전
 */

import { logger } from './logger.js';
import { closeAllQueues } from '../queue/queue.manager.js';
import { closeOraclePool } from '../database/oracle.pool.js';
import { closeRedis } from '../redis/redis.client.js';
export function setupGracefulShutdown(app: { close(): Promise<void> }): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    try {
      // 1. 새 요청 수신 중단
      await app.close();
      logger.info('Fastify server closed');

      // 2. BullMQ 워커 및 큐 종료
      await closeAllQueues();
      logger.info('All queues and workers closed');

      // 3. Oracle 커넥션 풀 종료
      await closeOraclePool();
      logger.info('Oracle pool closed');

      // 4. Redis 연결 종료
      await closeRedis();
      logger.info('Redis connection closed');

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
