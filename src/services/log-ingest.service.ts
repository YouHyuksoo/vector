/**
 * @file src/services/log-ingest.service.ts
 * @description 로그 수집 비즈니스 로직 서비스 — 직접 Oracle INSERT
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 수신된 로그를 Oracle DB에 직접 INSERT (BullMQ 큐 없이)
 * 2. **현재 구조**: dynamicInsert로 바로 DB 삽입, 실패 시 에러 로그 기록
 */

import { dynamicInsert } from '../database/dynamic-insert.js';
import { errorLogRepository } from '../database/repositories/error-log.repository.js';
import { logger } from '../utils/logger.js';
import { TARGET_TYPES } from '../config/constants.js';
import type { LogRecord } from '../types/index.js';

/**
 * 타임스탬프 문자열을 Date 객체로 파싱한다.
 * - ISO 8601 (Z 포함/미포함), 공백 구분자 포맷 모두 처리
 * - 파싱 실패 시 원본 문자열 반환 (OracleDB가 2차 파싱 시도)
 * - Date 객체를 OracleDB에 넘기면 DB_TYPE_TIMESTAMP 로 정확하게 바인딩됨
 */
function parseTimestamp(ts: string): Date | string {
  // "YYYY-MM-DD HH:MM:SS" 포맷: new Date()는 공백 구분자를 로컬로 파싱 — 명시적으로 T로 정규화
  const normalized = ts.replace(' ', 'T');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return ts;
  return d;
}

class LogIngestService {
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
      // LOG_ICT: trigger의 self-UPDATE 제거 + DELETE → bulk INSERT 패턴
      // (한 BARCODE = N test rows, 이력 보존 불필요 — 같은 BARCODE 이전 측정은 삭제하고 새 측정으로 대체)
      if (target_table === 'LOG_ICT') {
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
    let accepted = 0;
    let failed = 0;

    // Worker pool 패턴 — 청크 단위 직렬 처리 시 발생한 slowest-wins 문제 제거.
    //  - 이전: 청크 10개 동시 처리 → 가장 느린 1건(ICT 1402행 7초 등)이 다음 청크 시작을 막음.
    //  - 현재: CONCURRENCY worker가 큐에서 LogRecord 가져가 처리, 끝나는 즉시 다음 가져감.
    // CONCURRENCY는 Oracle pool max(40) 안전 범위 — 10 여유로 30 유지.
    const CONCURRENCY = 30;
    let cursor = 0;

    const worker = async () => {
      while (cursor < logs.length) {
        const log = logs[cursor++];
        try {
          await this.processLog(log);
          accepted++;
        } catch (err) {
          failed++;
          logger.error(
            { err, table: log.target_table, equipment_id: log.equipment_id },
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

    const workerCount = Math.min(CONCURRENCY, logs.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    logger.info({ accepted, failed, total: logs.length }, 'Log batch processed');
    return { accepted, failed };
  }
}

export const logIngestService = new LogIngestService();
