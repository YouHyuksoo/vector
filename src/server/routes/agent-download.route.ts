/**
 * @file src/server/routes/agent-download.route.ts
 * @description Vector 바이너리 다운로드 + 버전 정보 API
 *
 * 초보자 가이드:
 * 1. GET /api/monitor/agent-download/vector  — vector.exe 바이너리 스트림 다운로드
 * 2. GET /api/monitor/agent-download/version — vector-bin/version.json 반환
 * 3. vector-bin/ 디렉토리에 vector.exe + version.json을 수동 배치
 */

import { FastifyPluginAsync } from 'fastify';
import { existsSync, readFileSync, createReadStream, statSync } from 'fs';
import { join } from 'path';

const VECTOR_BIN_DIR = join(process.cwd(), 'vector-bin');

export const agentDownloadRoute: FastifyPluginAsync = async (app) => {
  /** GET /api/monitor/agent-download/version — 버전 정보 */
  app.get('/api/monitor/agent-download/version', async (_req, reply) => {
    const versionPath = join(VECTOR_BIN_DIR, 'version.json');
    if (!existsSync(versionPath)) {
      return reply.status(404).send({ error: 'version.json not found' });
    }
    const data = JSON.parse(readFileSync(versionPath, 'utf-8'));
    return reply.send(data);
  });

  /** GET /api/monitor/agent-download/vector — vector.exe 다운로드 */
  app.get('/api/monitor/agent-download/vector', async (_req, reply) => {
    const binaryPath = join(VECTOR_BIN_DIR, 'bin', 'vector.exe');
    if (!existsSync(binaryPath)) {
      return reply.status(404).send({ error: 'vector.exe not found in vector-bin/' });
    }

    const stat = statSync(binaryPath);
    const stream = createReadStream(binaryPath);

    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', 'attachment; filename="vector.exe"')
      .header('Content-Length', stat.size)
      .send(stream);
  });
};
