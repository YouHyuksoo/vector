/**
 * @file src/app/dashboard/receiver/components/AggregatorConfigPanel.tsx
 * @description Aggregator TOML 설정 패널 — 폼 입력 + 저장/새로고침 헤더
 *
 * 초보자 가이드:
 * 1. 부모(page.tsx)로부터 content/onChange를 받아 폼 UI 표시
 * 2. API 로드/저장/dirty check는 내부에서 관리
 * 3. Raw TOML 에디터는 페이지 레벨에서 별도 렌더링
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Card, Button, Modal } from '@/components/ui';
import { apiFetch, type SystemConfig } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { AggregatorConfigForm, syncApiPort } from './AggregatorConfigForm';
import { AggregatorConfigView } from './AggregatorConfigView';
import { AggregatorGuide } from './AggregatorGuide';

interface Props {
  content: string;
  onChange: (content: string) => void;
  onSaved?: () => void;
  refreshKey?: number;
}

export function AggregatorConfigPanel({ content, onChange, onSaved, refreshKey }: Props) {
  const { t } = useI18n();
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [viewMode, setViewMode] = useState(true);

  const hasChanges = content !== original;

  const load = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch<{ content: string }>('/api/monitor/aggregator/config');
      onChange(data.content);
      setOriginal(data.content);
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Load failed' });
    }
    setLoading(false);
  }, [onChange]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const cfg = await apiFetch<SystemConfig>('/api/monitor/config');
      const synced = syncApiPort(content, cfg.server.port);
      if (synced !== content) onChange(synced);

      await apiFetch('/api/monitor/aggregator/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: synced }),
      });
      setOriginal(synced);
      setResult({ ok: true, msg: t('aggregator.saved') });
      onSaved?.();
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Save failed' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Icon name="download" className="text-success" />
          <div>
            <h2 className="text-sm font-bold">{t('aggregator.receiver')}</h2>
            <p className="text-[10px] text-muted-foreground">{t('aggregator.receiverDesc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {result && (
            <span className={`text-[10px] font-medium ${result.ok ? 'text-success' : 'text-error'}`}>
              {result.msg}
            </span>
          )}
          <div className="flex items-center bg-surface/60 dark:bg-surface-dark/60 rounded-lg p-0.5 border border-border/50">
            <button onClick={() => setViewMode(true)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                viewMode ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-muted-foreground hover:text-text'
              }`}>
              <Icon name="visibility" size="xs" />{t('receiver.viewMode')}
            </button>
            <button onClick={() => setViewMode(false)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                !viewMode ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-muted-foreground hover:text-text'
              }`}>
              <Icon name="edit" size="xs" />{t('receiver.editMode')}
            </button>
          </div>
          <Button variant="ghost" leftIcon="help" onClick={() => setShowHelp(true)} className="!px-2 !py-1 !text-xs">
            {t('aggregator.help')}
          </Button>
          <Button variant="ghost" leftIcon="refresh" onClick={load} className="!px-2 !py-1 !text-xs">
            {t('settings.refresh')}
          </Button>
          {!viewMode && (
            <Button variant="primary" leftIcon="save" onClick={handleSave}
              disabled={saving || !hasChanges} className="!px-2 !py-1 !text-xs">
              {saving ? t('aggregator.saving') : t('aggregator.save')}
            </Button>
          )}
        </div>
      </div>

      {/* 보기 모드 / 편집 모드 */}
      {viewMode ? (
        <AggregatorConfigView content={content} />
      ) : (
        <AggregatorConfigForm content={content} onChange={onChange} />
      )}

      {!viewMode && hasChanges && (
        <p className="text-[10px] text-warning flex items-center gap-1">
          <Icon name="edit" className="text-warning" />
          {t('aggregator.unsaved')}
        </p>
      )}

      {/* 도움말 모달 */}
      <Modal isOpen={showHelp} onClose={() => setShowHelp(false)}
        title={t('receiver.guideTitle')} size="md">
        <AggregatorGuide />
      </Modal>
    </div>
  );
}
