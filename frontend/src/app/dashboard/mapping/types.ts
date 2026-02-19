/**
 * @file src/app/dashboard/mapping/types.ts
 * @description 타겟 매핑 페이지 타입 정의 및 설비 유형별 소스 필드 상수
 *
 * 초보자 가이드:
 * 1. **TargetType**: 매핑 타겟 유형 — TABLE(테이블 직접 삽입) 또는 PROCEDURE(프로시져 배열 전송)
 * 2. **LogType**: 설비 유형 (SP, SPI, AOI 등 13종)
 * 3. **LOG_TYPE_FIELDS**: 각 설비의 아이콘 + 공통 필드만 포함 (data.* 필드는 DB에서 관리)
 * 4. **autoMatchField**: Oracle 컬럼명과 VRL 필드를 자동 매칭하는 함수
 * 5. **ParseField**: DB에서 가져오는 파싱 룰 필드 타입
 * 6. 파싱 룰 추가 시: 프론트 ParseRuleEditor 또는 API를 통해 DB에 저장
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
  SOURCE_FIELD: string;
  IS_REQUIRED: string;
}

/** 프로시져 타겟 설정 */
export interface ProcedureConfig {
  targetType: 'PROCEDURE';
  procedureName: string;
  params: ProcedureParam[];
}

/** DB에서 가져오는 파싱 필드 */
export interface ParseField {
  fieldName: string;
  fieldLabel: string;
  fieldOrder: number;
}

export type LogType =
  | 'SP' | 'SPI' | 'MAOI' | 'AOI' | 'REFLOW' | 'ICT' | 'FCT'
  | 'BURNIN' | 'HIPOT' | 'EOL' | 'METALMASK' | 'MOUNTER' | 'VISCOSITY';

export interface LogTypeConfig {
  icon: string;
  fields: { value: string; label: string }[];
}

/** 공통 필드 외 data.* 필드가 있으면 파싱 구현된 것으로 판별 */
export const isParsed = (cfg: LogTypeConfig): boolean =>
  cfg.fields.some(f => f.value.startsWith('data.'));

/** 공통 필드 (모든 설비에 포함) */
export const COMMON_FIELDS = [
  { value: 'equipment_id', label: 'equipment_id' },
  { value: 'timestamp', label: 'timestamp' },
  { value: 'log_type', label: 'log_type' },
  { value: 'target_table', label: 'target_table' },
  { value: 'filename', label: 'filename' },
];

/** 설비별 기본 config (공통 필드만 — data.* 필드는 API에서 병합) */
const defaultConfig = (icon: string): LogTypeConfig => ({ icon, fields: [...COMMON_FIELDS] });

/**
 * 설비 유형별 기본 소스 필드 정의
 * - 모든 설비: 공통 필드만 포함
 * - data.* 파싱 필드: DB(VRL_PARSE_FIELDS)에서 런타임 로드하여 병합
 */
export const LOG_TYPE_FIELDS: Record<LogType, LogTypeConfig> = {
  SP:        defaultConfig('print'),
  SPI:       defaultConfig('search'),
  MAOI:      defaultConfig('person_search'),
  AOI:       defaultConfig('visibility'),
  REFLOW:    defaultConfig('local_fire_department'),
  ICT:       defaultConfig('developer_board'),
  FCT:       defaultConfig('fact_check'),
  BURNIN:    defaultConfig('whatshot'),
  HIPOT:     defaultConfig('bolt'),
  EOL:       defaultConfig('flag'),
  METALMASK: defaultConfig('grid_on'),
  MOUNTER:   defaultConfig('precision_manufacturing'),
  VISCOSITY: defaultConfig('water_drop'),
};

export const LOG_TYPES: LogType[] = [
  'SP', 'SPI', 'MAOI', 'AOI', 'REFLOW', 'ICT', 'FCT',
  'BURNIN', 'HIPOT', 'EOL', 'METALMASK', 'MOUNTER', 'VISCOSITY',
];

/**
 * DB 파싱 룰을 LOG_TYPE_FIELDS와 병합하여 완전한 필드 목록 반환
 * @param logType 설비 유형
 * @param parseRules DB에서 가져온 파싱 룰 (설비 유형별)
 */
export function getMergedFields(
  logType: LogType,
  parseRules: Record<string, ParseField[]>,
): { value: string; label: string }[] {
  const base = LOG_TYPE_FIELDS[logType];
  const dbFields = parseRules[logType] || [];
  const dataFields = dbFields.map(f => ({ value: f.fieldName, label: f.fieldLabel || f.fieldName }));
  return [...base.fields, ...dataFields];
}

/** Oracle 컬럼명을 소스 필드에 자동 매칭 */
export function autoMatchField(
  columnName: string,
  logType: LogType,
  allFields: { value: string; label: string }[],
): string {
  const colUpper = columnName.toUpperCase();

  // 자동생성 컬럼은 매핑 제외
  if (colUpper === 'CREATED_AT' || colUpper === 'LOG_ID') return '';

  // 공통 필드 매칭
  if (colUpper === 'EQUIPMENT_ID') return 'equipment_id';
  if (colUpper === 'LOG_TIMESTAMP') return 'timestamp';

  // 설비별 data.* 필드 매칭 (컬럼명 == 필드명의 마지막 부분)
  for (const f of allFields) {
    const fieldName = f.value.split('.').pop()?.toUpperCase() || '';
    if (colUpper === fieldName) return f.value;
  }

  return '';
}
