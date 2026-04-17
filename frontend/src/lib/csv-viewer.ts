/**
 * @file src/lib/csv-viewer.ts
 * @description CSV 로그 파일 파싱 유틸리티 — 섹션 라벨이 섞인 복합 CSV와 단일 CSV를 모두 처리
 *
 * 초보자 가이드:
 * 1. **parseCsvLine**: 한 줄을 콤마로 분리 (따옴표 이스케이프 처리)
 * 2. **isSectionLabel**: 콤마 없는 단독 영문 라벨이면 섹션 헤더로 간주 (예: "BoardInfo")
 * 3. **parseSectionedCsv**: 섹션 라벨로 블록을 구분해 header/data로 분해.
 *    섹션이 하나도 없으면 null 반환 → 호출 측에서 단일 CSV로 fallback 처리
 */

export interface CsvSection {
  label: string;
  header: string[];
  data: string[][];
}

/** CSV 한 줄을 파싱 (따옴표 처리 포함) */
export function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

/** 섹션 라벨 판별 — 콤마 없는 단독 영문 라벨 */
export function isSectionLabel(parsed: string[]): boolean {
  return parsed.length === 1 && /^[A-Za-z][A-Za-z0-9_ ]*$/.test(parsed[0]);
}

/** 섹션 구분이 있는 CSV 파싱 — 섹션이 하나도 없으면 null 반환 */
export function parseSectionedCsv(lines: string[]): CsvSection[] | null {
  const sections: CsvSection[] = [];
  let i = 0;

  // ── 1) 섹션 라벨 이전에 나타나는 CSV 줄들을 별도 섹션으로 수집 ──
  //    (예: SPI_VD 파일의 MasterBarcode 헤더/데이터 행)
  const preLines: string[] = [];
  while (i < lines.length) {
    const parsed = parseCsvLine(lines[i]);
    if (isSectionLabel(parsed)) break;
    preLines.push(lines[i]);
    i++;
  }
  if (preLines.length >= 2) {
    sections.push({
      label: '',
      header: parseCsvLine(preLines[0]),
      data: preLines.slice(1).map(parseCsvLine),
    });
  }

  // ── 2) 섹션 라벨 블록 파싱 ──
  while (i < lines.length) {
    const parsed = parseCsvLine(lines[i]);
    if (isSectionLabel(parsed)) {
      const label = parsed[0];
      i++;
      if (i >= lines.length) break;
      const header = parseCsvLine(lines[i]);
      i++;
      const data: string[][] = [];
      while (i < lines.length) {
        const next = parseCsvLine(lines[i]);
        if (isSectionLabel(next)) break;
        data.push(next);
        i++;
      }
      sections.push({ label, header, data });
    } else {
      i++;
    }
  }
  return sections.length >= 1 ? sections : null;
}
