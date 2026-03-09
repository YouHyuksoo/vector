/**
 * @file src/app/dashboard/system-logs/page.tsx
 * @description 시스템 로그 페이지 — 백엔드 메모리 링버퍼 로그를 실시간 조회
 *
 * 초보자 가이드:
 * 1. **주요 개념**: PM2 없이 백엔드/Vector 프로세스 로그를 웹에서 확인
 * 2. **자동 갱신**: 5초마다 API 폴링으로 최신 로그 표시
 * 3. **필터**: 레벨(all/debug/info/warn/error), 검색어, 표시 건수
 * 4. **API**: GET /api/monitor/system-logs?limit=&level=&search=
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { SystemLogTable, type LogEntry } from '../components/SystemLogTable';

const POLL_INTERVAL = 5000;
const LEVELS = ['all', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

/** API 응답 타입 */
interface SystemLogsResponse {
  total: number;
  count: number;
  entries: LogEntry[];
}

export default function SystemLogsPage() {
  const { t } = useI18n();

  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // 검색어 디바운스 (300ms)
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

  // 초기 로드
  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  // 자동 갱신 타이머
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(fetchLogs, POLL_INTERVAL);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchLogs]);

  /** 레벨별 배지 색상 (필터 버튼용) */
  const levelBtnClass = (l: string) =>
    l === level
      ? 'bg-primary text-white'
      : 'bg-surface dark:bg-surface-dark text-text dark:text-white hover:bg-primary/10';

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-white flex items-center gap-2">
            <Icon name="terminal" size="md" className="text-primary" />
            {t('systemLogs.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t('systemLogs.subtitle')}
          </p>
        </div>
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
      </div>

      {/* 필터 바 */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {/* 레벨 필터 */}
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

          {/* 검색 */}
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

          {/* 표시 건수 */}
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

      {/* 에러 표시 */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          <Icon name="error" size="xs" className="inline mr-1" />
          {error}
        </div>
      )}

      {/* 로그 테이블 */}
      <Card noPadding>
        <SystemLogTable entries={entries} loading={loading} />
      </Card>
    </div>
  );
}
