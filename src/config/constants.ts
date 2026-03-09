/**
 * @file src/config/constants.ts
 * @description 시스템 전역 상수 정의
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 매직 넘버와 문자열을 상수로 중앙 관리
 * 2. **사용 방법**: `import { LOG_TYPES } from './config/constants.js'`
 * 3. **새 로그 타입 추가**: LOG_TYPES, TARGET_TABLES에 추가 후 SQL/Registry도 갱신
 */

export const LOG_TYPES = {
  INSPECTION: 'INSPECTION',
  ALARM: 'ALARM',
  PROCESS: 'PROCESS',
} as const;

export const TARGET_TABLES = {
  INSPECTION: 'LOG_INSPECTION',
  ALARM: 'LOG_ALARM',
  PROCESS: 'LOG_PROCESS',
} as const;

export const TARGET_TYPES = {
  TABLE: 'TABLE',
  PROCEDURE: 'PROCEDURE',
} as const;

/** TABLE_COLUMN_REGISTRY 메모리 캐시 TTL (5분) */
export const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;
