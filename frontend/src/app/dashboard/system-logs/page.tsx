/**
 * @file src/app/dashboard/system-logs/page.tsx
 * @description 시스템 로그 페이지 — 실시간 메모리 로그 + PM2 디스크 로그 파일 탭 구조
 *
 * 초보자 가이드:
 * 1. **탭 1 - 실시간 로그**: 백엔드 메모리 링버퍼 (최근 500줄, 5초 자동 갱신)
 * 2. **탭 2 - PM2 로그 파일**: 디스크에 저장된 PM2 로그 (영구 보존, 과거 추적용)
 * 3. **API**: GET /api/monitor/system-logs (실시간), GET /api/monitor/pm2-logs (파일)
 */
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon, Card, Pagination } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { SystemLogTable, type LogEntry } from '../components/SystemLogTable';
import { Pm2LogPanel } from '../components/Pm2LogPanel';
import { ProcessLogPanel } from '../components/ProcessLogPanel';
import { ErrorLogPanel } from '../components/ErrorLogPanel';
import { RetryLogPanel } from '../components/RetryLogPanel';

const POLL_INTERVAL = 5000;
const LEVELS = ['all', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
const RT_PAGE_SIZE = 25;
type Tab = 'errors' | 'retry' | 'process' | 'realtime' | 'pm2';

/** API 응답 타입 */
interface SystemLogsResponse {
  total: number;
  count: number;
  entries: LogEntry[];
}

export default function SystemLogsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('errors');

  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rtPage, setRtPage] = useState(1);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [search]);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (level !== 'all') params.set('level', level);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const data = await apiFetch<SystemLogsResponse>(
        `/api/monitor/system-logs?${params.toString()}`,
      );
      setEntries(data.entries);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [level, debouncedSearch, limit]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh && activeTab === 'realtime') {
      timerRef.current = setInterval(fetchLogs, POLL_INTERVAL);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchLogs, activeTab]);

  // realtime 탭 페이지네이션
  const rtTotalPages = Math.max(1, Math.ceil(entries.length / RT_PAGE_SIZE));
  const rtPageData = useMemo(
    () => entries.slice((rtPage - 1) * RT_PAGE_SIZE, rtPage * RT_PAGE_SIZE),
    [entries, rtPage],
  );
  useEffect(() => setRtPage(1), [entries]);

  const levelBtnClass = (l: string) =>
    l === level
      ? 'bg-primary text-white'
      : 'bg-surface dark:bg-surface-dark text-text dark:text-white hover:bg-primary/10';

  const tabClass = (tab: Tab) =>
    tab === activeTab
      ? 'border-b-2 border-primary text-primary font-semibold'
      : 'text-text-secondary hover:text-text dark:hover:text-white';

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-6.5rem)]">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-white flex items-center gap-2">
            <Icon name="terminal" size="md" className="text-primary" />
            {t('systemLogs.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t('systemLogs.subtitle')}
          </p>
        </div>
        {activeTab === 'realtime' && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>{t('systemLogs.bufferSize')}: {total}</span>
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${autoRefresh
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
            >
              <Icon name={autoRefresh ? 'sync' : 'sync_disabled'} size="xs" />
              {autoRefresh ? t('systemLogs.autoOn') : t('systemLogs.autoOff')}
            </button>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-6 border-b border-border dark:border-border-dark flex-shrink-0">
        <button
          onClick={() => setActiveTab('errors')}
          className={`pb-2 px-1 text-sm transition-colors ${tabClass('errors')}`}
        >
          <Icon name="error" size="xs" className="inline mr-1" />
          {t('systemLogs.tabErrors')}
        </button>
        <button
          onClick={() => setActiveTab('retry')}
          className={`pb-2 px-1 text-sm transition-colors ${tabClass('retry')}`}
        >
          <Icon name="replay" size="xs" className="inline mr-1" />
          {t('systemLogs.tabRetry')}
        </button>
        <button
          onClick={() => setActiveTab('process')}
          className={`pb-2 px-1 text-sm transition-colors ${tabClass('process')}`}
        >
          <Icon name="table_chart" size="xs" className="inline mr-1" />
          {t('systemLogs.tabProcess')}
        </button>
        <button
          onClick={() => setActiveTab('realtime')}
          className={`pb-2 px-1 text-sm transition-colors ${tabClass('realtime')}`}
        >
          <Icon name="speed" size="xs" className="inline mr-1" />
          {t('systemLogs.tabRealtime')}
        </button>
        <button
          onClick={() => setActiveTab('pm2')}
          className={`pb-2 px-1 text-sm transition-colors ${tabClass('pm2')}`}
        >
          <Icon name="description" size="xs" className="inline mr-1" />
          {t('systemLogs.tabPm2Files')}
        </button>
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 min-h-0">
        {activeTab === 'errors' ? (
          <ErrorLogPanel />
        ) : activeTab === 'retry' ? (
          <RetryLogPanel />
        ) : activeTab === 'process' ? (
          <ProcessLogPanel />
        ) : activeTab === 'realtime' ? (
          <div className="h-full flex flex-col gap-3">
            {/* 필터 바 */}
            <Card className="flex-shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  {LEVELS.map(l => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase transition-colors
                        ${levelBtnClass(l)}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Icon name="search" size="xs"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={t('systemLogs.searchPlaceholder')}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border dark:border-border-dark
                        bg-background dark:bg-background-dark text-text dark:text-white text-sm
                        focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <select
                  value={limit}
                  onChange={e => setLimit(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg border border-border dark:border-border-dark
                    bg-background dark:bg-background-dark text-text dark:text-white text-sm"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </Card>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm flex-shrink-0">
                <Icon name="error" size="xs" className="inline mr-1" />
                {error}
              </div>
            )}

            <Card noPadding className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-auto">
                <SystemLogTable entries={rtPageData} loading={loading} />
              </div>
              <Pagination
                page={rtPage}
                totalPages={rtTotalPages}
                total={entries.length}
                showing={rtPageData.length}
                onPageChange={setRtPage}
              />
            </Card>
          </div>
        ) : (
          <Pm2LogPanel />
        )}
      </div>
    </div>
  );
}
