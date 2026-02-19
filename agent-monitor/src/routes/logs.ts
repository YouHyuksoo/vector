/**
 * @file agent-monitor/src/routes/logs.ts
 * @description 최근 감시 대상 파일 목록 조회 API 라우트
 *
 * 초보자 가이드:
 * 1. 이 파일은 Vector가 감시 중인 디렉토리의 최근 파일 목록을 조회합니다
 * 2. GET /api/logs/recent - TOML의 include 패턴에서 디렉토리를 추출하여 최근 파일 20개 반환
 * 3. TOML 파일에서 `include = ["C:\\logs\\*.log"]` 같은 패턴을 파싱합니다
 * 4. 각 디렉토리의 파일을 수정일 기준 내림차순으로 정렬합니다
 * 5. 응답: { files: [...], watchPaths: [...] }
 */

import { FastifyInstance } from 'fastify';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { ENV } from '../server.js';

/** 파일 정보 */
interface FileEntry {
  name: string;
  dir: string;
  modifiedAt: string;
  sizeBytes: number;
}

/** GET /api/logs/recent 응답 타입 */
interface RecentLogsResponse {
  files: FileEntry[];
  watchPaths: string[];
}

/**
 * TOML 파일에서 include 배열의 경로 패턴들을 추출합니다
 * @param content - TOML 파일 내용
 * @returns glob 패턴 문자열 배열
 */
function parseIncludePatterns(content: string): string[] {
  const includeMatch = content.match(/include\s*=\s*\[([\s\S]*?)\]/);
  if (!includeMatch) return [];
  return [...includeMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * glob 패턴 배열에서 고유 디렉토리 목록을 추출합니다
 * @param patterns - include 패턴 배열 (예: ["C:\\logs\\*.log"])
 * @returns 중복 제거된 디렉토리 경로 배열
 */
function extractWatchDirs(patterns: string[]): string[] {
  const dirs = patterns.map((p) => dirname(p.replace(/\\\\/g, '\\')));
  return [...new Set(dirs)];
}

/**
 * 디렉토리에서 파일 목록을 읽어 FileEntry 배열로 반환합니다
 * @param dir - 대상 디렉토리 경로
 * @returns FileEntry 배열
 */
function listFilesInDir(dir: string): FileEntry[] {
  if (!existsSync(dir)) return [];

  try {
    const entries = readdirSync(dir);
    const files: FileEntry[] = [];

    for (const name of entries) {
      try {
        const fullPath = join(dir, name);
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;

        files.push({
          name,
          dir,
          modifiedAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
        });
      } catch {
        /* 접근 불가 파일 건너뛰기 */
      }
    }

    return files;
  } catch {
    return [];
  }
}

/** 최대 반환 파일 수 */
const MAX_FILES = 20;

/** Fastify 플러그인: 최근 감시 파일 목록 라우트 등록 */
export default async function logsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/logs/recent
   * TOML의 include 패턴 디렉토리에서 최근 수정된 파일 20개를 반환합니다
   */
  app.get('/api/logs/recent', async (_req, reply) => {
    const configPath = ENV.VECTOR_CONFIG_PATH;

    if (!existsSync(configPath)) {
      return reply.status(404).send({
        error: 'Config file not found',
        path: configPath,
      });
    }

    let content: string;
    try {
      content = readFileSync(configPath, 'utf-8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'Failed to read config', detail: message });
    }

    const patterns = parseIncludePatterns(content);
    const watchDirs = extractWatchDirs(patterns);

    /* 모든 감시 디렉토리에서 파일 수집 */
    const allFiles: FileEntry[] = [];
    for (const dir of watchDirs) {
      allFiles.push(...listFilesInDir(dir));
    }

    /* 최신 수정일 기준 내림차순 정렬 후 상위 N개 */
    allFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    const recentFiles = allFiles.slice(0, MAX_FILES);

    const response: RecentLogsResponse = {
      files: recentFiles,
      watchPaths: watchDirs,
    };

    return reply.send(response);
  });
}
