/**
 * @file src/app/dashboard/receiver/utils/vrl-target-parser.ts
 * @description VRL 코드에서 설비별 target_type/target_table을 추출/교체하는 유틸
 *
 * 초보자 가이드:
 * 1. parseEquipmentTargets(): TOML의 VRL 코드를 분석하여 설비별 타겟 정보 반환
 * 2. updateEquipmentTarget(): 특정 설비의 target_type/target_table을 VRL에 반영
 * 3. 주석 처리된 줄(# .target_type = ...)도 파싱하여 비활성 상태로 표시
 */

/** 설비별 타겟 라우팅 설정 */
export interface EquipmentTarget {
  equipmentType: string;
  targetType: 'TABLE' | 'PROCEDURE';
  targetTable: string;
}

/**
 * VRL 코드에서 `.equipment_type == "XXX"` 패턴을 동적 추출하여 설비 유형 목록을 반환한다.
 * 하드코딩 없이 TOML에 정의된 설비만 표시된다.
 */
export function extractEquipmentTypes(toml: string): string[] {
  const pattern = /\.equipment_type\s*==\s*"([^"]+)"/g;
  const types: string[] = [];
  let match;
  while ((match = pattern.exec(toml)) !== null) {
    if (!types.includes(match[1])) {
      types.push(match[1]);
    }
  }
  return types;
}

/**
 * TOML의 VRL source에서 설비별 target_type/target_table을 추출한다.
 * - 설비 목록을 VRL 코드에서 동적으로 추출 (하드코딩 아님)
 * - 활성 줄: `.target_type = "PROCEDURE"` → PROCEDURE 모드
 * - 주석 줄: `# .target_type = "PROCEDURE"` → TABLE 모드 (기본값)
 * - 줄 없음: TABLE 모드 (기본값)
 */
export function parseEquipmentTargets(toml: string): EquipmentTarget[] {
  const equipmentTypes = extractEquipmentTypes(toml);

  return equipmentTypes.map((eqType) => {
    const block = extractEquipmentBlock(toml, eqType);
    if (!block) {
      return { equipmentType: eqType, targetType: 'TABLE', targetTable: '' };
    }

    const activeType = block.match(/^\s*\.target_type\s*=\s*"([^"]+)"/m);
    const activeTable = block.match(/^\s*\.target_table\s*=\s*"([^"]+)"/m);

    if (activeType && activeType[1] === 'PROCEDURE') {
      return {
        equipmentType: eqType,
        targetType: 'PROCEDURE',
        targetTable: activeTable ? activeTable[1] : '',
      };
    }

    const commentedTable = block.match(/^\s*#\s*\.target_table\s*=\s*"([^"]+)"/m);
    return {
      equipmentType: eqType,
      targetType: 'TABLE',
      targetTable: commentedTable ? commentedTable[1] : '',
    };
  });
}

/**
 * 특정 설비의 target_type/target_table을 VRL에 반영한다.
 * - TABLE로 변경: 기존 .target_type/.target_table 줄을 주석 처리
 * - PROCEDURE로 변경: 주석 해제 또는 새 줄 삽입
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

  if (existingLines.length > 0) {
    const sorted = [...existingLines].sort((a, b) => b.start - a.start);
    for (const line of sorted) {
      result = result.slice(0, line.start) + result.slice(line.end);
    }
  }

  if (targetType === 'PROCEDURE') {
    const newLines =
      `  .target_type = "PROCEDURE"\n  .target_table = "${targetTable}"\n`;
    const adjustedPos = existingLines.length > 0
      ? findInsertPosition(result, findEquipmentBlockStart(result, equipType))
      : insertPos;
    result = result.slice(0, adjustedPos) + newLines + result.slice(adjustedPos);
  } else {
    if (targetTable) {
      const newLines =
        `  # .target_type = "PROCEDURE"\n  # .target_table = "${targetTable}"\n`;
      const adjustedPos = existingLines.length > 0
        ? findInsertPosition(result, findEquipmentBlockStart(result, equipType))
        : insertPos;
      result = result.slice(0, adjustedPos) + newLines + result.slice(adjustedPos);
    }
  }

  return result;
}

/** 설비 블록의 VRL 텍스트를 추출 (if/else if 블록) */
function extractEquipmentBlock(toml: string, equipType: string): string | null {
  const pattern = new RegExp(
    `(?:if|else if)\\s+\\.equipment_type\\s*==\\s*"${equipType}"\\s*\\{([\\s\\S]*?)(?=\\n\\}\\s*else|\\n\\}\\s*$|\\n\\} else)`,
  );
  const m = toml.match(pattern);
  return m ? m[1] : null;
}

/** 설비 블록 시작 위치(중괄호 다음 줄)를 반환 */
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
