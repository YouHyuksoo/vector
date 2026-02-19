/**
 * @file src/config/local-parse-fields.ts
 * @description VRL_PARSE_FIELDS를 로컬 JSON 파일로 관리
 *
 * 초보자 가이드:
 * 1. Oracle DB 대신 config/parse-fields.json 파일에 설비별 파싱 필드 저장
 * 2. VRL 코드에서 자동 추출한 data.* 필드를 저장하여 매핑 페이지에서 사용
 * 3. 구조: { "설비유형": [ { fieldName, fieldLabel, fieldOrder } ] }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface ParseField {
  fieldName: string;
  fieldLabel: string;
  fieldOrder: number;
}

export type ParseFieldsData = Record<string, ParseField[]>;

const FILE_PATH = join(process.cwd(), 'config', 'parse-fields.json');

function ensureFile(): void {
  const dir = dirname(FILE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(FILE_PATH)) writeFileSync(FILE_PATH, '{}', 'utf-8');
}

export function readParseFields(): ParseFieldsData {
  ensureFile();
  return JSON.parse(readFileSync(FILE_PATH, 'utf-8'));
}

export function writeParseFields(data: ParseFieldsData): void {
  ensureFile();
  writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function getFieldsByEquipment(equipmentType: string): ParseField[] {
  const data = readParseFields();
  return data[equipmentType.toUpperCase()] ?? [];
}

export function setFieldsByEquipment(equipmentType: string, fields: ParseField[]): void {
  const data = readParseFields();
  data[equipmentType.toUpperCase()] = fields;
  writeParseFields(data);
}

export function deleteFieldsByEquipment(equipmentType: string): boolean {
  const data = readParseFields();
  const existed = equipmentType.toUpperCase() in data;
  delete data[equipmentType.toUpperCase()];
  writeParseFields(data);
  return existed;
}
