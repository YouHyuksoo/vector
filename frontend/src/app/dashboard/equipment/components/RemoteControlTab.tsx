/**
 * @file RemoteControlTab.tsx — 원격 장비 Vector 프로세스 제어 탭
 * @description agent-monitor의 /api/vector/start|stop|restart|test-connection 프록시 호출.
 *   초보자 가이드: 원격 장비의 Vector 프로세스를 웹에서 시작/중지/재시작할 수 있습니다.
 */
'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

type Action = 'start' | 'stop' | 'restart' | 'test-connection';

const ACTION_STYLES: Record<Action, { icon: string; color: string }> = {
  start: { icon: 'play_arrow', color: 'bg-primary hover:bg-primary/90' },
  stop: { icon: 'stop', color: 'bg-destructive hover:bg-destructive/90' },
  restart: { icon: 'restart_alt', color: 'bg-warning hover:bg-warning/90' },
  'test-connection': { icon: 'cable', color: 'bg-accent hover:bg-accent/90' },
};

export function RemoteControlTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const execute = async (action: Action) => {
    if (action === 'stop' && !confirm(t('remote.control.confirmStop'))) return;
    if (action === 'restart' && !confirm(t('remote.control.confirmRestart'))) return;

    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(
        `/api/monitor/remote/${encodeURIComponent(equipmentId)}/control/${action}`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (data.reachable === false) {
        setResult({ type: 'err', text: t('remote.status.unreachable') });
      } else if (data.success || data.connected) {
        const msg = action === 'test-connection'
          ? `${t('remote.control.connected')} (${data.host}:${data.port})`
          : `${action} OK` + (data.pid ? ` (PID: ${data.pid})` : '');
        setResult({ type: 'ok', text: msg });
      } else {
        setResult({ type: 'err', text: data.error || 'Failed' });
      }
    } catch {
      setResult({ type: 'err', text: t('remote.status.unreachable') });
    } finally {
      setBusy(null);
    }
  };

  const busyLabel: Record<Action, string> = {
    start: t('remote.control.starting'),
    stop: t('remote.control.stopping'),
    restart: t('remote.control.restarting'),
    'test-connection': t('remote.control.testing'),
  };
  const idleLabel: Record<Action, string> = {
    start: t('remote.control.start'),
    stop: t('remote.control.stop'),
    restart: t('remote.control.restart'),
    'test-connection': t('remote.control.testConnection'),
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground">{t('remote.control.title')}</div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(ACTION_STYLES) as Action[]).map(action => {
          const { icon, color } = ACTION_STYLES[action];
          return (
            <button
              key={action}
              onClick={() => execute(action)}
              disabled={busy !== null}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                text-white transition-colors disabled:opacity-50 ${color}`}
            >
              <Icon name={icon} size="xs" />
              {busy === action ? busyLabel[action] : idleLabel[action]}
            </button>
          );
        })}
      </div>

      {result && (
        <div className={`text-xs px-2 py-1.5 rounded font-mono ${
          result.type === 'ok' ? 'bg-success/10 text-text dark:text-white' : 'bg-destructive/10 text-text dark:text-white'
        }`}>
          {result.text}
        </div>
      )}
    </div>
  );
}
