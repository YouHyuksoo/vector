/**
 * @file src/database/repositories/error-log.repository.ts
 * @description 파일 기반 처리 로그 저장소 (일별 JSONL, 정상+오류 통합)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: DB 대신 JSONL 파일에 기록 → DB 장애 시에도 추적 가능
 * 2. **STATUS**: SUCCESS(정상) / ERROR(오류) 구분
 * 3. **일별 분리**: process-2026-02-26.jsonl 형식으로 날짜별 파일 생성
 * 4. **자동 정리**: 30일 지난 파일 자동 삭제
 * 5. **안전 설계**: record() 내부에서 에러를 삼킴 → 로깅이 앱을 크래시시키지 않음
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { appendFile as appendFileAsync } from 'fs/promises';
import { join } from 'path';
import { logger, localNow } from '../../utils/logger.js';

const LOG_DIR = join(process.cwd(), 'data', 'process-logs');
const FILE_PREFIX = 'process-';
const FILE_EXT = '.jsonl';
const RETENTION_DAYS = 30;
// JSONL 배치 flush: 250ms 또는 50건마다 디스크 기록. event loop block 최소화.
const FLUSH_THRESHOLD = 50;
const FLUSH_INTERVAL_MS = 250;

export interface ProcessLogEntry {
  source_table: string;
  equipment_id: string;
  message: string;
  stage: string;
  status: 'SUCCESS' | 'ERROR';
  raw_data?: string;
}

export interface ProcessLogRecord {
  LOG_ID: number;
  SOURCE_TABLE: string;
  EQUIPMENT_ID: string;
  MESSAGE: string;
  STAGE: string;
  STATUS: string;
  CREATED_AT: string;
  RAW_DATA?: string;
}

export interface ProcessQueryParams {
  status?: string;
  stage?: string;
  sourceTable?: string;
  equipmentId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface ProcessQueryResult {
  logs: ProcessLogRecord[];
  total: number;
  sourceTables: string[];
  equipmentIds: string[];
}

/** 하위 호환용 — 기존 record() 호출 인터페이스 */
export interface ErrorLogEntry {
  source_table: string;
  equipment_id: string;
  error_message: string;
  raw_data: string;
  stage?: string;
}

class ProcessLogRepository {
  private idCounter = 0;
  // 인메모리 인덱스 — query() 응답의 sourceTables/equipmentIds 캐시.
  // 매 query마다 전체 파일을 풀 스캔하지 않도록 write 시 incremental 누적.
  private sourceTablesSet = new Set<string>();
  private equipmentIdsSet = new Set<string>();

  // batch flush 버퍼: 파일경로 → 누적 라인 문자열.
  // single-writer 비동기 패턴 — pending에 push만 동기, 디스크 write는 fs.promises.appendFile
  // 로 백그라운드 처리. event loop은 push 시 미세하게도 안 막음.
  private pendingLines = new Map<string, string>();
  private pendingCount = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private writerInFlight: Promise<void> | null = null;

  constructor() {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    this.initFromRecentFiles();
    this.cleanOldFiles();
  }

  /** 부팅 시 최근 7일 파일을 1회만 스캔 — idCounter 산출 + 인덱스 시드 */
  private initFromRecentFiles(): void {
    const files = this.listLogFiles();
    if (files.length === 0) return;
    const recent = files.slice(-7).map(f => join(LOG_DIR, f));
    for (const fp of recent) {
      for (const r of this.readFile(fp)) {
        if (r.LOG_ID > this.idCounter) this.idCounter = r.LOG_ID;
        for (const t of r.SOURCE_TABLE.split(',')) this.sourceTablesSet.add(t);
        for (const e of r.EQUIPMENT_ID.split(',')) this.equipmentIdsSet.add(e);
      }
    }
  }

  /** 처리 로그 기록 (성공/오류 모두) — 메모리 버퍼에 누적, 50건/250ms마다 batch flush */
  write(entry: ProcessLogEntry): void {
    try {
      this.idCounter++;
      const now = new Date();
      const record: ProcessLogRecord = {
        LOG_ID: this.idCounter,
        SOURCE_TABLE: entry.source_table,
        EQUIPMENT_ID: entry.equipment_id,
        MESSAGE: entry.message.substring(0, 4000),
        STAGE: entry.stage,
        STATUS: entry.status,
        CREATED_AT: localNow(),
        ...(entry.raw_data ? { RAW_DATA: entry.raw_data } : {}),
      };
      const filePath = this.getFilePath(now);
      const line = JSON.stringify(record) + '\n';
      this.pendingLines.set(filePath, (this.pendingLines.get(filePath) ?? '') + line);
      this.pendingCount++;
      // 인덱스 incremental 갱신 (즉시 — query는 flushSync 후 파일에서 읽으므로 일관성 OK)
      for (const t of entry.source_table.split(',')) this.sourceTablesSet.add(t);
      for (const e of entry.equipment_id.split(',')) this.equipmentIdsSet.add(e);
      this.scheduleFlush();
    } catch (err) {
      logger.error({ err, entry }, 'Failed to write process log to file');
    }
  }

