/**
 * @file src/index.ts
 * @description 애플리케이션 부트스트랩 진입점
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 모든 인프라(Oracle, Redis, Fastify, BullMQ)를 순서대로 초기화
 * 2. **실행**: `npm run dev` (개발) 또는 `npm start` (프로덕션)
 * 3. **종료**: Ctrl+C → Graceful Shutdown 자동 실행
 *
 * 초기화 순서:
 * 1. Oracle 커넥션 풀 → 2. Fastify 서버 빌드 → 3. BullMQ 워커 시작
 * → 4. Graceful Shutdown 등록 → 5. HTTP 리스닝 시작
 */

import { buildApp } from './server/app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initOraclePool } from './database/oracle.pool.js';
import { startLogInsertWorker } from './queue/workers/log-insert.worker.js';
import { setupGracefulShutdown } from './utils/graceful-shutdown.js';
import { startVector } from './services/vector-process.service.js';

async function bootstrap() {
  logger.info('Starting Log Collection System...');

  try {
    // 1. Oracle 커넥션 풀 초기화
    await initOraclePool();
    logger.info('Oracle pool ready');

    // 2. Fastify 서버 빌드
    const app = await buildApp();

    // 3. BullMQ 워커 시작
    startLogInsertWorker();
    logger.info('BullMQ worker started');

    // 4. Graceful Shutdown 핸들러 등록
    setupGracefulShutdown(app);

    // 5. HTTP 리스닝 시작
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ address }, 'Server is running');

    // 6. Vector aggregator 자동 시작
    const vResult = await startVector();
    if (vResult.success) {
      logger.info({ detail: vResult.message }, 'Vector aggregator auto-started');
    } else {
      logger.warn({ detail: vResult.message }, 'Vector aggregator auto-start skipped');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to start application');
    process.exit(1);
  }
}

bootstrap();
