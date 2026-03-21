/**
 * @file agent-monitor/src/server.ts
 * @description Vector Agent Manager - 설비 PC 종합 관리 웹 서버
 *
 * 초보자 가이드:
 * 1. 이 파일은 Agent Manager의 메인 엔트리 포인트입니다
 * 2. Fastify 서버를 시작하고 정적 파일(public/)을 서빙합니다
 * 3. /api/* 라우트로 Vector Agent 상태 조회, 설정 관리, 프로세스 제어, 설치/업데이트를 제공합니다
 * 4. 환경변수: PORT, VECTOR_API_URL, VECTOR_CONFIG_PATH, VECTOR_BIN_PATH, MASTER_SERVER_URL
 * 5. pkg exe 빌드 시: public 파일이 EMBEDDED_* 상수로 인라인 임베딩됩니다
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';
import statusRoutes from './routes/status.js';
import configRoutes from './routes/config.js';
import controlRoutes from './routes/control.js';
import logsRoutes from './routes/logs.js';
import setupRoutes from './routes/setup.js';
import installRoutes from './routes/install.js';
import updateRoutes from './routes/update.js';
import serviceRoutes from './routes/service.js';

/** pkg exe 빌드 시 esbuild define으로 주입되는 임베딩 상수 */
declare const EMBEDDED_INDEX_HTML: string;
declare const EMBEDDED_APP_JS: string;

/** 번들 모드 감지 (pkg exe 또는 esbuild 번들 + node 직접 실행) */
const isPkg = !!(process as any).pkg || typeof EMBEDDED_INDEX_HTML !== 'undefined';

/**
 * C:\vector\ 에서 .toml 파일을 동적 탐색합니다
 * PC마다 고유 이름의 TOML을 사용하므로 매 접근 시 재탐색
 */
const CONFIG_DIR = process.env.VECTOR_CONFIG_DIR || 'C:\\vector';

function findTomlConfig(): string | null {
  try {
    if (!existsSync(CONFIG_DIR)) return null;
    const files = readdirSync(CONFIG_DIR).filter(f => f.endsWith('.toml') && !f.endsWith('.bak.toml'));
    return files.length > 0 ? join(CONFIG_DIR, files[0]) : null;
  } catch {
    return null;
  }
}

/** 환경변수 (기본값 포함) — VECTOR_CONFIG_PATH는 매 접근 시 동적 탐색 */
export const ENV = {
  PORT: Number(process.env.PORT) || 9090,
  VECTOR_API_URL: process.env.VECTOR_API_URL || 'http://127.0.0.1:8686',
  get VECTOR_CONFIG_PATH(): string {
    return process.env.VECTOR_CONFIG_PATH || findTomlConfig() || join(CONFIG_DIR, 'vector.toml');
  },
  VECTOR_BIN_PATH: process.env.VECTOR_BIN_PATH || 'C:\\vector\\vector.exe',
  MASTER_SERVER_URL: process.env.MASTER_SERVER_URL || 'http://20.10.30.112:3100',
};

async function main() {
  config();

  const app = Fastify({ logger: true });
  await app.register(fastifyCors);

  if (isPkg) {
    /* exe 모드: public 파일을 인라인으로 서빙 (외부 파일 불필요) */
    app.get('/', (_req, reply) => reply.type('text/html').send(EMBEDDED_INDEX_HTML));
    app.get('/index.html', (_req, reply) => reply.type('text/html').send(EMBEDDED_INDEX_HTML));
    app.get('/app.js', (_req, reply) => reply.type('application/javascript').send(EMBEDDED_APP_JS));
  } else {
    /* 개발 모드: public/ 디렉토리에서 정적 파일 서빙 */
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    await app.register(fastifyStatic, {
      root: join(__dirname, '..', 'public'),
      prefix: '/',
    });
  }

  /** Health check */
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  /* ─── API 라우트 등록 ─── */
  await app.register(statusRoutes);
  await app.register(configRoutes);
  await app.register(controlRoutes);
  await app.register(logsRoutes);
  await app.register(setupRoutes);
  await app.register(installRoutes);
  await app.register(updateRoutes);
  await app.register(serviceRoutes);

  await app.listen({ port: ENV.PORT, host: '0.0.0.0' });
  console.log(`\n  Agent Manager running at http://localhost:${ENV.PORT}\n`);
  console.log(`  Vector API:    ${ENV.VECTOR_API_URL}`);
  console.log(`  Config path:   ${ENV.VECTOR_CONFIG_PATH}`);
  console.log(`  Vector binary: ${ENV.VECTOR_BIN_PATH}`);
  console.log(`  Master server: ${ENV.MASTER_SERVER_URL}\n`);
}

main().catch(err => {
  console.error('\n========================================');
  console.error('  Agent Manager 시작 실패:');
  console.error('========================================');
  console.error(err);
  console.error('\n  이 창은 30초 후 자동으로 닫힙니다.');
  console.error('  Ctrl+C를 눌러 즉시 종료할 수 있습니다.\n');
  setTimeout(() => process.exit(1), 30000);
});