  private scheduleFlush(): void {
    // threshold 초과 시 즉시 백그라운드 writer 가동 (단, in-flight면 중복 실행 안 함)
    if (this.pendingCount >= FLUSH_THRESHOLD) {
      this.startWriter();
      return;
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.startWriter();
    }, FLUSH_INTERVAL_MS);
  }

  /** Single-writer 패턴 — 동시에 1개 writer만 실행. 끝날 때 새 pending 있으면 다시 돔. */
  private startWriter(): void {
    if (this.writerInFlight) return;
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    this.writerInFlight = this.runWriter().finally(() => {
      this.writerInFlight = null;
      // 도중에 pending이 다시 쌓였으면 재가동
      if (this.pendingCount > 0) this.startWriter();
    });
  }

  private async runWriter(): Promise<void> {
    while (this.pendingCount > 0) {
      const snapshot = this.pendingLines;
      this.pendingLines = new Map();
      this.pendingCount = 0;
      for (const [fp, content] of snapshot) {
        try {
          await appendFileAsync(fp, content, 'utf-8');
        } catch (err) {
          logger.error({ err, fp }, 'Async append failed');
        }
      }
    }
  }

  /** 백그라운드 writer 끝까지 대기 — async caller용 (route handler에서 await 가능) */
  async flush(): Promise<void> {
    if (this.pendingCount > 0 && !this.writerInFlight) this.startWriter();
    if (this.writerInFlight) await this.writerInFlight;
  }

  /** 동기 flush — shutdown 전용. in-flight writer는 무시하고 남은 pending만 동기 write */
  flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingCount === 0) return;
    const snapshot = this.pendingLines;
    this.pendingLines = new Map();
    this.pendingCount = 0;
    for (const [fp, content] of snapshot) {
      try {
        appendFileSync(fp, content, 'utf-8');
      } catch (err) {
        logger.error({ err, fp }, 'Failed to flush process log batch');
      }
    }
  }

  /** 하위 호환 — 기존 errorLogRepository.record() 호출 지원 (ERROR 기록) */
  async record(entry: ErrorLogEntry): Promise<void> {
    this.write({
      source_table: entry.source_table,
      equipment_id: entry.equipment_id,
      message: entry.error_message,
      stage: entry.stage ?? 'UNKNOWN',
      status: 'ERROR',
      raw_data: entry.raw_data,
    });
  }

  /** 성공 로그 기록 (간편 메서드) */
  success(stage: string, sourceTable: string, equipmentId: string, message: string): void {
    this.write({
      source_table: sourceTable,
      equipment_id: equipmentId,
      message,
      stage,
      status: 'SUCCESS',
    });
  }

  /** 필터 조건에 맞는 로그 목록 조회 */
  query(params: ProcessQueryParams): ProcessQueryResult {
    // batch buffer 비우고 읽기 — 버퍼 내용이 누락되지 않도록.
    this.flushSync();
    // 명시적 날짜 없으면 최근 1일만 로드 (전체 누적 파일 풀 스캔 방지).
    // 더 긴 범위를 보려면 클라이언트가 startDate/endDate를 명시 호출.
    const effectiveStart = (!params.startDate && !params.endDate)
      ? new Date(Date.now() - 86400000).toISOString().substring(0, 10)
      : params.startDate;
    const files = this.getTargetFiles(effectiveStart, params.endDate);
    const all = this.readFiles(files);

    let filtered = all;

    if (params.status && params.status !== 'ALL') {
      filtered = filtered.filter(r => r.STATUS === params.status);
    }
    if (params.stage && params.stage !== 'ALL') {
      filtered = filtered.filter(r => r.STAGE === params.stage);
    }
    if (params.sourceTable && params.sourceTable !== 'ALL') {
      filtered = filtered.filter(r => r.SOURCE_TABLE === params.sourceTable);
    }
    if (params.equipmentId && params.equipmentId !== 'ALL') {
      filtered = filtered.filter(r => r.EQUIPMENT_ID === params.equipmentId);
    }
    if (params.startDate) {
      const start = params.startDate.replace('T', ' ');
      filtered = filtered.filter(r => r.CREATED_AT >= start);
    }
    if (params.endDate) {
      const end = params.endDate.replace('T', ' ');
      filtered = filtered.filter(r => r.CREATED_AT <= end);
    }

    filtered.sort((a, b) => b.CREATED_AT.localeCompare(a.CREATED_AT));

    const total = filtered.length;
    const limit = Math.min(Math.max(params.limit || 100, 1), 500);
    const logs = filtered.slice(0, limit);

    // sourceTables/equipmentIds는 인메모리 인덱스에서 즉시 반환 — 풀 스캔 불필요.
    const sourceTables = [...this.sourceTablesSet].sort();
    const equipmentIds = [...this.equipmentIdsSet].sort();

    return { logs, total, sourceTables, equipmentIds };
  }

  /** LOG_ID 배열로 특정 로그 조회 */
  findByIds(logIds: number[]): ProcessLogRecord[] {
    this.flushSync();
    const files = this.listLogFiles().map(f => join(LOG_DIR, f));
    const all = this.readFiles(files);
    const idSet = new Set(logIds);
    return all.filter(r => idSet.has(r.LOG_ID));
  }

  /** ERROR 상태 + RAW_DATA 있는 로그 전체 조회 */
  findRetryable(): ProcessLogRecord[] {
    this.flushSync();
    const files = this.listLogFiles().map(f => join(LOG_DIR, f));
    const all = this.readFiles(files);
    return all.filter(r => r.STATUS === 'ERROR' && r.RAW_DATA);
  }

  /** 특정 LOG_ID들의 STATUS 업데이트 (JSONL 파일 재작성) */
  updateStatus(logIds: number[], newStatus: string): number {
    this.flushSync();
    const idSet = new Set(logIds);
    let updated = 0;

    for (const file of this.listLogFiles()) {
      const fp = join(LOG_DIR, file);
      const records = this.readFile(fp);
      let changed = false;

      for (const rec of records) {
        if (idSet.has(rec.LOG_ID) && rec.STATUS !== newStatus) {
          rec.STATUS = newStatus;
          changed = true;
          updated++;
        }
      }

      if (changed) {
        const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
        writeFileSync(fp, content, 'utf-8');
      }
    }
    return updated;
  }

  /** 선택한 로그 ID 삭제 */
  deleteByIds(ids: number[]): number {
    if (ids.length === 0) return 0;
    this.flushSync();
    const idSet = new Set(ids);
    const files = this.listLogFiles().map(f => join(LOG_DIR, f));
    let deleted = 0;
    for (const fp of files) {
      const records = this.readFile(fp);
      const before = records.length;
      const kept = records.filter(r => !idSet.has(r.LOG_ID));
      if (kept.length < before) {
        deleted += before - kept.length;
        if (kept.length === 0) {
          unlinkSync(fp);
        } else {
          writeFileSync(fp, kept.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
        }
      }
    }
    return deleted;
  }

  /** 로그 전체 삭제 */
  deleteAll(): number {
    this.pendingLines.clear();
    this.pendingCount = 0;
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    const files = this.listLogFiles();
    let count = 0;
    for (const file of files) {
      count += this.readFile(join(LOG_DIR, file)).length;
      unlinkSync(join(LOG_DIR, file));
    }
    this.idCounter = 0;
    this.sourceTablesSet.clear();
    this.equipmentIdsSet.clear();
    return count;
  }

  private getFilePath(date: Date): string {
    return join(LOG_DIR, `${FILE_PREFIX}${date.toISOString().substring(0, 10)}${FILE_EXT}`);
  }

  private listLogFiles(): string[] {
    if (!existsSync(LOG_DIR)) return [];
    return readdirSync(LOG_DIR)
      .filter(f => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_EXT))
      .sort();
  }

  private getTargetFiles(startDate?: string, endDate?: string): string[] {
    const files = this.listLogFiles();
    if (!startDate && !endDate) return files.map(f => join(LOG_DIR, f));

    const startDay = startDate ? startDate.substring(0, 10) : '0000-00-00';
    const endDay = endDate ? endDate.substring(0, 10) : '9999-99-99';

    return files
      .filter(f => {
        const fileDate = f.replace(FILE_PREFIX, '').replace(FILE_EXT, '');
        return fileDate >= startDay && fileDate <= endDay;
      })
      .map(f => join(LOG_DIR, f));
  }

  private readFiles(filePaths: string[]): ProcessLogRecord[] {
    const records: ProcessLogRecord[] = [];
    for (const fp of filePaths) {
      // spread(...) 사용 금지 — JSONL 한 파일이 ~65,536줄 초과 시
      // V8 함수 인자 한계로 RangeError: Maximum call stack size exceeded 발생
      for (const r of this.readFile(fp)) records.push(r);
    }
    return records;
  }

  private readFile(filePath: string): ProcessLogRecord[] {
    if (!existsSync(filePath)) return [];
    try {
      const content = readFileSync(filePath, 'utf-8').trim();
      if (!content) return [];
      return content.split('\n').map(line => {
        try { return JSON.parse(line) as ProcessLogRecord; } catch { return null; }
      }).filter((r): r is ProcessLogRecord => r !== null);
    } catch {
      return [];
    }
  }

  private cleanOldFiles(): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().substring(0, 10);

    for (const file of this.listLogFiles()) {
      const fileDate = file.replace(FILE_PREFIX, '').replace(FILE_EXT, '');
      if (fileDate < cutoffStr) {
        try {
          unlinkSync(join(LOG_DIR, file));
          logger.info({ file }, 'Old process log file deleted');
        } catch { /* ignore */ }
      }
    }
  }
}

export const errorLogRepository = new ProcessLogRepository();
