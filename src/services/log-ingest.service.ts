/**
 * @file src/services/log-ingest.service.ts
 * @description 로그 수집 비즈니스 로직 서비스 — 직접 Oracle INSERT
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 수신된 로그를 Oracle DB에 직접 INSERT (BullMQ 큐 없이)
 * 2. **현재 구조**: dynamicInsert로 바로 DB 삽입, 실패 시 에러 로그 기록
 * 3. **동시성**: 전역 Semaphore로 동시 처리 LogRecord 수를 Oracle pool 안에 묶음
 *    — Vector concurrency(8) × 요청별 worker(30) = 240 worker가 pool 40을 두고 경쟁하던 문제 차단
 */

import { dynamicInsert } from '../database/dynamic-insert.js';
import { errorLogRepository } from '../database/repositories/error-log.repository.js';
import { logger } from '../utils/logger.js';
import { TARGET_TYPES } from '../config/constants.js';
import { env } from '../config/env.js';
import type { LogRecord } from '../types/index.js';

/**
 * data.ROWS를 BARCODE 단위 DELETE 후 bulk INSERT로 적재하는 테이블.
 * 자기 테이블을 UPDATE하는 trigger가 없는 테이블만 등록할 것 (executeMany + ORA-04091 회피).
 */
const BARCODE_REPLACE_TABLES = new Set([
  'LOG_ICT',
  'LOG_ISCM_ICT',
  'LOG_PRESSFIT',
]);

/**
 * 단순 Semaphore — 외부 의존성 없이 동시 acquire 수를 max로 제한.
 * acquire()는 release 함수를 반환. release 호출 시 대기 중인 다음 acquire 깨움.
 */
class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    };
  }

  get stats() {
    return { active: this.active, waiting: this.waiters.length, max: this.max };
  }
}

// 전역 DB 동시성 한도 — Oracle pool max에서 안전 마진 5 빼고 사용.
// 모든 /api/logs 요청이 이 한도를 공유 → pool starvation 방지.
const GLOBAL_DB_CONCURRENCY = Math.max(1, env.ORACLE_POOL_MAX - 5);
const dbSemaphore = new Semaphore(GLOBAL_DB_CONCURRENCY);

/**
 * 타임스탬프 문자열을 Date 객체로 파싱한다.
 * - ISO 8601 (Z 포함/미포함), 공백 구분자 포맷 모두 처리
 * - 파싱 실패 시 원본 문자열 반환 (OracleDB가 2차 파싱 시도)
 * - Date 객체를 OracleDB에 넘기면 DB_TYPE_TIMESTAMP 로 정확하게 바인딩됨
 */
function parseTimestamp(ts: string): Date | string {
  const normalized = ts.replace(' ', 'T');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return ts;
  return d;
}

class LogIngestService {
  /** processLog 1건의 단계별 latency 계측 — batch summary에서 누적 */
  private async processLogTimed(log: LogRecord): Promise<{ poolWaitMs: number; insertMs: number }> {
    const acquireStart = Date.now();
    const release = await dbSemaphore.acquire();
    const poolWaitMs = Date.now() - acquireStart;
    const insertStart = Date.now();
    try {
      await this.processLog(log);
      return { poolWaitMs, insertMs: Date.now() - insertStart };
    } finally {
      release();
    }
  }

  async processLog(log: LogRecord): Promise<void> {
    const { equipment_id, equipment_type, target_type, target_table, data, timestamp, line_code, filename } = log;
    const extraFields: Record<string, unknown> = {
      equipment_id,
      timestamp: parseTimestamp(timestamp),
      line_code: line_code || '',
      filename: filename || '',
    };

    // SELECTIVE: 헤더/빈 줄만 있는 이벤트는 .data.ROWS=[] 로 들어옴 — 빈 row INSERT 방지
    if (
      equipment_type === 'SELECTIVE' &&
      Array.isArray(data.ROWS) &&
      data.ROWS.length === 0
    ) {
      return;
    }

    if (target_type === TARGET_TYPES.PROCEDURE) {
      await dynamicInsert.callProcedure(target_table, data, extraFields);
    } else if (Array.isArray(data.ROWS) && data.ROWS.length > 0) {
      // BARCODE 단위 DELETE → bulk INSERT 패턴 (BARCODE_REPLACE_TABLES)
      // 한 BARCODE = N rows, 이력 보존 불필요 — 재검사 시 이전 측정을 삭제하고 새 측정으로 대체.
      // 행별 INSERT를 쓰면 ISCM_ICT_COMP(파일당 1221행)에서 왕복이 폭증해 적체가 난다.
      // 전제: 이 테이블들에는 자기 테이블을 UPDATE하는 trigger가 없어야 함 (ORA-04091 mutating).
      if (BARCODE_REPLACE_TABLES.has(target_table)) {
        const rows = data.ROWS as Record<string, unknown>[];
        const barcodes = [...new Set(rows.map((r) => r.BARCODE).filter((v): v is string => typeof v === 'string' && v.length > 0))];
        await dynamicInsert.replaceMany(
          target_table,
          { column: 'BARCODE', values: barcodes },
          rows,
          extraFields,
        );
      } else {
        // 기타 LOG_* 테이블: 행별 INSERT 유지 — executeMany 사용 시 같은 transaction 내에서
        // BEFORE INSERT trigger가 같은 테이블 UPDATE 시 ORA-04091 (mutating table) 발생
        for (const row of data.ROWS) {
          await dynamicInsert.insert(target_table, row as Record<string, unknown>, extraFields);
        }
      }
    } else {
      await dynamicInsert.insert(target_table, data, extraFields);
    }

    const rowCount = Array.isArray(data.ROWS) ? data.ROWS.length : 1;
    const stage = target_type === TARGET_TYPES.PROCEDURE ? 'PROCEDURE_CALL' : 'TABLE_INSERT';
    errorLogRepository.success(stage, target_table, equipment_id, `${stage} 성공 (${rowCount}건)`);
  }

