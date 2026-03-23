/**
 * @file src/server/routes/agent-download.route.ts
 * @description Vector 바이너리 다운로드 + 버전 정보 API
 *
 * 초보자 가이드:
 * 1. GET /api/monitor/agent-download/vector  — vector.zip 다운로드 (설비 PC에서 압축 해제)
 * 2. GET /api/monitor/agent-download/version — vector-bin/version.json 반환
 * 3. 서버의 vector-bin/vector.zip을 서빙합니다
 */

import { FastifyPluginAsync } from 'fastify';
import { existsSync, readFileSync, createReadStream, statSync } from 'fs';
import { join } from 'path';

const VECTOR_BIN_DIR = join(process.cwd(), 'vector-bin');

export const agentDownloadRoute: FastifyPluginAsync = async (app) => {
  /** GET /api/monitor/agent-download/version — 버전 정보 (edition별) */
  app.get('/api/monitor/agent-download/version', async (_req, reply) => {
    const versionPath = join(VECTOR_BIN_DIR, 'version.json');
    if (!existsSync(versionPath)) {
      return reply.status(404).send({ error: 'version.json not found' });
    }
    const data = JSON.parse(readFileSync(versionPath, 'utf-8'));
    return reply.send(data);
  });

  /** GET /api/monitor/agent-download/vector — vector zip 다운로드 (?edition=x86 지원) */
  app.get('/api/monitor/agent-download/vector', async (_req, reply) => {
    const edition = (_req.query as { edition?: string }).edition;
    const zipMap: Record<string, string> = { win7: 'vector-win7.zip', x86: 'vector-x86.zip', 'win7-x86': 'vector-x86.zip' };
    const zipFile = zipMap[edition ?? ''] ?? 'vector.zip';
    const zipPath = join(VECTOR_BIN_DIR, zipFile);
    if (!existsSync(zipPath)) {
      return reply.status(404).send({ error: `${zipFile} not found in vector-bin/` });
    }

    const stat = statSync(zipPath);
    const stream = createReadStream(zipPath);

    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${zipFile}"`)
      .header('Content-Length', stat.size)
      .send(stream);
  });
};
