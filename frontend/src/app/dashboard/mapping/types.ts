/**
 * @file src/app/dashboard/mapping/types.ts
 * @description 타겟 매핑 페이지 타입 정의만 포함 (런타임 상수/함수는 mapping-utils.ts)
 *
 * 초보자 가이드:
 * 1. **TargetType**: 매핑 타겟 유형 — TABLE 또는 PROCEDURE
 * 2. **ColumnMeta**: Oracle 컬럼 메타데이터
 * 3. **RegistryRow**: 테이블 매핑 행
 * 4. **ProcedureParam / ProcedureConfig**: 프로시져 매핑
 * 5. **ParseField**: DB에서 가져오는 파싱 룰 필드
 * 6. **LogType / LogTypeConfig**: 설비 유형 관련
 */

/** 매핑 타겟 유형: 테이블 직접 삽입 또는 프로시져 호출 */
export type TargetType = 'TABLE' | 'PROCEDURE';

export interface ColumnMeta {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  NULLABLE: string;
  DATA_LENGTH: number;
  COLUMN_ID: number;
}

/** 테이블 타겟용 레지스트리 행 */
export interface RegistryRow {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  SOURCE_FIELD: string;
  IS_REQUIRED: string;
  COLUMN_ORDER: number;
}

/** 프로시져 파라미터 매핑 행 */
export interface ProcedureParam {
  PARAM_ORDER: number;
  ARGUMENT_NAME: string;
  DATA_TYPE: string;
  IN_OUT: string;
  SOURCE_FIELD: string;
  IS_REQUIRED: string;
}

/** Oracle DB에서 가져오는 프로시져 목록 아이템 */
export interface OracleProc {
  DISPLAY_NAME: string;
  OBJECT_NAME: string;
  PACKAGE_NAME: string | null;
  OBJECT_TYPE: string;
  ARG_COUNT: number;
}

/** 프로시져 호출 모드 */
export type ProcedureCallMode = 'NAMED' | 'ARRAY';

/** 프로시져 타겟 설정 */
export interface ProcedureConfig {
  targetType: 'PROCEDURE';
  procedureName: string;
  callMode?: ProcedureCallMode;
  arrayTypeName?: string;
  params: ProcedureParam[];
}

/** DB에서 가져오는 파싱 필드 */
export interface ParseField {
  fieldName: string;
  fieldLabel: string;
  fieldOrder: number;
}

/** 설비 유형 문자열 */
export type LogType = string;

export interface LogTypeConfig {
  icon: string;
  fields: { value: string; label: string }[];
}
