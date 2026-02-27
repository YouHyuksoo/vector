/**
 * @file src/app/dashboard/mapping/mapping-utils.ts
 * @description 매핑 페이지 유틸 함수 — 필드 병합, 자동 매칭 등
 *
 * 초보자 가이드:
 * 1. **getMergedFields**: 공통 필드 + DB 파싱 룰을 병합하여 완전한 소스 필드 목록 반환
 * 2. **autoMatchField**: Oracle 컬럼명과 VRL 필드를 자동 매칭
 * 3. 설비 유형 목록(LOG_TYPES)과 아이콘(LOG_TYPE_ICONS)은 API에서 가져와야 하지만,
 *    현재는 TOML 파싱 결과(parseRules 키)를 설비 목록으로 사용
 */

import type { ParseField, LogTypeConfig } from './types';

/** 공통 필드 (모든 설비에 포함되는 Vector 기본 필드) */
const COMMON_FIELDS = [
  { value: 'equipment_id', label: 'equipment_id' },
  { value: 'timestamp', label: 'timestamp' },
  { value: 'log_type', label: 'log_type' },
  { value: 'target_table', label: 'target_table' },
  { value: 'filename', label: 'filename' },
];

/** 설비별 아이콘 매핑 (UI 표시용) */
const EQUIPMENT_ICONS: Record<string, string> = {
  SP: 'print',
  SPI: 'search',
  MAOI: 'person_search',
  AOI: 'visibility',
  REFLOW: 'local_fire_department',
  ICT: 'developer_board',
  FCT: 'fact_check',
  BURNIN: 'whatshot',
  HIPOT: 'bolt',
  EOL: 'flag',
  METALMASK: 'grid_on',
  MOUNTER: 'precision_manufacturing',
  VISCOSITY: 'water_drop',
};

/** 설비 유형의 아이콘 반환 (미등록 시 기본 아이콘) */
export function getEquipmentIcon(logType: string): string {
  return EQUIPMENT_ICONS[logType] || 'memory';
}

/** 설비 유형별 config 생성 (공통 필드 + 아이콘) */
export function getLogTypeConfig(logType: string): LogTypeConfig {
  return { icon: getEquipmentIcon(logType), fields: [...COMMON_FIELDS] };
}

/**
 * DB 파싱 룰을 공통 필드와 병합하여 완전한 필드 목록 반환
 * @param logType 설비 유형
 * @param parseRules DB에서 가져온 파싱 룰 (설비 유형별)
 */
export function getMergedFields(
  logType: string,
  parseRules: Record<string, ParseField[]>,
): { value: string; label: string }[] {
  const dbFields = parseRules[logType] || [];
  const dataFields = dbFields.map(f => ({ value: f.fieldName, label: f.fieldLabel || f.fieldName }));
  return [...COMMON_FIELDS, ...dataFields];
}

/**
 * parseRules 키에서 설비 유형 목록 추출 (DB 기반, 하드코딩 아님)
 * + 알려진 설비 유형 순서대로 정렬
 */
export function getLogTypesFromRules(parseRules: Record<string, ParseField[]>): string[] {
  const known = Object.keys(EQUIPMENT_ICONS);
  const fromDb = Object.keys(parseRules);
  const ordered = known.filter(k => fromDb.includes(k));
  const extra = fromDb.filter(k => !known.includes(k));
  return [...ordered, ...extra];
}

/** 파싱 완료 여부 (DB에 data.* 필드가 있으면 true) */
export function isTypeParsed(
  logType: string,
  parseRules: Record<string, ParseField[]>,
): boolean {
  const merged = getMergedFields(logType, parseRules);
  return merged.some(f => f.value.startsWith('data.'));
}

/** 기본 테이블명 생성 (설비 유형 기반) */
export function generateDefaultTableName(logType: string): string {
  return `LOG_${logType.toUpperCase()}`;
}

/** 기본 프로시져명 생성 (설비 유형 기반) */
export function generateDefaultProcName(logType: string): string {
  return `SP_INSERT_${logType.toUpperCase()}`;
}

