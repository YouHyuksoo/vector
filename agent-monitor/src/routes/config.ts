/**
 * @file agent-monitor/src/routes/config.ts
 * @description Vector TOML 설정 파일 읽기/쓰기 API 라우트
 *
 * 초보자 가이드:
 * 1. 이 파일은 Vector의 TOML 설정 파일을 HTTP API로 읽고 수정할 수 있게 합니다
 * 2. GET /api/config  - 현재 TOML 설정 내용을 문자열로 반환합니다
 * 3. PUT /api/config  - 새 설정 내용을 저장합니다 (.bak 백업 자동 생성)
 * 4. ENV.VECTOR_CONFIG_PATH 경로의 파일을 읽고 씁니다
 * 5. 파일이 없으면 404를 반환합니다
 */

import { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { ENV } from '../server.js';

/** GET /api/config 응답 타입 */
interface ConfigReadResponse {
  content: string;
  path: string;
}

/** PUT /api/config 요청 body 타입 */
interface ConfigWriteBody {
  content: string;
}

/** Fastify 플러그인: Vector 설정 파일 읽기/쓰기 라우트 등록 */
export default async function configRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/config
   * 현재 TOML 설정 파일의 내용을 반환합니다
   */
  app.get('/api/config', async (_req, reply) => {
    const configPath = ENV.VECTOR_CONFIG_PATH;

    if (!existsSync(configPath)) {
      return reply.status(404).send({
        error: 'Config file not found',
        path: configPath,
      });
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const response: ConfigReadResponse = { content, path: configPath };
      return reply.send(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'Failed to read config', detail: message });
    }
  });

  /**
   * PUT /api/config
   * 새 설정 내용을 저장합니다 (기존 파일은 .bak으로 백업)
   */
  app.put<{ Body: ConfigWriteBody }>('/api/config', async (req, reply) => {
    const configPath = ENV.VECTOR_CONFIG_PATH;
    const { content } = req.body || {};

    if (!content || typeof content !== 'string') {
      return reply.status(400).send({ error: 'Missing or invalid "content" in request body' });
    }

    /* 기존 파일이 있으면 .bak 백업 생성 */
    try {
      if (existsSync(configPath)) {
        copyFileSync(configPath, configPath + '.bak');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'Failed to create backup', detail: message });
    }

    /* 새 내용 저장 */
    try {
      writeFileSync(configPath, content, 'utf-8');
      return reply.send({
        success: true,
        path: configPath,
        backupPath: configPath + '.bak',
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'Failed to write config', detail: message });
    }
  });
}
