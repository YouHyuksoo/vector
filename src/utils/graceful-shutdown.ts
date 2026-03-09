/**
 * @file src/utils/graceful-shutdown.ts
 * @description Graceful Shutdown 핸들러
 *
 * 초보자 가이드:
 * 1. **주요 개념**: SIGINT/SIGTERM 수신 시 순차적으로 리소스를 정리
 * 2. **종료 순서**: Vector(데이터 유입 차단) → Fastify(요청 중단) → Oracle(DB 커넥션)
 */

import { logger } from './logger.js';
import { closeOraclePool } from '../database/oracle.pool.js';
import { stopVector } from '../services/vector-process.service.js';

export function setupGracefulShutdown(app: { close(): Promise<void> }): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    try {
      // 1. Vector aggregator 중지 (데이터 유입 차단 먼저)
      await stopVector().catch(() => {});
      logger.info('Vector aggregator stopped');

      // 2. 새 요청 수신 중단
      await app.close();
      logger.info('Fastify server closed');

      // 3. Oracle 커넥션 풀 종료
      await closeOraclePool();
      logger.info('Oracle pool closed');

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