/** 한글 필드명 → 영문 컬럼명 매핑 (백엔드 oracle-ddl.ts 와 동일) */
const KOREAN_TO_ENGLISH: Record<string, string> = {
  '검사결과': 'INSPECT_RESULT', '검사일': 'INSPECT_DATE', '검사일시': 'INSPECT_DATETIME',
  '검사시간': 'INSPECT_TIME', '검사자': 'INSPECTOR', '검사코드': 'INSPECT_CODE',
  '바코드': 'BARCODE', '시리얼번호': 'SERIAL_NO', '시리얼': 'SERIAL_NO',
  '모델명': 'MODEL_NAME', '모델': 'MODEL', '제품명': 'PRODUCT_NAME', '제품코드': 'PRODUCT_CODE',
  '작업자': 'OPERATOR', '작업일': 'WORK_DATE', '작업일시': 'WORK_DATETIME', '작업시간': 'WORK_TIME',
  '불량코드': 'DEFECT_CODE', '불량유형': 'DEFECT_TYPE', '불량수량': 'DEFECT_QTY',
  '설비명': 'EQUIP_NAME', '설비코드': 'EQUIP_CODE', '설비번호': 'EQUIP_NO',
  '라인코드': 'LINE_CODE', '라인': 'LINE_CODE', '라인명': 'LINE_NAME',
  '수량': 'QTY', '양품수량': 'PASS_QTY', '양품': 'PASS_QTY',
  '판정결과': 'JUDGE_RESULT', '판정': 'JUDGMENT', '결과': 'RESULT',
  '날짜': 'LOG_DATE', '시간': 'LOG_TIME', '일시': 'LOG_DATETIME',
  '생성일': 'CREATED_DATE', '수정일': 'MODIFIED_DATE',
  '파일명': 'FILE_NAME', '비고': 'REMARK', '메모': 'MEMO',
  '구분': 'CATEGORY', '유형': 'TYPE_CODE', '상태': 'STATUS',
  '공정': 'PROCESS', '공정명': 'PROCESS_NAME', '공정코드': 'PROCESS_CODE',
  '로트': 'LOT_ID', '로트번호': 'LOT_NO', '기판': 'PCB_ID',
  '온도': 'TEMPERATURE', '습도': 'HUMIDITY', '전압': 'VOLTAGE', '전류': 'CURRENT',
  '양불판정': 'PASS_FAIL', '합격': 'PASS', '불합격': 'FAIL',
};

const hasKorean = (s: string) => /[\uAC00-\uD7AF\u3130-\u318F]/.test(s);

/** VRL 필드명 → Oracle 컬럼명 (한글 자동 변환, 예약어 접두사) */
export function fieldToColumnName(fieldName: string, index?: number): string {
  const parts = fieldName.split('.');
  let colName = parts[parts.length - 1];
  if (hasKorean(colName)) {
    colName = KOREAN_TO_ENGLISH[colName] ?? `FIELD_${index !== undefined ? index + 1 : 1}`;
  }
  colName = colName.toUpperCase();
  const RESERVED = new Set(['DATE', 'TIME', 'TIMESTAMP', 'NUMBER', 'TABLE', 'INDEX', 'ORDER', 'GROUP',
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'TYPE', 'LEVEL', 'START', 'SIZE', 'MODE',
    'COMMENT', 'COLUMN', 'ROW', 'ROWS', 'SET', 'VALUES', 'CHECK', 'DEFAULT', 'NULL']);
  if (RESERVED.has(colName)) return `LOG_${colName}`;
  return colName;
}

/**
 * 프론트 미리보기용 Oracle 타입 추론 (백엔드 inferOracleType과 동일 로직)
 */
export function inferOracleType(fieldName: string): { dataType: string; nullable: boolean } {
  const upper = fieldName.toUpperCase();
  if (upper === 'INSPECTIONS' || upper.endsWith('_JSON') || upper.endsWith('_DATA')) {
    return { dataType: 'CLOB', nullable: true };
  }
  if (upper.endsWith('_COUNT') || upper.endsWith('_QTY') || upper.endsWith('_NUM')) {
    return { dataType: 'NUMBER', nullable: true };
  }
  if (upper.endsWith('_DATE') || upper.endsWith('_TIME')) {
    return { dataType: 'VARCHAR2(100)', nullable: true };
  }
  if (upper.endsWith('_ID') || upper.endsWith('_CODE')) {
    return { dataType: 'VARCHAR2(100)', nullable: true };
  }
  if (upper.endsWith('_RESULT')) {
    return { dataType: 'VARCHAR2(50)', nullable: true };
  }
  return { dataType: 'VARCHAR2(500)', nullable: true };
}

/**
 * 시스템 컬럼 + data.* 컬럼 목록으로 미리보기 컬럼 생성
 */
export function buildPreviewColumns(
  logType: string,
  parseRules: Record<string, ParseField[]>,
): import('./types').PreviewColumnDef[] {
  const cols: import('./types').PreviewColumnDef[] = [
    { columnName: 'LOG_ID', dataType: 'NUMBER(PK)', nullable: false, isSystem: true, sourceField: '' },
    { columnName: 'EQUIPMENT_ID', dataType: 'VARCHAR2(50)', nullable: false, isSystem: true, sourceField: 'equipment_id' },
    { columnName: 'LOG_TIMESTAMP', dataType: 'TIMESTAMP', nullable: true, isSystem: true, sourceField: 'timestamp' },
  ];

  const fields = parseRules[logType] || [];
  fields.forEach((f, i) => {
    const colName = fieldToColumnName(f.fieldName, i);
    const typeDef = inferOracleType(colName);
    cols.push({
      columnName: colName,
      dataType: typeDef.dataType,
      nullable: typeDef.nullable,
      isSystem: false,
      sourceField: f.fieldName,
    });
  });

  cols.push({ columnName: 'CREATED_AT', dataType: 'TIMESTAMP', nullable: true, isSystem: true, sourceField: '' });
  return cols;
}

/** Oracle 컬럼명을 소스 필드에 자동 매칭 */
export function autoMatchField(
  columnName: string,
  logType: string,
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
