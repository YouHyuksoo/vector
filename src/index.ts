/**
 * @file src/index.ts
 * @description 애플리케이션 부트스트랩 진입점
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Oracle + Fastify를 순서대로 초기화
 * 2. **실행**: `npm run dev` (개발) 또는 `npm start` (프로덕션)
 * 3. **종료**: Ctrl+C → Graceful Shutdown 자동 실행
 *
 * 초기화 순서:
 * 1. Oracle 커넥션 풀 → 2. Fastify 서버 빌드
 * → 3. Graceful Shutdown 등록 → 4. HTTP 리스닝 시작
 */

import { buildApp } from './server/app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initOraclePool } from './database/oracle.pool.js';
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

    // 3. Graceful Shutdown 핸들러 등록
    setupGracefulShutdown(app);

    // 4. HTTP 리스닝 시작
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ address }, 'Server is running');

    // 5. parse-fields.json 자동 동기화 (배포 시 덮어쓰기 방지)
    try {
      const { readFileSync } = await import('fs');
      const { readParseFields, writeParseFields } = await import('./config/local-parse-fields.js');
      const aggTomlPath = (await import('./services/vector-process.service.js')).VECTOR_CONFIG;
      const { default: extractVrlFieldsFn } = await import('./server/routes/monitor.route.js').then(() => {
        // extractVrlFields는 내부 함수라 직접 접근 불가 → API 호출로 대체
        return { default: null };
      });
      // 서버 시작 후 자체 API 호출로 동기화
      setTimeout(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${env.PORT}/api/monitor/parse-rules/sync`, { method: 'POST' });
          if (res.ok) {
            const data = await res.json() as { synced?: Record<string, number> };
            logger.info({ synced: data.synced }, 'Parse-fields auto-synced from VRL on startup');
          }
        } catch { /* 무시 */ }
      }, 2000);
    } catch { /* 무시 */ }

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
