/**
 * @file agent-monitor/src/routes/install.ts
 * @description Vector 설치 API — 마스터 서버에서 vector.zip 다운로드 후 압축 해제
 *
 * 초보자 가이드:
 * 1. GET /api/install/status  - Vector 설치 여부 확인 (바이너리 + 설정 파일 존재)
 * 2. POST /api/install        - 마스터 서버에서 vector.zip 다운로드 → C:\vector\ 에 압축 해제
 * 3. 압축 해제 후 기본 TOML 설정 파일 자동 생성
 */

import { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { tmpdir } from 'os';
import AdmZip from 'adm-zip';
import { ENV } from '../server.js';

export default async function installRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/install/status — 설치 상태 확인 */
  app.get('/api/install/status', async (_req, reply) => {
    const binaryExists = existsSync(ENV.VECTOR_BIN_PATH);
    const configExists = existsSync(ENV.VECTOR_CONFIG_PATH);
    return reply.send({
      installed: binaryExists && configExists,
      binaryExists,
      configExists,
      binaryPath: ENV.VECTOR_BIN_PATH,
      configPath: ENV.VECTOR_CONFIG_PATH,
    });
  });

  /** POST /api/install — vector.zip 다운로드 → 압축 해제 → 기본 TOML 생성 */
  app.post('/api/install', async (_req, reply) => {
    const tmpZip = join(tmpdir(), `vector-${Date.now()}.zip`);

    try {
      /* 1. 마스터 서버에서 vector.zip 다운로드 */
      const downloadUrl = `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/vector`;
      const res = await fetch(downloadUrl);
      if (!res.ok || !res.body) {
        return reply.status(502).send({
          success: false,
          error: `다운로드 실패: HTTP ${res.status}`,
        });
      }

      const ws = createWriteStream(tmpZip);
      await pipeline(Readable.fromWeb(res.body as any), ws);

      /* 2. 압축 해제 대상 디렉토리 (C:\vector\) — zip 안에 bin\ 폴더가 포함됨 */
      const installDir = dirname(dirname(ENV.VECTOR_BIN_PATH));
      if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });

      /* 3. zip 압축 해제 */
      const zip = new AdmZip(tmpZip);
      zip.extractAllTo(installDir, true);

      /* 4. data 디렉토리 생성 */
      const dataDir = 'C:\\vector\\data';
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

      return reply.send({
        success: true,
        message: 'Vector가 설치되었습니다. 마스터 서버 다운로드 페이지에서 설비 TOML을 다운받아 config 폴더에 넣어주세요.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: message });
    } finally {
      try { if (existsSync(tmpZip)) unlinkSync(tmpZip); } catch { /* ignore */ }
    }
  });
}
