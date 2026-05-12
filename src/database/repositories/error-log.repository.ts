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
import { join } from 'path';
import { logger, localNow } from '../../utils/logger.js';

const LOG_DIR = join(process.cwd(), 'data', 'process-logs');
const FILE_PREFIX = 'process-';
const FILE_EXT = '.jsonl';
const RETENTION_DAYS = 30;

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

  constructor() {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    this.idCounter = this.getMaxId();
    this.cleanOldFiles();
  }

  /** 처리 로그 기록 (성공/오류 모두) */
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
      appendFileSync(this.getFilePath(now), JSON.stringify(record) + '\n', 'utf-8');
    } catch (err) {
      logger.error({ err, entry }, 'Failed to write process log to file');
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
    const files = this.getTargetFiles(params.startDate, params.endDate);
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

    // flatMap은 중간 배열을 통째로 생성해 30만 행에서 heap을 크게 소모.
    // Set에 직접 누적하여 메모리 사용 절감.
    const sourceTablesSet = new Set<string>();
    const equipmentIdsSet = new Set<string>();
    for (const r of all) {
      for (const t of r.SOURCE_TABLE.split(',')) sourceTablesSet.add(t);
      for (const e of r.EQUIPMENT_ID.split(',')) equipmentIdsSet.add(e);
    }
    const sourceTables = [...sourceTablesSet].sort();
    const equipmentIds = [...equipmentIdsSet].sort();

    return { logs, total, sourceTables, equipmentIds };
  }

  /** LOG_ID 배열로 특정 로그 조회 */
  findByIds(logIds: number[]): ProcessLogRecord[] {
    const files = this.listLogFiles().map(f => join(LOG_DIR, f));
    const all = this.readFiles(files);
    const idSet = new Set(logIds);
    return all.filter(r => idSet.has(r.LOG_ID));
  }

  /** ERROR 상태 + RAW_DATA 있는 로그 전체 조회 */
  findRetryable(): ProcessLogRecord[] {
    const files = this.listLogFiles().map(f => join(LOG_DIR, f));
    const all = this.readFiles(files);
    return all.filter(r => r.STATUS === 'ERROR' && r.RAW_DATA);
  }

  /** 특정 LOG_ID들의 STATUS 업데이트 (JSONL 파일 재작성) */
  updateStatus(logIds: number[], newStatus: string): number {
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
    const files = this.listLogFiles();
    let count = 0;
    for (const file of files) {
      count += this.readFile(join(LOG_DIR, file)).length;
      unlinkSync(join(LOG_DIR, file));
    }
    this.idCounter = 0;
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

  private getMaxId(): number {
    const files = this.listLogFiles();
    if (files.length === 0) return 0;
    // LOG_ID는 증가형 카운터 — 최신 파일의 마지막 줄이 최대값.
    // 날짜 경계 직후 새 파일이 비어있을 가능성을 대비해 최근 2개 파일만 스캔.
    const recent = files.slice(-2).map(f => join(LOG_DIR, f));
    let max = 0;
    for (const fp of recent) {
      for (const r of this.readFile(fp)) {
        if (r.LOG_ID > max) max = r.LOG_ID;
      }
    }
    return max;
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
