/**
 * @file src/database/repositories/error-log.repository.ts
 * @description LOG_ERROR 테이블 기록용 리포지토리
 *
 * 초보자 가이드:
 * 1. **주요 개념**: DB 삽입 실패 시 에러 정보와 원본 데이터를 LOG_ERROR에 보관
 * 2. **안전 설계**: record() 내부에서 에러를 삼킴 → 에러 로깅이 앱을 크래시시키지 않음
 */

import { BaseRepository } from './base.repository.js';
import { logger } from '../../utils/logger.js';

interface ErrorLogEntry {
  source_table: string;
  equipment_id: string;
  error_message: string;
  raw_data: string;
}

class ErrorLogRepository extends BaseRepository {
  async record(entry: ErrorLogEntry): Promise<void> {
    try {
      await this.executeDml(
        `INSERT INTO LOG_ERROR (
          SOURCE_TABLE, EQUIPMENT_ID, ERROR_MESSAGE, RAW_DATA, CREATED_AT
        ) VALUES (
          :source_table, :equipment_id, :error_message, :raw_data, SYSTIMESTAMP
        )`,
        {
          source_table: entry.source_table,
          equipment_id: entry.equipment_id,
          error_message: entry.error_message.substring(0, 4000),
          raw_data: entry.raw_data.substring(0, 4000),
        },
      );
    } catch (err) {
      // 에러 로깅 실패가 앱을 크래시시키면 안 됨
      logger.error({ err, entry }, 'Failed to record error log');
    }
  }
}

export const errorLogRepository = new ErrorLogRepository();
