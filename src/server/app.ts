/**
 * @file src/server/app.ts
 * @description Fastify 인스턴스 생성 및 플러그인/라우트 등록
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Fastify 앱 팩토리 패턴으로 테스트 용이성 확보
 * 2. **사용 방법**: `const app = await buildApp()` → `app.listen()`
 * 3. **플러그인 추가**: register()로 새 플러그인/라우트 등록
 */

import Fastify from 'fastify';
import { logger } from '../utils/logger.js';
import { healthPlugin } from './plugins/health.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { logIngestRoute } from './routes/log-ingest.route.js';
import { heartbeatRoute } from './routes/heartbeat.route.js';
import { statusRoute } from './routes/status.route.js';
import { monitorRoute } from './routes/monitor.route.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  // Plugins
  await app.register(errorHandlerPlugin);
  await app.register(healthPlugin);

  // Routes
  await app.register(logIngestRoute, { prefix: '/api' });
  await app.register(heartbeatRoute, { prefix: '/api' });
  await app.register(statusRoute, { prefix: '/api' });
  await app.register(monitorRoute);

  return app;
}
