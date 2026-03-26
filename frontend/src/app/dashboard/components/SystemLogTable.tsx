/**
 * @file src/app/dashboard/components/SystemLogTable.tsx
 * @description 시스템 로그 테이블 컴포넌트 — 레벨별 색상 구분, 시간/컴포넌트/메시지 표시
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 백엔드 메모리 링버퍼에서 가져온 시스템 로그를 테이블로 표시
 * 2. **레벨 색상**: error=빨강, warn=노랑, info=파랑, debug=회색
 * 3. **부모 컴포넌트**: system-logs/page.tsx 에서 데이터를 받아 렌더링
 */

'use client';

import { useI18n } from '@/contexts/I18nContext';

/** 로그 항목 타입 (백엔드 LogEntry와 동일) */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  component?: string;
}

/** 레벨별 배지 스타일 */
const LEVEL_STYLES: Record<string, string> = {
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  fatal: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
  warn: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  debug: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
  trace: 'bg-gray-50 text-gray-500 dark:bg-gray-800/20 dark:text-gray-500',
};

/** 컴포넌트별 배지 스타일 */
const COMPONENT_STYLES: Record<string, string> = {
  backend: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'vector-aggregator': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

interface SystemLogTableProps {
  entries: LogEntry[];
  loading: boolean;
}

export function SystemLogTable({ entries, loading }: SystemLogTableProps) {
  const { t } = useI18n();

  if (loading && entries.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary">
        {t('systemLogs.loading')}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary">
        {t('systemLogs.noLogs')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border dark:border-border-dark">
            <th className="text-left py-2 px-3 font-medium text-text-secondary w-44">
              {t('systemLogs.time')}
            </th>
            <th className="text-left py-2 px-3 font-medium text-text-secondary w-20">
              {t('systemLogs.level')}
            </th>
            <th className="text-left py-2 px-3 font-medium text-text-secondary w-36">
              {t('systemLogs.component')}
            </th>
            <th className="text-left py-2 px-3 font-medium text-text-secondary">
              {t('systemLogs.message')}
            </th>
          </tr>
        </thead>
        <tbody className="font-mono text-xs">
          {entries.map((entry, idx) => (
            <tr
              key={`${entry.timestamp}-${idx}`}
              className="border-b border-border/50 dark:border-border-dark/50
                hover:bg-surface dark:hover:bg-surface-dark transition-colors"
            >
              <td className="py-1.5 px-3 text-text-secondary whitespace-nowrap">
                {formatTime(entry.timestamp)}
              </td>
              <td className="py-1.5 px-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase
                  ${LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.info}`}>
                  {entry.level}
                </span>
              </td>
              <td className="py-1.5 px-3">
                {entry.component && (
                  <span className={`inline-block px-2 py-0.5 rounded text-xs
                    ${COMPONENT_STYLES[entry.component] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {entry.component}
                  </span>
                )}
              </td>
              <td className="py-1.5 px-3 text-text dark:text-white break-all max-w-xl">
                {entry.message}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ISO 타임스탬프를 HH:mm:ss.SSS 형식으로 변환 */
function formatTime(iso: string): string {
  if (!iso) return '—';
  return iso.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
}
