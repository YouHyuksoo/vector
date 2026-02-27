/**
 * @file src/config/vrl-target-updater.ts
 * @description VRL 타겟 라우팅 업데이트 유틸 — TOML 내 설비별 target_type/target_table 수정
 *
 * 초보자 가이드:
 * 1. **updateEquipmentTarget()**: VRL 문자열 내 특정 설비 블록의 target_type/target_table을 수정
 * 2. **syncTomlRouting()**: TOML 파일 읽기 → VRL 수정 → 백업 → 저장까지 일괄 처리
 * 3. 프론트엔드에서 매핑 저장 시 이 모듈을 통해 TOML 자동 반영
 */

import { readFileSync, writeFileSync } from 'fs';
import { VECTOR_CONFIG } from '../services/vector-process.service.js';
import { logger } from '../utils/logger.js';

/**
 * 설비 블록의 시작 위치(중괄호 바로 뒤)를 찾는다.
 * 예: `if .equipment_type == "AOI" {` → `{` 바로 뒤 인덱스 반환
 */
function findEquipmentBlockStart(toml: string, equipType: string): number {
  const pattern = new RegExp(
    `(?:if|else if)\\s+\\.equipment_type\\s*==\\s*"${equipType}"\\s*\\{`,
  );
  const m = toml.match(pattern);
  if (!m || m.index === undefined) return -1;
  return m.index + m[0].length;
}

/** 블록 시작 직후 줄바꿈 다음 위치 (새 줄 삽입 지점) */
function findInsertPosition(toml: string, blockStart: number): number {
  const newlinePos = toml.indexOf('\n', blockStart);
  return newlinePos === -1 ? blockStart : newlinePos + 1;
}

/** 중괄호 블록의 끝 위치를 찾는다 */
function findBlockEnd(toml: string, blockStart: number): number {
  let depth = 1;
  for (let i = blockStart; i < toml.length; i++) {
    if (toml[i] === '{') depth++;
    if (toml[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return toml.length;
}

/** 블록 내 target_type/target_table 관련 줄들의 위치를 반환 */
function findTargetLines(
  toml: string,
  blockStart: number,
): { start: number; end: number }[] {
  const lines: { start: number; end: number }[] = [];
  const blockEnd = findBlockEnd(toml, blockStart);
  const segment = toml.slice(blockStart, blockEnd);

  const linePattern = /^[ \t]*#?\s*\.target_(?:type|table)\s*=\s*"[^"]*"[ \t]*$/gm;
  let match;
  while ((match = linePattern.exec(segment)) !== null) {
    const absStart = blockStart + match.index;
    let absEnd = absStart + match[0].length;
    if (toml[absEnd] === '\n') absEnd++;
    lines.push({ start: absStart, end: absEnd });
  }

  return lines;
}

/**
 * VRL 문자열 내 설비 블록의 target_type/target_table을 수정한다.
 * - TABLE: .target_type 줄 제거, targetTable 있으면 .target_table 활성
 * - PROCEDURE: .target_type = "PROCEDURE" + .target_table 삽입
 */
export function updateEquipmentTarget(
  toml: string,
  equipType: string,
  targetType: 'TABLE' | 'PROCEDURE',
  targetTable: string,
): string {
  const blockStart = findEquipmentBlockStart(toml, equipType);
  if (blockStart === -1) return toml;

  const insertPos = findInsertPosition(toml, blockStart);
  const existingLines = findTargetLines(toml, blockStart);

  let result = toml;

  // 기존 target 줄 제거 (역순으로 삭제하여 인덱스 무효화 방지)
  if (existingLines.length > 0) {
    const sorted = [...existingLines].sort((a, b) => b.start - a.start);
    for (const line of sorted) {
      result = result.slice(0, line.start) + result.slice(line.end);
    }
  }

  // 새 줄 삽입
  if (targetType === 'PROCEDURE') {
    const newLines =
      `  .target_type = "PROCEDURE"\n  .target_table = "${targetTable}"\n`;
    const adjustedPos = existingLines.length > 0
      ? findInsertPosition(result, findEquipmentBlockStart(result, equipType))
      : insertPos;
    result = result.slice(0, adjustedPos) + newLines + result.slice(adjustedPos);
  } else {
    const adjustedPos = existingLines.length > 0
      ? findInsertPosition(result, findEquipmentBlockStart(result, equipType))
      : insertPos;
    if (targetTable) {
      const newLines = `  .target_table = "${targetTable}"\n`;
      result = result.slice(0, adjustedPos) + newLines + result.slice(adjustedPos);
    }
  }

  return result;
}

/**
 * TOML 파일을 읽고, 설비 블록의 타겟을 수정한 뒤, 백업 후 저장한다.
 * @param equipmentType 설비 유형 (예: "AOI")
 * @param targetType "TABLE" | "PROCEDURE"
 * @param targetTable 타겟 이름 (테이블명 또는 프로시져명)
 * @param createBackupFn 백업 생성 콜백 (monitorRoute 내부의 createTomlBackup)
 * @returns { success, backupName? }
 */
export function syncTomlRouting(
  equipmentType: string,
  targetType: 'TABLE' | 'PROCEDURE',
  targetTable: string,
  createBackupFn: (source: string) => string,
): { success: boolean; backupName?: string } {
  try {
    const toml = readFileSync(VECTOR_CONFIG, 'utf-8');
    const updated = updateEquipmentTarget(toml, equipmentType, targetType, targetTable);

    // 변경이 없으면 스킵
    if (updated === toml) {
      logger.info({ equipmentType, targetType, targetTable }, 'TOML routing already up-to-date, skip');
      return { success: true };
    }

    const backupName = createBackupFn('mapping-sync');
    writeFileSync(VECTOR_CONFIG, updated, 'utf-8');
    logger.info({ equipmentType, targetType, targetTable, backupName }, 'TOML routing synced');
    return { success: true, backupName };
  } catch (err) {
    logger.error({ err, equipmentType }, 'Failed to sync TOML routing');
    return { success: false };
  }
}
