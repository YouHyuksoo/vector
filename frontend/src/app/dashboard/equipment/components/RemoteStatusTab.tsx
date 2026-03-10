/**
 * @file RemoteStatusTab.tsx — 원격 장비 상태 + 메트릭 탭
 * @description agent-monitor의 /api/status, /api/metrics를 프록시로 조회하여 표시.
 *   초보자 가이드: 원격 장비의 Vector 프로세스 상태와 전송 통계를 실시간으로 보여줍니다.
 */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface StatusData {
  reachable: boolean;
  running?: boolean;
  pid?: number | null;
  uptime?: string;
  version?: string;
  apiReachable?: boolean;
  ip?: string;
}

interface MetricsData {
  reachable: boolean;
  eventsIn?: number;
  eventsOut?: number;
  errors?: number;
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg bg-surface/50 dark:bg-surface-dark/50 p-2 text-center">
      <div className="text-[10px] text-muted-foreground/60 mb-0.5">{label}</div>
      <div className={`text-sm font-mono font-bold ${color || 'text-foreground dark:text-white'}`}>{value}</div>
    </div>
  );
}

export function RemoteStatusTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, mRes] = await Promise.all([
        fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/status`),
        fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/metrics`),
      ]);
      setStatus(await sRes.json());
      setMetrics(await mRes.json());
    } catch {
      setStatus({ reachable: false });
      setMetrics({ reachable: false });
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.reachable) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        <Icon name="cloud_off" size="lg" className="text-destructive mb-2 mx-auto block" />
        {t('remote.status.unreachable')}
        <button onClick={load} className="block mx-auto mt-2 text-xs text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
        <span>{t('remote.status.title')}</span>
        <button onClick={load} className="p-1 hover:bg-surface dark:hover:bg-surface-dark rounded transition-colors">
          <Icon name="refresh" size="xs" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat
          label={t('remote.status.running')}
          value={status.running ? 'ON' : 'OFF'}
          color={status.running ? 'text-primary' : 'text-destructive'}
        />
        <Stat label={t('remote.status.pid')} value={status.pid ?? '—'} />
        <Stat label={t('remote.status.uptime')} value={status.uptime || '—'} />
        <Stat label={t('remote.status.version')} value={status.version || '—'} />
      </div>

      {metrics?.reachable && (
        <>
          <div className="text-xs font-semibold text-muted-foreground">{t('remote.status.metrics')}</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label={t('remote.status.eventsIn')} value={metrics.eventsIn ?? 0} color="text-primary" />
            <Stat label={t('remote.status.eventsOut')} value={metrics.eventsOut ?? 0} color="text-accent" />
            <Stat
              label={t('remote.status.errors')}
              value={metrics.errors ?? 0}
              color={(metrics.errors ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}
            />
          </div>
        </>
      )}
    </div>
  );
}