  async processLogBatch(logs: LogRecord[]): Promise<{ accepted: number; failed: number }> {
    const batchStart = Date.now();
    let accepted = 0;
    let failed = 0;
    // 단계별 latency 누적 + target_table 분해 — batch summary 로깅용
    const stats = { poolWaitMs: 0, insertMs: 0, maxInsertMs: 0 };
    const perTable = new Map<string, { count: number; totalMs: number; maxMs: number; maxRowCount: number }>();
    let slowestLog: { table: string; equipmentType: string; equipmentId: string; rowCount: number; ms: number } | null = null;

    // Worker pool — 요청별 worker 수 한계. 실제 throttle은 모듈 레벨 Semaphore.
    const WORKER_LIMIT = 30;
    let cursor = 0;

    const worker = async () => {
      while (cursor < logs.length) {
        const log = logs[cursor++];
        const rowCount = Array.isArray(log.data?.ROWS) ? log.data.ROWS.length : 1;
        try {
          const { poolWaitMs, insertMs } = await this.processLogTimed(log);
          stats.poolWaitMs += poolWaitMs;
          stats.insertMs += insertMs;
          if (insertMs > stats.maxInsertMs) stats.maxInsertMs = insertMs;
          accepted++;

          // perTable 분해
          const entry = perTable.get(log.target_table) ?? { count: 0, totalMs: 0, maxMs: 0, maxRowCount: 0 };
          entry.count++;
          entry.totalMs += insertMs;
          if (insertMs > entry.maxMs) entry.maxMs = insertMs;
          if (rowCount > entry.maxRowCount) entry.maxRowCount = rowCount;
          perTable.set(log.target_table, entry);

          if (!slowestLog || insertMs > slowestLog.ms) {
            slowestLog = { table: log.target_table, equipmentType: log.equipment_type ?? '', equipmentId: log.equipment_id, rowCount, ms: insertMs };
          }
        } catch (err) {
          failed++;
          logger.error(
            { err, table: log.target_table, equipment_id: log.equipment_id, rowCount },
            'Log insert failed',
          );
          await errorLogRepository.record({
            source_table: log.target_table,
            equipment_id: log.equipment_id,
            error_message: err instanceof Error ? err.message : String(err),
            raw_data: JSON.stringify(log),
            stage: log.target_type === TARGET_TYPES.PROCEDURE ? 'PROCEDURE_CALL' : 'TABLE_INSERT',
          });
        }
      }
    };

    const workerCount = Math.min(WORKER_LIMIT, logs.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const totalMs = Date.now() - batchStart;
    const n = Math.max(1, accepted + failed);

    // Top 3 — maxMs 기준 worst tables (다음 병목 후보 식별)
    const topTables = [...perTable.entries()]
      .map(([table, s]) => ({
        table,
        count: s.count,
        avgMs: Math.round(s.totalMs / s.count),
        maxMs: s.maxMs,
        maxRows: s.maxRowCount,
      }))
      .sort((a, b) => b.maxMs - a.maxMs)
      .slice(0, 3);

    logger.info(
      {
        accepted,
        failed,
        total: logs.length,
        totalMs,
        avgPoolWaitMs: Math.round(stats.poolWaitMs / n),
        avgInsertMs: Math.round(stats.insertMs / n),
        maxInsertMs: stats.maxInsertMs,
        semActive: dbSemaphore.stats.active,
        semWaiting: dbSemaphore.stats.waiting,
        topTables,
        slowest: slowestLog,
      },
      'Log batch processed',
    );
    return { accepted, failed };
  }
}

export const logIngestService = new LogIngestService();
