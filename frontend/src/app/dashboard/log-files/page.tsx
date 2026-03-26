/**
 * @file src/app/dashboard/log-files/page.tsx
 * @description 로그파일검색 — 원본 로그 파일 폴더 탐색기 + 텍스트 뷰어
 *
 * 초보자 가이드:
 * 1. **좌측 패널**: RAW_LOG_BASE_PATH 하위 폴더/파일 트리 탐색
 * 2. **우측 패널**: 선택한 파일의 원본 텍스트를 그대로 표시
 * 3. **검색**: 파일 내 키워드 줄 단위 필터링
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Button, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface DirEntry {
  name: string;
  type: 'dir' | 'file';
  size?: number;
}

interface FileContent {
  path: string;
  content: string;
  total: number;
  filtered: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** CSV 내용을 테이블로 렌더링 */
function CsvTableView({ content }: { content: string }) {
  if (!content.trim()) return null;
  const lines = content.split('\n').filter(l => l.trim());
  const rows = lines.map(line => {
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
  });
  const header = rows[0] ?? [];
  const data = rows.slice(1);

  return (
    <Card noPadding className="flex-1 overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-340px)]">
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

export default function LogFilesPage() {
  const { t } = useI18n();

  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  /** 디렉토리 내용 조회 */
  const loadDir = useCallback(async (path: string) => {
    setDirLoading(true);
    try {
      const qs = path ? `?path=${encodeURIComponent(path)}` : '';
      const res = await apiFetch<{ entries: DirEntry[]; currentPath: string }>(
        `/api/monitor/log-files${qs}`,
      );
      setEntries(res.entries);
      setCurrentPath(res.currentPath);
    } catch {
      setEntries([]);
    }
    setDirLoading(false);
  }, []);

  useEffect(() => { loadDir(''); }, [loadDir]);

  /** 파일 원본 읽기 */
  const loadFile = useCallback(async (filePath: string, keyword?: string) => {
    setFileLoading(true);
    try {
      const params = new URLSearchParams({ path: filePath });
      if (keyword) params.set('search', keyword);
      const res = await apiFetch<FileContent>(
        `/api/monitor/log-files/read?${params.toString()}`,
      );
      setFileContent(res);
    } catch {
      setFileContent(null);
    }
    setFileLoading(false);
  }, []);

  const handleEntryClick = (entry: DirEntry) => {
    const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.type === 'dir') {
      setSelectedFile(null);
      setFileContent(null);
      setSearch('');
      setChecked(new Set());
      loadDir(newPath);
    } else {
      setSelectedFile(newPath);
      loadFile(newPath);
    }
  };

  const handleGoUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    setSelectedFile(null);
    setFileContent(null);
    setSearch('');
    setChecked(new Set());
    loadDir(parentPath);
  };

  const handleSearch = () => {
    if (selectedFile) loadFile(selectedFile, search || undefined);
  };

  const toggleCheck = (name: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (checked.size === entries.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(entries.map(e => e.name)));
    }
  };

  /** 선택된 파일/폴더 삭제 */
  const handleDelete = async () => {
    if (checked.size === 0) return;
    const msg = t('logFiles.confirmDelete').replace('{count}', String(checked.size));
    if (!confirm(msg)) return;

    setDeleting(true);
    try {
      const paths = Array.from(checked).map(name =>
        currentPath ? `${currentPath}/${name}` : name,
      );
      const res = await apiFetch<{ deleted: number; failed: number }>(
        '/api/monitor/log-files',
        { method: 'DELETE', body: JSON.stringify({ paths }) },
      );
      if (res.deleted > 0) {
        alert(t('logFiles.deleted').replace('{count}', String(res.deleted)));
      }
      if (res.failed > 0) {
        alert(t('logFiles.deleteFailed').replace('{count}', String(res.failed)));
      }
      // 삭제된 파일이 현재 보고있는 파일이면 뷰어 초기화
      if (selectedFile && checked.has(selectedFile.split('/').pop() || '')) {
        setSelectedFile(null);
        setFileContent(null);
      }
      setChecked(new Set());
      loadDir(currentPath);
    } catch {
      alert('Delete failed');
    }
    setDeleting(false);
  };

  /** 경로를 breadcrumb 세그먼트로 분리 */
  const pathSegments = currentPath ? currentPath.split('/') : [];

  const handleBreadcrumb = (index: number) => {
    const newPath = pathSegments.slice(0, index + 1).join('/');
    setSelectedFile(null);
    setFileContent(null);
    setSearch('');
    setChecked(new Set());
    loadDir(newPath);
  };

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="folder_open" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-info">
            {t('logFiles.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">
            / {t('logFiles.subtitle')}
          </span>
        </h1>
      </div>

      {/* 경로 탐색 바 — 상단 고정 */}
      <Card className="flex items-center gap-3 px-4 py-2.5">
        <Icon name="folder_open" size="sm" className="text-warning shrink-0" />
        <div className="flex items-center gap-1.5 text-sm font-mono overflow-x-auto whitespace-nowrap flex-1">
          <button
            onClick={() => { setSelectedFile(null); setFileContent(null); setSearch(''); setChecked(new Set()); loadDir(''); }}
            className="px-2 py-0.5 rounded-md font-bold text-primary hover:bg-primary/10 transition-colors shrink-0"
          >
            ROOT
          </button>
          {pathSegments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <Icon name="chevron_right" size="xs" className="text-muted-foreground/50" />
              <button
                onClick={() => handleBreadcrumb(i)}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors
                  ${i === pathSegments.length - 1
                    ? 'bg-primary/10 text-text dark:text-white font-bold'
                    : 'text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark'
                  }`}
              >
                {seg}
              </button>
            </span>
          ))}
          {pathSegments.length === 0 && (
            <span className="text-muted-foreground/60 italic ml-1">/</span>
          )}
        </div>
        {currentPath && (
          <button
            onClick={handleGoUp}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium
              text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0
              border border-border/50 dark:border-border-dark/50"
          >
            <Icon name="arrow_upward" size="xs" />
            ..
          </button>
        )}
        {checked.size > 0 && (
          <Button variant="danger" leftIcon="delete" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? '...' : `${t('logFiles.deleteSelected')} (${checked.size})`}
          </Button>
        )}
      </Card>

      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 230px)' }}>
        {/* 좌측: 폴더 탐색 */}
        <Card className="w-72 shrink-0 flex flex-col overflow-hidden">
          {/* 전체 선택 헤더 */}
          {entries.length > 0 && !dirLoading && (
            <div className="px-3 py-1.5 border-b border-border/50 dark:border-border-dark/50 flex items-center gap-2">
              <input type="checkbox"
                checked={checked.size === entries.length && entries.length > 0}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded border-border accent-primary shrink-0" />
              <span className="text-[11px] text-muted-foreground">
                {checked.size > 0 ? `${checked.size} / ${entries.length}` : `${entries.length} items`}
              </span>
            </div>
          )}
          {/* 파일/폴더 목록 */}
          <div className="flex-1 overflow-y-auto">
            {dirLoading ? (
              <div className="flex items-center justify-center py-8">
                <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('logFiles.noFiles')}
              </p>
            ) : entries.map(entry => {
              const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
              const isSelected = selectedFile === fullPath;
              const isChecked = checked.has(entry.name);
              return (
                <div
                  key={entry.name}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-b border-border/30 dark:border-border-dark/30
                    ${isSelected
                      ? 'bg-primary/10 text-text dark:text-white font-bold'
                      : 'hover:bg-surface dark:hover:bg-surface-dark text-text dark:text-white'
                    }`}
                >
                  <input type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheck(entry.name)}
                    onClick={e => e.stopPropagation()}
                    className="w-3.5 h-3.5 rounded border-border accent-primary shrink-0" />
                  <button
                    onClick={() => handleEntryClick(entry)}
                    className="flex items-center gap-2 min-w-0 flex-1"
                  >
                    <Icon
                      name={entry.type === 'dir' ? 'folder' : 'description'}
                      size="xs"
                      className={entry.type === 'dir' ? 'text-warning' : 'text-muted-foreground'}
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm truncate">{entry.name}</p>
                      {entry.type === 'file' && entry.size != null && (
                        <p className="text-xs text-muted-foreground">{formatSize(entry.size)}</p>
                      )}
                    </div>
                    {entry.type === 'dir' && (
                      <Icon name="chevron_right" size="xs" className="text-muted-foreground shrink-0" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 우측: 파일 뷰어 */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {!selectedFile ? (
            <Card className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Icon name="folder_open" size="xl" className="mx-auto mb-2 opacity-30" />
                <p>{t('logFiles.selectPrompt')}</p>
              </div>
            </Card>
          ) : (
            <>
              {/* 검색 바 */}
              <Card>
                <div className="flex items-end gap-3">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t('logFiles.search')}
                    </label>
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      placeholder={t('logFiles.searchPlaceholder')}
                      className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
                    />
                  </div>
                  <Button variant="primary" leftIcon="search" onClick={handleSearch} disabled={fileLoading}>
                    {fileLoading ? '...' : t('logFiles.search')}
                  </Button>
                </div>
              </Card>

              {/* 파일명 표시 */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="description" size="xs" />
                <span className="font-mono">{selectedFile}</span>
                {fileContent && (
                  <span className="ml-auto">
                    {t('logFiles.total')
                      .replace('{total}', String(fileContent.total))
                      .replace('{filtered}', String(fileContent.filtered))}
                  </span>
                )}
              </div>

              {/* 로딩 */}
              {fileLoading && !fileContent && (
                <div className="flex items-center justify-center h-64">
                  <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
                </div>
              )}

              {/* 파일 뷰어 — CSV는 테이블, 그 외는 원본 텍스트 */}
              {fileContent && (
                selectedFile?.toLowerCase().endsWith('.csv') ? (
                  <CsvTableView content={fileContent.content} />
                ) : (
                  <Card noPadding className="flex-1 overflow-hidden">
                    <pre className="overflow-auto p-4 text-xs font-mono leading-relaxed text-text dark:text-white whitespace-pre max-h-[calc(100vh-340px)]">
                      {fileContent.content || t('logFiles.noFiles')}
                    </pre>
                  </Card>
                )
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
