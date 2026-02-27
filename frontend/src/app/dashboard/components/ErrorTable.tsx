/**
 * @file src/app/dashboard/components/ErrorTable.tsx
 * @description 처리 로그 테이블 (STATUS + STAGE 배지 포함)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 처리 로그를 테이블 형태로 렌더링 (정상+오류 통합)
 * 2. **STATUS 배지**: SUCCESS=초록, ERROR=빨강
 * 3. **STAGE 배지**: 파이프라인 단계별 색상 구분
 */
'use client';
import { Card, Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { ProcessLogRow } from '@/lib/api';

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  ERROR: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const STAGE_STYLES: Record<string, string> = {
  HTTP_RECEIVE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  QUEUE_ENQUEUE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  TABLE_INSERT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  PROCEDURE_CALL: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  FILE_WRITE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  VECTOR_CONTROL: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  UNKNOWN: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const STAGE_LABELS: Record<string, string> = {
  HTTP_RECEIVE: 'HTTP',
  QUEUE_ENQUEUE: 'QUEUE',
  TABLE_INSERT: 'TABLE',
  PROCEDURE_CALL: 'PROC',
  FILE_WRITE: 'FILE',
  VECTOR_CONTROL: 'VECTOR',
  UNKNOWN: 'UNKNOWN',
};

export function ErrorTable({ logs }: { logs: ProcessLogRow[] }) {
  const { t } = useI18n();

  return (
    <div>
      <Card noPadding>
        <div className="overflow-x-auto overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-36">{t('error.time')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-20">{t('errors.status')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-24">{t('errors.stage')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-28">{t('error.table')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-24">{t('error.equipment')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('error.message')}</th>
              </tr>
            </thead>
            <tbody>
              {!logs.length ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                  <Icon name="check_circle" size="md" className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('error.empty')}</p>
                </td></tr>
              ) : logs.map(e => (
                <tr key={e.LOG_ID} className="border-b border-border/50 dark:border-border-dark/50 hover:bg-surface/50 dark:hover:bg-background-dark/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-sm text-muted-foreground whitespace-nowrap">{e.CREATED_AT}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${STATUS_STYLES[e.STATUS] ?? STATUS_STYLES.ERROR}`}>
                      {e.STATUS}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${STAGE_STYLES[e.STAGE] ?? STAGE_STYLES.UNKNOWN}`}>
                      {STAGE_LABELS[e.STAGE] ?? e.STAGE}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono bg-primary/10 text-primary">{e.SOURCE_TABLE}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono bg-info/10 text-info">{e.EQUIPMENT_ID}</span>
                  </td>
                  <td className={`px-4 py-2.5 text-sm max-w-xs truncate ${e.STATUS === 'ERROR' ? 'text-error' : 'text-muted-foreground'}`} title={e.MESSAGE}>{e.MESSAGE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
