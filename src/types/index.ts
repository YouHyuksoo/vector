/**
 * @file src/types/index.ts
 * @description 시스템 전역 공유 타입 정의
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 모든 모듈에서 공통으로 사용하는 인터페이스 중앙 관리
 * 2. **사용 방법**: `import type { LogRecord } from './types/index.js'`
 */

/** 데이터 저장 방식: 테이블 INSERT 또는 프로시져 CALL */
export type TargetType = 'TABLE' | 'PROCEDURE';

/** Vector에서 전송되는 개별 로그 레코드 */
export interface LogRecord {
  equipment_id: string;
  equipment_type?: string;
  log_type: string;
  line_code?: string;
  target_type: TargetType;
  target_table: string;
  timestamp: string;
  data: Record<string, unknown>;
  raw_message?: string;
  filename?: string;
}

/** POST /api/logs 요청 배치 페이로드 */
export interface LogBatch {
  logs: LogRecord[];
}

/** POST /api/heartbeat 요청 페이로드 */
export interface HeartbeatPayload {
  equipment_id: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/** GET /api/status 응답 내 장비 상태 */
export interface EquipmentStatus {
  equipment_id: string;
  online: boolean;
  last_seen?: string;
  metadata?: Record<string, string>;
}

/** TABLE_COLUMN_REGISTRY 테이블 행 */
export interface TableColumnInfo {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  SOURCE_FIELD: string;
  IS_REQUIRED: string;
  COLUMN_ORDER: number;
}

/** 메모리 캐시용 테이블 스키마 */
export interface TableSchema {
  tableName: string;
  columns: TableColumnInfo[];
  insertSql?: string;
}
