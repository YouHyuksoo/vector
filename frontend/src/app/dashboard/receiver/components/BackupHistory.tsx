/**
 * @file src/app/dashboard/receiver/components/BackupHistory.tsx
 * @description TOML 백업 이력 그리드 — 변경 이력 조회 / 내용 비교 / 복구
 *
 * 초보자 가이드:
 * 1. **역할**: Aggregator TOML 설정 변경 이력을 시간순으로 표시
 * 2. **미리보기**: 백업 파일 내용을 확인하고 현재 설정과 비교
 * 3. **복구**: 선택한 백업으로 현재 설정을 덮어쓰기 (복구 전 자동 백업)
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Card, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface BackupEntry {
  name: string;
  size: number;
  createdAt: string;
  source: string;
}

interface BackupHistoryProps {
  refreshKey?: number;
  onRestored?: () => void;
}

const SOURCE_LABELS: Record<string, { icon: string; color: string }> = {
  editor:      { icon: 'edit',          color: 'text-primary' },
  'vrl-apply': { icon: 'science',      color: 'text-info' },
  restore:     { icon: 'history',       color: 'text-warning' },
};

export function BackupHistory({ refreshKey, onRestored }: BackupHistoryProps) {
  const { t } = useI18n();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ backups: BackupEntry[] }>('/api/monitor/aggregator/backups');
      setBackups(data.backups);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadBackups(); }, [refreshKey, loadBackups]);

  const handlePreview = async (name: string) => {
    if (selected === name) { setSelected(null); return; }
    setSelected(name);
    setPreviewLoading(true);
    try {
      const data = await apiFetch<{ name: string; content: string }>(`/api/monitor/aggregator/backups/${name}`);
      setPreviewContent(data.content);
    } catch { setPreviewContent('Failed to load'); }
    setPreviewLoading(false);
  };

  const handleRestore = async (name: string) => {
    setRestoring(true);
    setMsg(null);
    try {
      await apiFetch(`/api/monitor/aggregator/backups/${name}/restore`, { method: 'POST' });
      setMsg({ ok: true, text: t('backup.restored') });
      setConfirmRestore(null);
      setSelected(null);
      loadBackups();
      onRestored?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Restore failed' });
    }
    setRestoring(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  };

  if (loading) {
    return (
      <Card className="flex items-center justify-center h-20">
        <Icon name="progress_activity" size="sm" className="animate-spin text-primary" />
      </Card>
    );
  }

  if (backups.length === 0) {
    return (
      <Card className="flex items-center justify-center h-20">
        <p className="text-xs text-muted-foreground">{t('backup.empty')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="history" size="sm" className="text-warning" />
          <h3 className="text-sm font-bold">{t('backup.title')}</h3>
          <span className="text-[10px] text-muted-foreground">({backups.length})</span>
        </div>
        {msg && (
          <span className={`text-[10px] font-medium ${msg.ok ? 'text-success' : 'text-error'}`}>
            {msg.text}
          </span>
        )}
      </div>

      <Card noPadding>
        {/* 헤더 */}
        <div className="grid grid-cols-[1fr_80px_80px_100px] gap-2 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground
          border-b border-border dark:border-border-dark bg-surface/50 dark:bg-surface-dark/50">
          <span>{t('backup.date')}</span>
          <span>{t('backup.source')}</span>
          <span>{t('backup.size')}</span>
          <span className="text-right">{t('backup.actions')}</span>
        </div>

        {/* 행 목록 */}
        <div className="max-h-[240px] overflow-y-auto divide-y divide-border/30 dark:divide-border-dark/30">
          {backups.map(b => {
            const srcMeta = SOURCE_LABELS[b.source] || { icon: 'file_copy', color: 'text-muted-foreground' };
            const isOpen = selected === b.name;

            return (
              <div key={b.name}>
                <div className={`grid grid-cols-[1fr_80px_80px_100px] gap-2 px-3 py-1.5 items-center
                  hover:bg-surface/50 dark:hover:bg-background-dark/50 transition-colors cursor-pointer
                  ${isOpen ? 'bg-primary/5' : ''}`}
                  onClick={() => handlePreview(b.name)}
                >
                  <span className="text-xs font-mono truncate">{formatTime(b.createdAt)}</span>
                  <span className="flex items-center gap-1">
                    <Icon name={srcMeta.icon} size="xs" className={srcMeta.color} />
                    <span className="text-[10px]">{b.source}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatSize(b.size)}</span>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); handlePreview(b.name); }}
                      className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                      title={t('backup.preview')}
                    >
                      <Icon name={isOpen ? 'visibility_off' : 'visibility'} size="xs" className="text-info" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmRestore(b.name); }}
                      className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                      title={t('backup.restore')}
                    >
                      <Icon name="restore" size="xs" className="text-warning" />
                    </button>
                  </div>
                </div>

                {/* 미리보기 */}
                {isOpen && (
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-border/30">
                    {previewLoading ? (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Icon name="progress_activity" size="xs" className="animate-spin text-primary" />
                      </div>
                    ) : (
                      <pre className="text-[10px] font-mono text-muted-foreground max-h-[200px] overflow-auto whitespace-pre-wrap">
                        {previewContent.slice(0, 3000)}
                        {previewContent.length > 3000 && '\n\n... (truncated)'}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 복구 확인 모달 */}
      <Modal
        isOpen={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title={t('backup.restoreConfirm')}
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-4">
          {t('backup.restoreMsg')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmRestore(null)}>
            {t('settings.cancel')}
          </Button>
          <Button
            variant="primary"
            leftIcon="restore"
            onClick={() => confirmRestore && handleRestore(confirmRestore)}
            disabled={restoring}
          >
            {restoring ? t('backup.restoring') : t('backup.restore')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
