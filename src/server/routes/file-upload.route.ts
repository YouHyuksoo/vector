/**
 * @file src/server/routes/file-upload.route.ts
 * @description 설비 로그 파일 업로드 API
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 설비에서 직접 로그 파일을 HTTP로 업로드할 수 있는 엔드포인트
 * 2. **저장 경로**: data/uploads/{equipmentId}/{날짜}/{파일명}
 * 3. **사용법**: POST /api/upload - multipart/form-data (equipmentId + files)
 * 4. **조회**: GET /api/upload/files?equipmentId=XXX - 업로드된 파일 목록 조회
 */

import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { logger } from '../../utils/logger.js';

const UPLOAD_BASE = join(process.cwd(), 'data', 'uploads');

/** 날짜 폴더명 생성 (YYYY-MM-DD) */
function todayFolder(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 안전한 파일명 변환 (경로 순회 방지) */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_').substring(0, 200);
}

/** 중복 파일명 방지: 이미 존재하면 타임스탬프 접미사 추가 */
function uniquePath(dir: string, filename: string): string {
  const target = join(dir, filename);
  if (!existsSync(target)) return target;
  const ext = extname(filename);
  const base = filename.slice(0, -ext.length || undefined);
  const ts = Date.now();
  return join(dir, `${base}_${ts}${ext}`);
}

export const fileUploadRoute: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  });

  /** POST /api/upload - 파일 업로드 */
  app.post('/upload', { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const parts = request.parts();
    let equipmentId = 'UNKNOWN';
    const saved: { filename: string; size: number; path: string }[] = [];

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'equipmentId') {
        equipmentId = sanitizeFilename(String(part.value));
        continue;
      }

      if (part.type === 'file') {
        const date = todayFolder();
        const dir = join(UPLOAD_BASE, equipmentId, date);
        mkdirSync(dir, { recursive: true });

        const safeName = sanitizeFilename(part.filename);
        const filePath = uniquePath(dir, safeName);

        await pipeline(part.file, createWriteStream(filePath));

        const size = statSync(filePath).size;
        saved.push({
          filename: safeName,
          size,
          path: `${equipmentId}/${date}/${safeName}`,
        });

        logger.info(`파일 업로드: ${equipmentId}/${date}/${safeName} (${(size / 1024).toFixed(1)}KB)`);
      }
    }

    return reply.status(200).send({
      success: true,
      equipmentId,
      files: saved,
      count: saved.length,
    });
  });

  /** GET /api/upload/files - 업로드된 파일 목록 조회 */
  app.get('/upload/files', async (request, reply) => {
    const { equipmentId, date } = request.query as { equipmentId?: string; date?: string };

    if (!existsSync(UPLOAD_BASE)) {
      return reply.send({ files: [], equipments: [] });
    }

    const equipments = readdirSync(UPLOAD_BASE).filter(
      (d) => statSync(join(UPLOAD_BASE, d)).isDirectory(),
    );

    const files: { equipmentId: string; date: string; filename: string; size: number; uploadedAt: string }[] = [];

    const targetEquipments = equipmentId ? [equipmentId] : equipments;

    for (const eq of targetEquipments) {
      const eqDir = join(UPLOAD_BASE, eq);
      if (!existsSync(eqDir)) continue;

      const dates = readdirSync(eqDir).filter(
        (d) => statSync(join(eqDir, d)).isDirectory(),
      );
      const targetDates = date ? dates.filter((d) => d === date) : dates;

      for (const dt of targetDates) {
        const dtDir = join(eqDir, dt);
        const fileNames = readdirSync(dtDir);
        for (const f of fileNames) {
          const stat = statSync(join(dtDir, f));
          files.push({
            equipmentId: eq,
            date: dt,
            filename: f,
            size: stat.size,
            uploadedAt: (() => { const d = stat.mtime; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; })(),
          });
        }
      }
    }

    files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

    return reply.send({ files, equipments });
  });

  /** GET /api/upload/download - 업로드된 파일 다운로드 */
  app.get('/upload/download', async (request, reply) => {
    const { path: relPath } = request.query as { path?: string };
    if (!relPath) {
      return reply.status(400).send({ error: 'path required' });
    }
    if (relPath.includes('..')) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const filePath = join(UPLOAD_BASE, relPath);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      return reply.status(404).send({ error: 'File not found' });
    }
    try {
      const fileName = relPath.replace(/\\/g, '/').split('/').pop() || 'download';
      const stat = statSync(filePath);
      const stream = createReadStream(filePath);
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
        .header('Content-Length', stat.size)
        .send(stream);
    } catch (err) {
      logger.error({ err, relPath }, 'Failed to download uploaded file');
      return reply.status(500).send({ error: String(err) });
    }
  });
};
