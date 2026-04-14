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
    const { equipment_id, target_type, target_table, data, timestamp, line_code, filename } = log;
    const extraFields: Record<string, unknown> = {
      equipment_id,
      timestamp: parseTimestamp(timestamp),
      line_code: line_code || '',
      filename: filename || '',
    };

    if (target_type === TARGET_TYPES.PROCEDURE) {
      await dynamicInsert.callProcedure(target_table, data, extraFields);
    } else if (Array.isArray(data.ROWS) && data.ROWS.length > 0) {
      if (data.ROWS.length === 1) {
        // 단건: 기존 경로 유지 (ORA-00001 중복 처리 포함)
        await dynamicInsert.insert(target_table, data.ROWS[0] as Record<string, unknown>, extraFields);
      } else {
        // 다건: executeMany 배치 삽입 — 커넥션 1회 체크아웃으로 N행 처리
        await dynamicInsert.insertMany(target_table, data.ROWS as Record<string, unknown>[], extraFields);
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

    for (const log of logs) {
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

    logger.info({ accepted, failed, total: logs.length }, 'Log batch processed');
    return { accepted, failed };
  }
}

export const logIngestService = new LogIngestService();
