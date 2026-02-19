/**
 * @file src/app/dashboard/receiver/components/AggregatorConfigPanel.tsx
 * @description Aggregator TOML 설정 패널 — 폼 입력 + 접이식 원본 에디터
 *
 * 초보자 가이드:
 * 1. API에서 TOML 내용을 로드하여 폼과 원본 에디터에 표시
 * 2. 폼 필드 변경 또는 원본 직접 편집 모두 동일한 상태를 업데이트
 * 3. 저장 시 전체 TOML 문자열을 API로 전송 (자동 백업 생성)
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Card, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { AggregatorConfigForm } from './AggregatorConfigForm';
import { AggregatorGuide } from './AggregatorGuide';

interface Props {
  onSaved?: () => void;
  refreshKey?: number;
}

export function AggregatorConfigPanel({ onSaved, refreshKey }: Props) {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const hasChanges = content !== original;

  const load = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch<{ content: string }>('/api/monitor/aggregator/config');
      setContent(data.content);
      setOriginal(data.content);
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Load failed' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await apiFetch('/api/monitor/aggregator/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setOriginal(content);
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
          <Button variant="ghost" leftIcon="help" onClick={() => setShowHelp(true)} className="!px-2 !py-1 !text-xs">
            {t('aggregator.help')}
          </Button>
          <Button variant="ghost" leftIcon="refresh" onClick={load} className="!px-2 !py-1 !text-xs">
            {t('settings.refresh')}
          </Button>
          <Button variant="primary" leftIcon="save" onClick={handleSave}
            disabled={saving || !hasChanges} className="!px-2 !py-1 !text-xs">
            {saving ? t('aggregator.saving') : t('aggregator.save')}
          </Button>
        </div>
      </div>

      {/* 폼 입력 필드 */}
      <AggregatorConfigForm content={content} onChange={setContent} />

      {/* Raw TOML 토글 */}
      <button onClick={() => setShowRaw(!showRaw)}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground
          hover:text-text dark:hover:text-white transition-colors">
        <Icon name={showRaw ? 'expand_less' : 'expand_more'} size="xs" />
        {t('sender.form.rawToml')}
      </button>

      {showRaw && (
        <Card noPadding>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            spellCheck={false}
            className="w-full min-h-[400px] p-4 font-mono text-xs leading-relaxed resize-y
              bg-background-white dark:bg-background-dark text-text dark:text-white
              border-0 outline-none focus:ring-0 rounded-xl" />
        </Card>
      )}

      {hasChanges && (
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
