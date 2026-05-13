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

/**
 * 단계별 timeout으로 stuck 방지. 전체 25초 안에 무조건 process.exit.
 * PM2 kill_timeout=30s 보다 짧게 두어 PM2가 SIGKILL 보내기 전 정상 종료.
 */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<void> {
  await Promise.race([
    p.catch((err) => logger.warn({ err, step: label }, `${label} threw during shutdown`)),
    new Promise<void>((resolve) => setTimeout(() => {
      logger.warn({ step: label, timeoutMs: ms }, `${label} timed out — moving on`);
      resolve();
    }, ms)),
  ]);
}

export function setupGracefulShutdown(app: { close(): Promise<void> }): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    // 어떤 단계든 stuck하면 25초 후 무조건 종료 (PM2 SIGKILL 도착 전 자체 exit)
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown total timeout (25s) — forcing exit');
      process.exit(1);
    }, 25000);
    forceExitTimer.unref();

    try {
      // 1. Vector aggregator 중지 (데이터 유입 차단 먼저) — 최대 15초
      await withTimeout(stopVector().then(() => undefined), 15000, 'stopVector');
      logger.info('Vector aggregator stop step finished');

      // 2. 새 요청 수신 중단 — 최대 5초
      await withTimeout(app.close(), 5000, 'app.close');
      logger.info('Fastify server close step finished');

      // 3. Oracle 커넥션 풀 종료 — 최대 5초
      await withTimeout(closeOraclePool(), 5000, 'closeOraclePool');
      logger.info('Oracle pool close step finished');

      clearTimeout(forceExitTimer);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExitTimer);
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
