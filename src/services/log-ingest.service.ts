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
]);

// LOG_PRESSFIT 은 여기 넣지 말 것 (2026-07-30 제거).
// TRG_LOG_PRESSFIT_IS_LAST 가 IS_LAST 관리를 위해 자기 테이블을 UPDATE 한다 →
// executeMany(배열 바인딩) 다중행 INSERT 에서 ORA-04091 이 나고 그 배치가 통째로
// 사라진다 (07-18~07-29 손실 원인). 다른 LOG_* 테이블과 동일하게 행별 INSERT 를 쓴다.
// 단행 INSERT ... VALUES 는 mutating table 제약 예외라 트리거 UPDATE 가 정상 동작한다.

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

/**
 * SPI 표준(KohYoung) 행 판별 — INSPECTION_DATE 가 YYYY-MM-DD 형식인 행만 표준.
 * SPI 설비 PC가 같은 폴더(C:\logs\spi\*.csv)에 내는 패드 측정값 파일(고정폭 헤더 + Component ID,PAD ID,Volume...)은
 * VRL 위치 파싱 시 헤더 줄이 MASTER_BARCODE 로, 부품 ID 가 ARRAY_BARCODE 로 밀려 들어가고
 * INSPECTION_DATE 가 비거나 측정 숫자가 된다. 이 데이터는 MES 에서 쓰지 않고, 파일당 수백 행이
 * IS_LAST 트리거(행마다 같은 키 UPDATE)와 락 경합을 일으켜 적재 전체를 막으므로 적재하지 않는다.
 * (2026-10-06 조사: 정상 행의 INSPECTION_DATE 는 항상 날짜 형식이었고 이상 형식은 0건)
 */
const SPI_STD_DATE = /^\d{4}-\d{2}-\d{2}$/;
let nonStandardSpiRowsSkipped = 0;
let noBarcodeSpiRowsSkipped = 0;

function isStandardSpiRow(row: unknown): boolean {
  const d = (row as Record<string, unknown> | null)?.INSPECTION_DATE;
  return typeof d === 'string' && SPI_STD_DATE.test(d);
}

/**
 * 바코드가 없는 SPI 행 판별 — ARRAY_BARCODE 가 비었거나 문자열 'NULL'.
 * SPI-11/SPI-13 은 바코드를 못 읽은 검사 결과를 ARRAY_BARCODE='NULL' 로 내보내는데(최근 정상 날짜 행의 약 75%),
 * 전부 같은 키라서 IS_LAST 트리거의 UPDATE(WHERE ARRAY_BARCODE=:NEW.ARRAY_BARCODE AND IS_LAST='Y')가
 * 한 행에 몰려 락 경합 + 호출당 약 220만 블록 읽기(평균 18.7초)를 일으켜 정상 SPI 적재까지 막는다.
 * MES 는 pid(=실제 바코드)로만 이력을 조회하므로 이 행들은 조회에 쓰이지 않는다.
 * 원본 CSV 는 수신 시 raw 폴더에 먼저 저장되므로(saveRawLogFile) 건너뛰어도 데이터는 보존된다.
 */
function hasSpiBarcode(row: unknown): boolean {
  const b = (row as Record<string, unknown> | null)?.ARRAY_BARCODE;
  return typeof b === 'string' && b.trim() !== '' && b.trim().toUpperCase() !== 'NULL';
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
    // SPI 비표준 행(패드 측정값 파일 등) 제외 — 이미 Aggregator 버퍼에 쌓인 이벤트도 여기서 즉시 걸러 적체를 푼다
    if (log.target_table === 'LOG_SPI' && Array.isArray(log.data?.ROWS)) {
      const rows = log.data.ROWS as unknown[];
      const standard = rows.filter(isStandardSpiRow);
      const valid = standard.filter(hasSpiBarcode);
      if (valid.length !== rows.length) {
        nonStandardSpiRowsSkipped += rows.length - standard.length;
        noBarcodeSpiRowsSkipped += standard.length - valid.length;
        if (valid.length === 0) return;
        log = { ...log, data: { ...log.data, ROWS: valid } };
      }
    }

    const { equipment_id, equipment_type, target_type, target_table, data, timestamp, line_code, filename } = log;
    const extraFields: Record<string, unknown> = {
      equipment_id,
      timestamp: parseTimestamp(timestamp),
      line_code: line_code || '',
      filename: filename || '',
    };

    // 헤더/빈 줄만 있는 이벤트는 .data.ROWS=[] 로 들어온다.
    // 이때 아래 else 분기로 내려가면 전 컬럼 NULL 인 쓰레기 행이 INSERT 된다
    // (2026-07-30 LOG_PRESSFIT 에서 46건 확인).
    // 단 ISCM_BURNIN 처럼 header 필드 + ROWS 를 함께 쓰는 설비는 header-only 행이
    // 정상 적재 대상이므로, ROWS 외 data 필드가 하나도 없을 때만 skip 한다.
    if (
      Array.isArray(data.ROWS) &&
      data.ROWS.length === 0 &&
      Object.keys(data).filter((k) => k !== 'ROWS').length === 0
    ) {
      logger.debug(
        { table: target_table, equipment_id, equipment_type, filename },
        'Empty ROWS event skipped (no data fields)',
      );
      return;
    }

    // 처리 로그에 남길 "실제 적재 행수" — 시도 행수와 다르면 손실이 있다는 뜻
    let insertedRows = Array.isArray(data.ROWS) ? data.ROWS.length : 1;

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
        const result = await dynamicInsert.replaceMany(
          target_table,
          { column: 'BARCODE', values: barcodes },
          rows,
          extraFields,
        );
        // executeMany(batchErrors:true)는 행별 실패를 예외로 던지지 않는다.
        // 여기서 던져야 error-log에 남고 /api/monitor/retry로 재투입할 수 있다.
        // (replaceMany는 BARCODE DELETE 후 INSERT라 재시도해도 중복되지 않는다)
        if (result.failed.length > 0) {
          const first = result.failed[0];
          throw new Error(
            `${target_table} 배치 INSERT 부분 실패: ${result.failed.length}/${result.attempted}행 손실 ` +
              `(적재 ${result.inserted}행, 중복 skip ${result.duplicates}행) — 첫 실패: ORA-${String(first.errorNum).padStart(5, '0')} ${first.message}`,
          );
        }
        insertedRows = result.inserted;
      } else {
        // 기타 LOG_* 테이블: 행별 INSERT 유지 — executeMany 사용 시 같은 transaction 내에서
        // BEFORE INSERT trigger가 같은 테이블 UPDATE 시 ORA-04091 (mutating table) 발생
        // insert()는 ORA-00001(재전송 중복) 이면 0을 반환하므로 합계가 실제 적재 행수다.
        let inserted = 0;
        for (const row of data.ROWS) {
          inserted += await dynamicInsert.insert(target_table, row as Record<string, unknown>, extraFields);
        }
        insertedRows = inserted;
      }
    } else {
      insertedRows = await dynamicInsert.insert(target_table, data, extraFields);
    }

    const stage = target_type === TARGET_TYPES.PROCEDURE ? 'PROCEDURE_CALL' : 'TABLE_INSERT';
    errorLogRepository.success(stage, target_table, equipment_id, `${stage} 성공 (${insertedRows}건)`);
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
        nonStandardSpiRowsSkippedTotal: nonStandardSpiRowsSkipped,
        noBarcodeSpiRowsSkippedTotal: noBarcodeSpiRowsSkipped,
      },
      'Log batch processed',
    );
    return { accepted, failed };
  }
}

export const logIngestService = new LogIngestService();
