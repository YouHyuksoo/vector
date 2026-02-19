/**
 * @file src/components/ConfigEditor.tsx
 * @description TOML 설정 편집기 패널 컴포넌트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 수신기/송신기 각각의 TOML 설정을 편집하는 재사용 패널
 * 2. **독립 상태**: 각 패널이 독립적으로 로드/저장/변경 감지
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Card, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface ConfigEditorProps {
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  apiPath: string;
  onSaved?: () => void;
  helpTitle?: string;
  helpContent?: React.ReactNode;
  /** 변경 시 설정을 다시 로드 (외부에서 TOML 수정 시 사용) */
  refreshKey?: number;
}

interface ConfigResponse {
  content: string;
  filePath: string;
}

export function ConfigEditor({ title, description, icon, iconColor, apiPath, onSaved, helpTitle, helpContent, refreshKey }: ConfigEditorProps) {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const { t } = useI18n();

  const hasChanges = content !== original;

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ConfigResponse>(apiPath);
      setContent(data.content);
      setOriginal(data.content);
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Load failed' });
    }
    setLoading(false);
  };

  useEffect(() => { loadConfig(); }, [refreshKey]);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await apiFetch<{ success: boolean }>(apiPath, {
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
      {/* 패널 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name={icon} className={iconColor} />
          <div>
            <h2 className="text-sm font-bold">{title}</h2>
            <p className="text-[10px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <span className={`text-[10px] font-medium ${result.ok ? 'text-success' : 'text-error'}`}>
              {result.msg}
            </span>
          )}
          {helpContent && (
            <Button variant="ghost" leftIcon="help" onClick={() => setShowHelp(true)} className="!px-2 !py-1 !text-xs">
              {t('aggregator.help')}
            </Button>
          )}
          <Button variant="ghost" leftIcon="refresh" onClick={loadConfig} className="!px-2 !py-1 !text-xs">
            {t('settings.refresh')}
          </Button>
          <Button
            variant="primary"
            leftIcon="save"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="!px-2 !py-1 !text-xs"
          >
            {saving ? t('aggregator.saving') : t('aggregator.save')}
          </Button>
        </div>
      </div>

      {/* 에디터 */}
      <Card noPadding>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          className="w-full min-h-[550px] p-4 font-sans text-sm leading-relaxed resize-y
            bg-background-white dark:bg-background-dark
            text-text dark:text-white font-medium
            border-0 outline-none focus:ring-0
            rounded-xl"
        />
      </Card>

      {/* 변경 표시 */}
      {hasChanges && (
        <p className="text-[10px] text-warning flex items-center gap-1">
          <Icon name="edit" className="text-warning" />
          {t('aggregator.unsaved')}
        </p>
      )}

      {/* 도움말 모달 */}
      {helpContent && (
        <Modal isOpen={showHelp} onClose={() => setShowHelp(false)} title={helpTitle || t('aggregator.help')} size="md">
          {helpContent}
        </Modal>
      )}
    </div>
  );
}
