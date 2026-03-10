/**
 * @file RemoteConfigTab.tsx — 원격 장비 TOML 설정 탭
 * @description agent-monitor의 /api/config를 프록시로 조회/저장.
 *   초보자 가이드: 원격 장비의 Vector TOML 설정을 웹에서 편집하고 저장할 수 있습니다.
 */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

export function RemoteConfigTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/config`);
      const data = await res.json();
      if (data.reachable === false) {
        setMsg({ type: 'err', text: t('remote.status.unreachable') });
        return;
      }
      setContent(data.content || '');
      setOriginal(data.content || '');
    } catch {
      setMsg({ type: 'err', text: t('remote.config.noContent') });
    } finally {
      setLoading(false);
    }
  }, [equipmentId, t]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setOriginal(content);
        setMsg({ type: 'ok', text: `${t('remote.config.saved')} — ${t('remote.config.restartHint')}` });
      } else {
        setMsg({ type: 'err', text: data.error || t('remote.config.saveFailed') });
      }
    } catch {
      setMsg({ type: 'err', text: t('remote.config.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== original;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{t('remote.config.title')}</span>
        <div className="flex items-center gap-1">
          <button onClick={load}
            className="p-1 hover:bg-surface dark:hover:bg-surface-dark rounded transition-colors">
            <Icon name="refresh" size="xs" />
          </button>
          <button onClick={handleSave} disabled={!hasChanges || saving}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors
              ${hasChanges
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
            {saving ? t('remote.config.saving') : t('remote.config.save')}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`text-xs px-2 py-1 rounded ${
          msg.type === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        }`}>
          {msg.text}
        </div>
      )}

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        className="w-full h-64 text-xs font-mono p-2 rounded-lg border resize-y
          bg-background dark:bg-background-dark
          border-border dark:border-border-dark
          focus:ring-1 focus:ring-primary focus:outline-none"
        spellCheck={false}
      />
    </div>
  );
}
