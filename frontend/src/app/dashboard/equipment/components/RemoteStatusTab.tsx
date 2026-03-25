/**
 * @file RemoteStatusTab.tsx — 원격 장비 상태 + 메트릭 탭 (컴팩트)
 * @description agent-monitor의 /api/status, /api/metrics를 프록시로 조회하여 표시.
 *   초보자 가이드: 원격 장비의 Vector 프로세스 상태와 전송 통계를 보여줍니다.
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
      <div className="flex items-center justify-center py-4">
        <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.reachable) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        <Icon name="cloud_off" size="lg" className="text-destructive mb-2 mx-auto block" />
        {t('remote.status.unreachable')}
        <button onClick={load} className="block mx-auto mt-2 text-xs text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 상태 한 줄 요약: 실행상태 · PID · 가동시간 · 버전 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className={`flex items-center gap-1 font-semibold ${status.running ? 'text-primary' : 'text-destructive'}`}>
            <span className={`size-1.5 rounded-full ${status.running ? 'bg-primary' : 'bg-destructive'}`} />
            {status.running ? 'ON' : 'OFF'}
          </span>
          {status.pid && (
            <span className="text-muted-foreground">PID {status.pid}</span>
          )}
          {status.uptime && (
            <span className="text-muted-foreground">{status.uptime}</span>
          )}
          {status.version && (
            <span className="text-muted-foreground/60">v{status.version}</span>
          )}
        </div>
        <button onClick={load} className="p-1 hover:bg-surface dark:hover:bg-surface-dark rounded transition-colors">
          <Icon name="refresh" size="xs" />
        </button>
      </div>

      {/* 메트릭 한 줄 */}
      {metrics?.reachable && (
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums
          px-2 py-1.5 rounded bg-surface/50 dark:bg-surface-dark/50">
          <span className="text-primary">
            {t('remote.status.eventsIn')} <span className="font-bold">{metrics.eventsIn ?? 0}</span>
          </span>
          <span className="text-accent">
            {t('remote.status.eventsOut')} <span className="font-bold">{metrics.eventsOut ?? 0}</span>
          </span>
          <span className={(metrics.errors ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground/50'}>
            {t('remote.status.errors')} <span className="font-bold">{metrics.errors ?? 0}</span>
          </span>
        </div>
      )}
    </div>
  );
}
