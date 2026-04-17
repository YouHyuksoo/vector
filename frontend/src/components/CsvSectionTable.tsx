/**
 * @file src/components/CsvSectionTable.tsx
 * @description CSV 섹션/일반 CSV 테이블 렌더링 컴포넌트 — 로그 뷰어 공용
 *
 * 초보자 가이드:
 * 1. **CsvTableView**: 문자열 content를 받아 섹션 CSV로 해석되면 섹션별 테이블,
 *    아니면 첫 줄을 헤더로 두는 단일 테이블을 그린다.
 * 2. **CsvSectionTable**: 단일 섹션 렌더 (`CsvTableView` 내부에서 섹션별로 호출)
 */
'use client';

import { Card } from '@/components/ui';
import { parseCsvLine, parseSectionedCsv, type CsvSection } from '@/lib/csv-viewer';

export function CsvSectionTable({ section }: { section: CsvSection }) {
  return (
    <div className="mb-4">
      {section.label && (
        <div className="px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 dark:bg-primary/20 rounded-t">
          {section.label}
        </div>
      )}
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="bg-surface dark:bg-surface-dark border-b border-border dark:border-border-dark">
            <th className="px-3 py-2 text-left text-muted-foreground font-bold w-10">#</th>
            {section.header.map((col, i) => (
              <th key={i} className="px-3 py-2 text-left font-bold text-text dark:text-white whitespace-nowrap
                border-l border-border/30 dark:border-border-dark/30">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.data.map((row, ri) => (
            <tr key={ri} className="border-b border-border/20 dark:border-border-dark/20
              hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors">
              <td className="px-3 py-1.5 text-muted-foreground">{ri + 1}</td>
              {section.header.map((_, ci) => (
                <td key={ci} className="px-3 py-1.5 text-text dark:text-white whitespace-nowrap
                  border-l border-border/20 dark:border-border-dark/20">
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
          {section.data.length === 0 && (
            <tr>
              <td colSpan={section.header.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                No data rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CsvTableView({ content }: { content: string }) {
  if (!content.trim()) return null;
  const lines = content.split('\n').filter(l => l.trim());

  const sections = parseSectionedCsv(lines);
  if (sections) {
    return (
      <Card noPadding className="flex-1 overflow-hidden min-h-0">
        <div className="overflow-auto h-full p-2">
          {sections.map((sec, i) => (
            <CsvSectionTable key={i} section={sec} />
          ))}
        </div>
      </Card>
    );
  }

  // 일반 CSV — 첫 줄 헤더, 나머지 데이터
  const rows = lines.map(parseCsvLine);
  const header = rows[0] ?? [];
  const data = rows.slice(1);

  return (
    <Card noPadding className="flex-1 overflow-hidden min-h-0">
      <div className="overflow-auto h-full">
        <table className="w-full text-xs font-mono border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface dark:bg-surface-dark border-b border-border dark:border-border-dark">
              <th className="px-3 py-2 text-left text-muted-foreground font-bold w-10">#</th>
              {header.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left font-bold text-text dark:text-white whitespace-nowrap
                  border-l border-border/30 dark:border-border-dark/30">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="border-b border-border/20 dark:border-border-dark/20
                hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors">
                <td className="px-3 py-1.5 text-muted-foreground">{ri + 1}</td>
                {header.map((_, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-text dark:text-white whitespace-nowrap
                    border-l border-border/20 dark:border-border-dark/20">
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={header.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                  No data rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
