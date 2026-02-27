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

export default function LogFilesPage() {
  const { t } = useI18n();

  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [search, setSearch] = useState('');

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
    loadDir(parentPath);
  };

  const handleSearch = () => {
    if (selectedFile) loadFile(selectedFile, search || undefined);
  };

  /** 경로를 breadcrumb 세그먼트로 분리 */
  const pathSegments = currentPath ? currentPath.split('/') : [];

  const handleBreadcrumb = (index: number) => {
    const newPath = pathSegments.slice(0, index + 1).join('/');
    setSelectedFile(null);
    setFileContent(null);
    setSearch('');
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

      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* 좌측: 폴더 탐색 */}
        <Card className="w-64 shrink-0 flex flex-col overflow-hidden">
          {/* Breadcrumb */}
          <div className="px-3 pt-3 pb-2 border-b border-border/50 dark:border-border-dark/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto whitespace-nowrap">
              <button
                onClick={() => { setSelectedFile(null); setFileContent(null); setSearch(''); loadDir(''); }}
                className="hover:text-primary font-bold shrink-0"
              >
                ROOT
              </button>
              {pathSegments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1 shrink-0">
                  <span>/</span>
                  <button onClick={() => handleBreadcrumb(i)} className="hover:text-primary font-medium">
                    {seg}
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* 파일/폴더 목록 */}
          <div className="flex-1 overflow-y-auto">
            {currentPath && (
              <button
                onClick={handleGoUp}
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-surface dark:hover:bg-surface-dark transition-colors border-b border-border/30 dark:border-border-dark/30"
              >
                <Icon name="arrow_upward" size="xs" className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">..</span>
              </button>
            )}

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
              return (
                <button
                  key={entry.name}
                  onClick={() => handleEntryClick(entry)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-b border-border/30 dark:border-border-dark/30
                    ${isSelected
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'hover:bg-surface dark:hover:bg-surface-dark text-text dark:text-white'
                    }`}
                >
                  <Icon
                    name={entry.type === 'dir' ? 'folder' : 'description'}
                    size="xs"
                    className={entry.type === 'dir' ? 'text-warning' : 'text-muted-foreground'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{entry.name}</p>
                    {entry.type === 'file' && entry.size != null && (
                      <p className="text-xs text-muted-foreground">{formatSize(entry.size)}</p>
                    )}
                  </div>
                  {entry.type === 'dir' && (
                    <Icon name="chevron_right" size="xs" className="text-muted-foreground shrink-0" />
                  )}
                </button>
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

              {/* 원본 텍스트 뷰어 */}
              {fileContent && (
                <Card noPadding className="flex-1 overflow-hidden">
                  <pre className="overflow-auto p-4 text-xs font-mono leading-relaxed text-text dark:text-white whitespace-pre max-h-[calc(100vh-340px)]">
                    {fileContent.content || t('logFiles.noFiles')}
                  </pre>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
