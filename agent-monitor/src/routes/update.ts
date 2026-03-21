/**
 * @file agent-monitor/src/routes/update.ts
 * @description Vector 업데이트 확인 및 실행 API
 *
 * 초보자 가이드:
 * 1. GET /api/update/check     - 마스터 서버의 최신 버전과 현재 로컬 버전 비교
 * 2. POST /api/update/execute  - 새 vector.exe 다운로드 후 교체 (Vector 중지 → 교체 → 재시작)
 * 3. 로컬 버전은 `vector.exe --version` 명령으로 확인
 * 4. 서버 버전은 MASTER_SERVER_URL/api/monitor/agent-download/version 으로 확인
 */

import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { existsSync, renameSync, unlinkSync, createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import AdmZip from 'adm-zip';

/** stream pipeline을 Promise로 래핑 (Node 14 호환) */
function pipelineAsync(src: NodeJS.ReadableStream, dst: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    src.pipe(dst);
    dst.on('finish', resolve);
    dst.on('error', reject);
    src.on('error', reject);
  });
}
import { ENV } from '../server.js';

/** 로컬 Vector 버전 조회 */
function getLocalVersion(): string | null {
  try {
    if (!existsSync(ENV.VECTOR_BIN_PATH)) return null;
    const out = execSync(`"${ENV.VECTOR_BIN_PATH}" --version`, {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });
    const m = out.match(/vector\s+(\S+)/i);
    return m?.[1] ?? out.trim();
  } catch {
    return null;
  }
}

/** Vector PID 찾기 */
function findVectorPid(): number | null {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq vector.exe" /FO CSV /NH', {
      encoding: 'utf-8', timeout: 3000, windowsHide: true,
    });
    const m = out.match(/"vector\.exe","(\d+)"/i);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/** OS + 아키텍처 자동 감지로 적합한 Vector edition 결정 */
import { release } from 'os';
const isX86 = process.arch === 'ia32';
const isWin7 = parseInt(release().split('.')[0], 10) < 10; // 6.x = Win7/8, 10.x = Win10+

function detectEdition(): string | undefined {
  if (isX86) return 'x86';       // 32비트는 OS 무관하게 x86 (Node14 빌드, Win7 호환)
  if (isWin7) return 'win7';     // 64비트 + Win7
  return undefined;              // 64비트 + Win10+ (기본값)
}

function editionToParam(edition?: string): string {
  if (edition === 'win7') return '?edition=win7';
  if (edition === 'x86') return '?edition=x86';
  return '';
}

export default async function updateRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/update/check — 버전 비교 (OS/아키텍처 자동 감지) */
  app.get('/api/update/check', async (_req, reply) => {
    const localVersion = getLocalVersion();
    const edition = (_req.query as { edition?: string }).edition ?? detectEdition();
    const editionParam = editionToParam(edition);

    let serverVersion: string | null = null;
    try {
      const res = await fetch(
        `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/version${editionParam}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = await res.json() as { version?: string };
        serverVersion = data.version ?? null;
      }
    } catch { /* 서버 연결 불가 */ }

    const updateAvailable = !!(
      localVersion && serverVersion && localVersion !== serverVersion
    );

    return reply.send({
      localVersion,
      serverVersion,
      updateAvailable,
      edition: edition ?? 'default',
    });
  });

  /** POST /api/update/execute — Vector 업데이트 실행 (OS/아키텍처 자동 감지) */
  app.post('/api/update/execute', async (_req, reply) => {
    const edition = (_req.query as { edition?: string }).edition ?? detectEdition();
    const editionParam = editionToParam(edition);

    try {
      /* 1. Vector 프로세스 중지 */
      const pid = findVectorPid();
      if (pid) {
        execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, windowsHide: true });
        await new Promise(r => setTimeout(r, 2000));
      }

      /* 2. 기존 바이너리 백업 */
      const backupPath = ENV.VECTOR_BIN_PATH + '.old';
      if (existsSync(ENV.VECTOR_BIN_PATH)) {
        if (existsSync(backupPath)) unlinkSync(backupPath);
        renameSync(ENV.VECTOR_BIN_PATH, backupPath);
      }

      /* 3. 새 zip 다운로드 → bin/vector.exe 추출 */
      const downloadUrl = `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/vector${editionParam}`;
      const res = await fetch(downloadUrl);
      if (!res.ok || !res.body) {
        if (existsSync(backupPath)) renameSync(backupPath, ENV.VECTOR_BIN_PATH);
        return reply.status(502).send({
          success: false,
          error: `다운로드 실패: HTTP ${res.status}`,
        });
      }

      const tmpZip = join(tmpdir(), `vector-update-${Date.now()}.zip`);
      try {
        const ws = createWriteStream(tmpZip);
        await pipelineAsync(res.body as any, ws);
        const zip = new AdmZip(tmpZip);
        const binEntry = zip.getEntry('bin/vector.exe');
        if (!binEntry) {
          if (existsSync(backupPath)) renameSync(backupPath, ENV.VECTOR_BIN_PATH);
          return reply.status(500).send({ success: false, error: 'zip에서 bin/vector.exe를 찾을 수 없습니다.' });
        }
        zip.extractEntryTo(binEntry, require('path').dirname(ENV.VECTOR_BIN_PATH), false, true);
      } finally {
        try { if (existsSync(tmpZip)) unlinkSync(tmpZip); } catch { /* ignore */ }
      }

      /* 4. 새 버전 확인 */
      const newVersion = getLocalVersion();

      return reply.send({
        success: true,
        version: newVersion,
        message: '업데이트 완료. 관리 탭에서 Vector를 시작하세요.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
