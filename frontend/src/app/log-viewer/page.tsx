/**
 * @file src/app/log-viewer/page.tsx
 * @description AOI 로그 파일 뷰어 — 외부 프로그램이 URL로 호출해 단일 파일만 표시
 *
 * 초보자 가이드:
 * 1. 쿼리 파라미터: line(라인코드), date(날짜 폴더명), file(파일명). 셋 다 필수.
 * 2. 백엔드 경로 조립: AOI/{line}/{date}/{file} → /api/monitor/log-files/read?path=...
 * 3. 대시보드 레이아웃(헤더/사이드바) 밖의 최상위 라우트이므로 화면 전체를 차지.
 * 4. useSearchParams()는 Next.js App Router 정적 생성 시 Suspense 경계가 필요.
 *    LogViewerInner를 Suspense로 감싸는 패턴을 사용.
 */
'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { CsvTableView } from '@/components/CsvSectionTable';

interface FileContent {
  path: string;
  content: string;
  total: number;
  filtered: number;
}

/** useSearchParams()를 사용하는 실제 뷰어 — Suspense 안에서만 렌더 */
function LogViewerInner() {
  const params = useSearchParams();
  const line = params.get('line') ?? '';
  const date = params.get('date') ?? '';
  const file = params.get('file') ?? '';

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FileContent | null>(null);

  const missing: string[] = [];
  if (!line) missing.push('line');
  if (!date) missing.push('date');
  if (!file) missing.push('file');

  const relPath = `AOI/${line}/${date}/${file}`;

  const load = useCallback(async () => {
    if (missing.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ path: relPath });
      if (search) qs.set('search', search);
      const res = await apiFetch<FileContent>(`/api/monitor/log-files/read?${qs.toString()}`);
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('File not found')) {
        setError(`파일을 찾을 수 없습니다: ${relPath}`);
      } else {
        setError(`파일을 읽을 수 없습니다: ${msg}`);
      }
      setData(null);
    }
    setLoading(false);
  }, [relPath, search, missing.length]);

  useEffect(() => { load(); }, [load]);

  // ── 파라미터 누락 ──
  if (missing.length > 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="text-center">
          <div className="text-lg font-bold text-red-600 mb-2">필수 파라미터 누락</div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            다음 파라미터가 필요합니다: <code>{missing.join(', ')}</code>
          </div>
          <div className="text-xs text-gray-400 mt-2">
            예) /log-viewer?line=AOI-001&amp;date=2026-04-16&amp;file=AOI_20260416.csv
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="text-sm font-mono text-gray-700 dark:text-gray-200 truncate">
          <span className="text-gray-400">AOI / </span>
          <span className="font-bold">{line}</span>
          <span className="text-gray-400"> / </span>
          <span>{date}</span>
          <span className="text-gray-400"> / </span>
          <span className="font-bold">{file}</span>
        </div>
        <button
          onClick={load}
          className="text-xs px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          disabled={loading}
        >
          {loading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>

      {/* 검색바 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="검색어 입력 (엔터)"
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          className="flex-1 px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800"
        />
        {data && (
          <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            표시 {data.filtered}/{data.total} 줄
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-hidden min-h-0 p-2">
        {loading && (
          <div className="h-full flex items-center justify-center text-gray-500">
            로그 파일 불러오는 중...
          </div>
        )}
        {!loading && error && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="text-red-600 text-sm">{error}</div>
            <button
              onClick={load}
              className="text-xs px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              재시도
            </button>
          </div>
        )}
        {!loading && !error && data && (
          <CsvTableView content={data.content} />
        )}
      </div>
    </div>
  );
}

/** 페이지 진입점 — useSearchParams Suspense 경계 래핑 */
export default function LogViewerPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-900 text-gray-500">
        로딩 중...
      </div>
    }>
      <LogViewerInner />
    </Suspense>
  );
}
