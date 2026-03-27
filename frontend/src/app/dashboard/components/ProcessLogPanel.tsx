/**
 * @file components/ProcessLogPanel.tsx
 * @description 처리 로그 패널 — Oracle 테이블 선택 후 로그 조회
 *
 * 초보자 가이드:
 * 1. **테이블 선택**: Registry에 등록된 테이블 목록에서 선택
 * 2. **날짜/시간 범위**: 시작~종료 시간 지정
 * 3. **조회**: 최대 500건까지 조회 가능
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Card, Input, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface LogData { columns: string[]; rows: Record<string, string>[] }

export function ProcessLogPanel() {
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [logData, setLogData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T00:00`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const { t } = useI18n();

  useEffect(() => {
    apiFetch<{ tables: string[] }>('/api/monitor/registry-keys')
      .then(d => setTables(d.tables))
      .catch(() => {});
  }, []);

  const fetchLogs = async (table: string) => {
    if (!table || !startDate || !endDate) return;
    setLoading(true);
    try {
      const url = `/api/monitor/logs?table=${table}&limit=${limit}&startDate=${startDate}&endDate=${endDate}`;
      const d = await apiFetch<LogData>(url);
      setLogData(d);
    } catch { setLogData(null); }
    setLoading(false);
  };

  const handleSelect = (tbl: string) => {
    setSelected(tbl);
    setLogData(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-semibold text-text-secondary uppercase tracking-wider mb-1.5">{t('logs.table')}</label>
          <select value={selected} onChange={e => handleSelect(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
              text-base text-text dark:text-white min-w-[200px]">
            <option value="">{t('logs.selectTable')}</option>
            {tables.map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-text-secondary uppercase tracking-wider mb-1.5">{t('logs.startDate')}</label>
          <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
              text-sm text-text dark:text-white" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-text-secondary uppercase tracking-wider mb-1.5">{t('logs.endDate')}</label>
          <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
              text-sm text-text dark:text-white" />
        </div>
        <div className="w-24">
          <Input label={t('logs.limit')} type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} />
        </div>
        <Button variant="secondary" leftIcon="refresh" onClick={() => fetchLogs(selected)} disabled={!selected || !startDate || !endDate}>
          {t('logs.reload')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
        </div>
      ) : !logData ? (
        <Card className="text-center py-16">
          <Icon name="table_chart" size="xl" className="text-muted-foreground opacity-30 mx-auto mb-3" />
          <p className="text-base text-muted-foreground">{t('logs.selectPrompt')}</p>
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
                  {logData.columns.map(c => (
                    <th key={c} className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!logData.rows.length ? (
                  <tr><td colSpan={logData.columns.length} className="text-center py-8 text-muted-foreground text-sm">{t('logs.noData')}</td></tr>
                ) : logData.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 dark:border-border-dark/50 hover:bg-surface/50 dark:hover:bg-background-dark/50 transition-colors">
                    {logData.columns.map(c => (
                      <td key={c} className="px-4 py-2 text-sm font-mono whitespace-nowrap max-w-xs truncate">
                        {String((row as any)[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground border-t border-border dark:border-border-dark">
            {logData.rows.length} {t('logs.rows')}
          </div>
        </Card>
      )}
    </div>
  );
}
