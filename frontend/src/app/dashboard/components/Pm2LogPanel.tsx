/**
 * @file src/app/dashboard/components/Pm2LogPanel.tsx
 * @description PM2 디스크 로그 파일 조회 패널
 *
 * 초보자 가이드:
 * 1. PM2가 디스크에 기록하는 로그 파일(backend-out/error, frontend-out/error)을 조회
 * 2. 서버 재시작 후에도 과거 로그를 확인할 수 있음 (메모리 링버퍼와 차이점)
 * 3. 파일 선택 → 마지막 N줄 → 검색 필터 지원
 * 4. API: GET /api/monitor/pm2-logs, GET /api/monitor/pm2-logs/files
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

/** PM2 로그 파일 정보 */
interface Pm2FileInfo {
  name: string;
  exists: boolean;
  size: number;
}

/** PM2 로그 조회 응답 */
interface Pm2LogResponse {
  file: string;
  lines: string[];
  total: number;
}

/** 파일 크기를 읽기 좋은 형식으로 변환 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function Pm2LogPanel() {
  const { t } = useI18n();

  const [files, setFiles] = useState<Pm2FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState('backend-out.log');
  const [tail, setTail] = useState(200);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [search]);

  /** 파일 목록 조회 */
  useEffect(() => {
    apiFetch<{ files: Pm2FileInfo[] }>('/api/monitor/pm2-logs/files')
      .then(data => setFiles(data.files))
      .catch(() => {});
  }, []);

  /** 로그 내용 조회 */
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('file', selectedFile);
      params.set('tail', String(tail));
      if (debouncedSearch) params.set('search', debouncedSearch);

      const data = await apiFetch<Pm2LogResponse>(
        `/api/monitor/pm2-logs?${params.toString()}`,
      );
      setLines(data.lines);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedFile, tail, debouncedSearch]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  /** 선택된 파일의 크기 정보 */
  const selectedFileInfo = files.find(f => f.name === selectedFile);

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {/* 파일 선택 */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-text-secondary">
              {t('systemLogs.pm2File')}
            </label>
            <select
              value={selectedFile}
              onChange={e => setSelectedFile(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border dark:border-border-dark
                bg-background dark:bg-background-dark text-text dark:text-white text-sm"
            >
              {(files.length > 0 ? files : [
                { name: 'backend-out.log', exists: true, size: 0 },
                { name: 'backend-error.log', exists: true, size: 0 },
                { name: 'frontend-out.log', exists: true, size: 0 },
                { name: 'frontend-error.log', exists: true, size: 0 },
              ]).map(f => (
                <option key={f.name} value={f.name}>
                  {f.name} {f.exists && f.size > 0 ? `(${formatSize(f.size)})` : ''}
                </option>
              ))}
            </select>
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
                placeholder={t('systemLogs.pm2Search')}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border dark:border-border-dark
                  bg-background dark:bg-background-dark text-text dark:text-white text-sm
                  focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* 줄 수 */}
          <select
            value={tail}
            onChange={e => setTail(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-border dark:border-border-dark
              bg-background dark:bg-background-dark text-text dark:text-white text-sm"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>

          {/* 새로고침 + 정보 */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium
                bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <Icon name="refresh" size="xs" className={loading ? 'animate-spin' : ''} />
              {t('systemLogs.pm2Refresh')}
            </button>
            <span className="text-xs text-text-secondary">
              {t('systemLogs.pm2Total')}: {total} {t('systemLogs.pm2Lines')}
            </span>
          </div>
        </div>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          <Icon name="error" size="xs" className="inline mr-1" />
          {error}
        </div>
      )}

      {/* 로그 내용 */}
      <Card noPadding>
        {loading && lines.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            {t('systemLogs.loading')}
          </div>
        ) : lines.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            {t('systemLogs.pm2NoFile')}
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh] p-4">
            <pre className="font-mono text-xs text-text dark:text-gray-300 whitespace-pre-wrap break-all leading-5">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className={`hover:bg-surface dark:hover:bg-surface-dark px-1 ${
                    line.toLowerCase().includes('error') ? 'text-red-600 dark:text-red-400' :
                    line.toLowerCase().includes('warn') ? 'text-yellow-600 dark:text-yellow-400' : ''
                  }`}
                >
                  <span className="text-text-secondary mr-2 select-none">{total - lines.length + idx + 1}</span>
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
