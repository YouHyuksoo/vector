/**
 * @file src/app/dashboard/upload/page.tsx
 * @description 설비 로그 파일 업로드 페이지
 *
 * 초보자 가이드:
 * 1. 설비 ID를 선택/입력하고 파일을 드래그앤드롭 또는 클릭으로 선택
 * 2. 업로드 버튼을 누르면 서버의 data/uploads/{설비ID}/{날짜}/ 에 저장
 * 3. 하단에 업로드된 파일 이력 표시
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface UploadedFile {
  equipmentId: string;
  date: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

interface FileListResponse {
  files: UploadedFile[];
  equipments: string[];
}

export default function UploadPage() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [equipmentId, setEquipmentId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [history, setHistory] = useState<UploadedFile[]>([]);
  const [equipments, setEquipments] = useState<string[]>([]);
  const [filterEq, setFilterEq] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const params = filterEq ? `?equipmentId=${encodeURIComponent(filterEq)}` : '';
      const data = await apiFetch<FileListResponse>(`/api/upload/files${params}`);
      setHistory(data.files);
      setEquipments(data.equipments);
    } catch { /* 무시 */ }
  }, [filterEq]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) setSelectedFiles(prev => [...prev, ...files]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!equipmentId.trim()) {
      setMessage({ type: 'error', text: t('upload.eqRequired') });
      return;
    }
    if (!selectedFiles.length) {
      setMessage({ type: 'error', text: t('upload.noFiles') });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('equipmentId', equipmentId.trim());
      selectedFiles.forEach(f => formData.append('files', f));

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();

      setMessage({ type: 'success', text: `${data.count}${t('upload.successSuffix')}` });
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadHistory();
    } catch (err) {
      setMessage({ type: 'error', text: `${t('upload.failed')}: ${err instanceof Error ? err.message : err}` });
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <h1 className="text-lg font-bold text-text dark:text-white">
        {t('upload.title')}
        <span className="text-muted-foreground text-sm font-normal ml-2">/ {t('upload.subtitle')}</span>
      </h1>

      {/* 업로드 영역 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="cloud_upload" size="md" className="text-primary" />
          <p className="text-base font-bold text-text dark:text-white">{t('upload.uploadArea')}</p>
        </div>

        {/* 설비 ID 입력 */}
        <div className="mb-4">
          <label className="block text-sm font-bold text-text dark:text-white mb-1">
            {t('upload.equipmentId')}
          </label>
          <input
            type="text"
            value={equipmentId}
            onChange={e => setEquipmentId(e.target.value)}
            placeholder={t('upload.eqPlaceholder')}
            className="w-full max-w-sm px-3 py-2 rounded-lg border border-border dark:border-border-dark
              bg-background-white dark:bg-background-dark text-text dark:text-white
              focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
          />
        </div>

        {/* 드래그앤드롭 영역 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragOver
              ? 'border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-border dark:border-border-dark hover:border-primary/50 hover:bg-surface/50 dark:hover:bg-surface-dark/50'
            }`}
        >
          <Icon name="upload_file" size="lg" className={`mx-auto mb-2 ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
          <p className="text-sm font-bold text-text dark:text-white mb-1">
            {t('upload.dragDrop')}
          </p>
          <p className="text-xs text-muted-foreground">{t('upload.dragDropSub')}</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* 선택된 파일 목록 */}
        {selectedFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-bold text-text dark:text-white">
              {t('upload.selectedFiles')} ({selectedFiles.length})
            </p>
            {selectedFiles.map((file, i) => (
              <div key={`${file.name}-${i}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 dark:bg-surface-dark/50">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="description" size="sm" className="text-muted-foreground shrink-0" />
                  <span className="text-sm text-text dark:text-white truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatSize(file.size)}</span>
                </div>
                <button type="button" onClick={() => removeFile(i)}
                  className="text-muted-foreground hover:text-red-500 transition-colors">
                  <Icon name="close" size="sm" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 메시지 */}
        {message && (
          <div className={`mt-4 px-4 py-2 rounded-lg text-sm font-bold
            ${message.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            }`}>
            {message.text}
          </div>
        )}

        {/* 업로드 버튼 */}
        <div className="mt-4">
          <Button
            leftIcon="cloud_upload"
            isLoading={uploading}
            disabled={!selectedFiles.length || !equipmentId.trim()}
            onClick={handleUpload}
          >
            {t('upload.uploadBtn')}
          </Button>
        </div>
      </Card>

      {/* 업로드 이력 */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="history" size="md" className="text-primary" />
            <p className="text-base font-bold text-text dark:text-white">{t('upload.history')}</p>
          </div>
          {equipments.length > 0 && (
            <select
              value={filterEq}
              onChange={e => setFilterEq(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border dark:border-border-dark
                bg-background-white dark:bg-background-dark text-text dark:text-white text-sm"
            >
              <option value="">{t('upload.allEquipments')}</option>
              {equipments.map(eq => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          )}
        </div>

        {!history.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t('upload.noHistory')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border dark:border-border-dark">
                  <th className="text-left py-2 px-3 text-muted-foreground font-bold">{t('upload.colEquipment')}</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-bold">{t('upload.colFilename')}</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-bold">{t('upload.colSize')}</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-bold">{t('upload.colDate')}</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-bold">{t('upload.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((f, i) => (
                  <tr key={`${f.filename}-${i}`}
                    className="border-b border-border/50 dark:border-border-dark/50 hover:bg-surface/30 dark:hover:bg-surface-dark/30">
                    <td className="py-2 px-3 font-mono text-text dark:text-white">{f.equipmentId}</td>
                    <td className="py-2 px-3 text-text dark:text-white">{f.filename}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{formatSize(f.size)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{f.uploadedAt ?? '—'}</td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => {
                          const url = `/api/upload/download?path=${encodeURIComponent(`${f.equipmentId}/${f.date}/${f.filename}`)}`;
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = '';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
                          text-primary hover:bg-primary/10 border border-primary/30 transition-colors"
                      >
                        <Icon name="download" size="xs" />
                        {t('upload.download')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
