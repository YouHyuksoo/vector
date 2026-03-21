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
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir, release } from 'os';
import AdmZip from 'adm-zip';
import { ENV } from '../server.js';

/** OS + 아키텍처 자동 감지 */
const isX86 = process.arch === 'ia32';
const isWin7 = parseInt(release().split('.')[0], 10) < 10;

function detectEdition(): string | undefined {
  if (isX86) return 'x86';
  if (isWin7) return 'win7';
  return undefined;
}

function editionToParam(edition?: string): string {
  if (edition === 'win7') return '?edition=win7';
  if (edition === 'x86') return '?edition=x86';
  return '';
}

export default async function installRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/install/status — 설치 상태 확인 */
  app.get('/api/install/status', async (_req, reply) => {
    const binaryExists = existsSync(ENV.VECTOR_BIN_PATH);
    const configPath = ENV.VECTOR_CONFIG_PATH;
    const configExists = existsSync(configPath);
    return reply.send({
      installed: binaryExists && configExists,
      binaryExists,
      configExists,
      binaryPath: ENV.VECTOR_BIN_PATH,
      configPath,
    });
  });

  /** POST /api/install — vector.zip 다운로드 → 압축 해제 → 기본 TOML 생성 (?edition=win7 지원) */
  app.post('/api/install', async (_req, reply) => {
    const tmpZip = join(tmpdir(), `vector-${Date.now()}.zip`);
    const edition = (_req.query as { edition?: string }).edition ?? detectEdition();

    try {
      /* 1. 마스터 서버에서 Vector 다운로드 (OS/아키텍처 자동 감지) */
      const editionParam = editionToParam(edition);
      const downloadUrl = `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/vector${editionParam}`;
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        return reply.status(502).send({
          success: false,
          error: `다운로드 실패: HTTP ${res.status}`,
        });
      }

      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(tmpZip, buf);

      /* 2. 압축 해제 대상 디렉토리 (C:\vector\) */
      const installDir = dirname(ENV.VECTOR_BIN_PATH);
      if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });

      /* 3. zip 압축 해제 → bin/vector.exe를 C:\vector\vector.exe로 플랫 배치 */
      const zip = new AdmZip(tmpZip);
      for (const entry of zip.getEntries()) {
        const name = entry.entryName.replace(/\\/g, '/');
        if (entry.isDirectory) continue;
        /* bin/vector.exe → vector.exe (루트로 이동) */
        if (name === 'bin/vector.exe') {
          zip.extractEntryTo(entry, installDir, false, true);
        }
        /* *.bat 파일 → 루트에 배치 */
        else if (name.endsWith('.bat') && !name.includes('/')) {
          zip.extractEntryTo(entry, installDir, false, true);
        }
      }

      /* 4. data 디렉토리 생성 */
      const dataDir = join(installDir, 'data');
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

      return reply.send({
        success: true,
        message: `Vector가 ${installDir}에 설치되었습니다. 다운로드 페이지에서 설비 TOML을 받아 같은 폴더에 넣어주세요.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: message });
    } finally {
      try { if (existsSync(tmpZip)) unlinkSync(tmpZip); } catch { /* ignore */ }
    }
  });
}
