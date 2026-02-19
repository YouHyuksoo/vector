/**
 * @file src/config/local-registry.ts
 * @description 타겟 매핑 레지스트리를 로컬 JSON 파일로 관리
 *
 * 초보자 가이드:
 * 1. Oracle DB 대신 config/table-registry.json 파일에 매핑 설정 저장
 * 2. 두 가지 타겟 유형 지원:
 *    - TABLE: Oracle 테이블 컬럼에 소스 필드를 매핑 (기존 방식)
 *    - PROCEDURE: 프로시져에 배열 파라미터로 소스 필드를 전송
 * 3. TABLE 구조: { "테이블명": [ { COLUMN_NAME, SOURCE_FIELD, ... } ] }
 * 4. PROCEDURE 구조: { "키": { targetType: "PROCEDURE", procedureName, params: [...] } }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/** 테이블 타겟용 컬럼 매핑 */
export interface RegistryColumn {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  SOURCE_FIELD: string | null;
  IS_REQUIRED: string;
  COLUMN_ORDER: number;
  DESCRIPTION?: string;
}

/** 프로시져 파라미터 매핑 */
export interface ProcedureParam {
  PARAM_ORDER: number;
  SOURCE_FIELD: string;
  IS_REQUIRED: string;
}

/** 프로시져 타겟 설정 */
export interface ProcedureEntry {
  targetType: 'PROCEDURE';
  procedureName: string;
  params: ProcedureParam[];
}

/** 레지스트리 값: 테이블(배열) 또는 프로시져(객체) */
export type RegistryEntry = RegistryColumn[] | ProcedureEntry;

/** 전체 레지스트리 데이터 */
export type RegistryData = Record<string, RegistryEntry>;

const FILE_PATH = join(process.cwd(), 'config', 'table-registry.json');

function ensureFile(): void {
  const dir = dirname(FILE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(FILE_PATH)) writeFileSync(FILE_PATH, '{}', 'utf-8');
}

/** 프로시져 엔트리 여부 판별 */
export function isProcedureEntry(entry: RegistryEntry): entry is ProcedureEntry {
  return !Array.isArray(entry) && (entry as ProcedureEntry).targetType === 'PROCEDURE';
}

export function readRegistry(): RegistryData {
  ensureFile();
  return JSON.parse(readFileSync(FILE_PATH, 'utf-8'));
}

export function writeRegistry(data: RegistryData): void {
  ensureFile();
  writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** 테이블 컬럼 조회 (TABLE 타겟 전용) */
export function getTableColumns(tableName: string): RegistryColumn[] {
  const data = readRegistry();
  const entry = data[tableName.toUpperCase()];
  if (!entry || isProcedureEntry(entry)) return [];
  return entry;
}

/** 테이블 컬럼 저장 (TABLE 타겟 전용) */
export function setTableColumns(tableName: string, columns: RegistryColumn[]): void {
  const data = readRegistry();
  data[tableName.toUpperCase()] = columns;
  writeRegistry(data);
}

/** 프로시져 설정 조회 */
export function getProcedure(key: string): ProcedureEntry | null {
  const data = readRegistry();
  const entry = data[key];
  if (!entry || !isProcedureEntry(entry)) return null;
  return entry;
}

/** 프로시져 설정 저장 */
export function setProcedure(key: string, config: ProcedureEntry): void {
  const data = readRegistry();
  data[key] = config;
  writeRegistry(data);
}

/** 타겟 삭제 (테이블/프로시져 공용) */
export function deleteTarget(key: string): void {
  const data = readRegistry();
  delete data[key.toUpperCase()];
  // 프로시져는 대소문자 그대로 시도
  if (data[key]) delete data[key];
  writeRegistry(data);
}

/** 등록된 테이블 이름 목록 (TABLE 타겟만) */
export function getRegisteredTableNames(): string[] {
  const data = readRegistry();
  return Object.entries(data)
    .filter(([, entry]) => !isProcedureEntry(entry))
    .map(([name]) => name);
}

/** 등록된 프로시져 키 목록 */
export function getRegisteredProcedureKeys(): string[] {
  const data = readRegistry();
  return Object.entries(data)
    .filter(([, entry]) => isProcedureEntry(entry))
    .map(([name]) => name);
}
