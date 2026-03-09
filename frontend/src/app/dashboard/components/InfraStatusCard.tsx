'use client';
import { useState } from 'react';
import { Icon, Card } from '@/components/ui';
import { apiFetch, type MonitorOverview } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

function ago(sec: number) {
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function ResourceBar({ label, icon, percent, detail, warning, warningText }: {
  label: string; icon: string; percent: number; detail: string; warning?: boolean; warningText?: string;
}) {
  const color = percent >= 90 ? 'bg-error' : percent >= 70 ? 'bg-warning' : 'bg-success';
  return (
    <div>
      <div className="flex items-center gap-3 px-1 py-1">
        <span className={`size-2 rounded-full ${warning ? 'bg-error shadow-[0_0_6px_rgba(239,68,68,0.4)] animate-pulse' : 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]'}`} />
        <Icon name={icon} size="xs" className="text-muted-foreground" />
        <span className="text-base font-medium flex-1">{label}</span>
        <span className={`font-mono text-sm ${warning ? 'text-error font-bold' : 'text-muted-foreground'}`}>{detail}</span>
      </div>
      <div className="mx-1 mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      {warning && warningText && <p className="text-xs text-error font-medium mt-1 px-1 animate-pulse">⚠ {warningText}</p>}
    </div>
  );
}

interface Props { data: MonitorOverview }

export function InfraStatusCard({ data }: Props) {
  const [vecLoading, setVecLoading] = useState(false);
  const { t } = useI18n();

  const infra = [
    { label: t('infra.server'), icon: 'dns', ok: data.server.status === 'ok', val: data.server.status === 'ok' ? `${t('infra.up')} ${ago(data.server.uptime)}` : t('infra.down') },
    { label: t('infra.oracle'), icon: 'database', ok: data.oracle.connected, val: data.oracle.connected ? (data.tables.length > 0 ? `${data.tables.length} ${t('infra.tables')}` : t('infra.connected')) : t('infra.down') },
  ];

  const disk = data.server.disk;
  const mem = data.server.memory;
  const cpu = data.server.cpu;
  const diskPercent = disk?.percent ?? 0;
  const memPercent = mem?.percent ?? 0;
  const cpuPercent = cpu?.percent ?? 0;
  const diskWarning = diskPercent >= 90;
  const memWarning = memPercent >= 90;
  const fmtGB = (b: number) => `${(b / 1024 / 1024 / 1024).toFixed(1)}G`;

  const toggleVector = async () => {
    setVecLoading(true);
    const ep = data.vector.running ? '/api/monitor/vector/stop' : '/api/monitor/vector/start';
    try { await apiFetch(ep, { method: 'POST' }); } catch {}
    setTimeout(() => setVecLoading(false), 1500);
  };

  return (
    <Card noPadding className="p-4">
      <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">{t('infra.title')}</p>
      <div className="space-y-2">
        {infra.map(i => (
          <div key={i.label} className="flex items-center gap-3 px-1 py-1">
            <span className={`size-2 rounded-full ${i.ok ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-error shadow-[0_0_6px_rgba(239,68,68,0.4)]'}`} />
            <Icon name={i.icon} size="xs" className="text-muted-foreground" />
            <span className="text-base font-medium flex-1">{i.label}</span>
            <span className="font-mono text-sm text-muted-foreground">{i.val}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 px-1 py-1">
          <span className={`size-2 rounded-full ${data.vector.running ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-error shadow-[0_0_6px_rgba(239,68,68,0.4)]'}`} />
          <Icon name="show_chart" size="xs" className="text-muted-foreground" />
          <span className="text-base font-medium flex-1">{t('infra.vector')}</span>
          <span className="font-mono text-sm text-muted-foreground mr-2">
            {data.vector.running ? (data.vector.uptime || t('infra.ok')) : t('infra.stopped')}
          </span>
          <button onClick={toggleVector} disabled={vecLoading}
            className={`font-mono text-xs font-bold px-2.5 py-1 rounded-md border transition-all
              ${vecLoading ? 'bg-warning/10 text-warning border-warning/30 cursor-wait'
                : data.vector.running ? 'bg-error/10 text-error border-error/30 hover:bg-error/20'
                : 'bg-success/10 text-success border-success/30 hover:bg-success/20'}`}>
            {vecLoading ? t('infra.loading') : data.vector.running ? t('infra.stop') : t('infra.start')}
          </button>
        </div>
        <div className="pt-2 border-t border-border/50 space-y-2">
          <ResourceBar label={t('infra.cpu')} icon="memory" percent={cpuPercent} detail={cpu ? `${cpuPercent}% (${cpu.cores} cores)` : ''} />
          {mem && <ResourceBar label={t('infra.memory')} icon="analytics" percent={memPercent} detail={`${fmtGB(mem.used)} / ${fmtGB(mem.total)}`} warning={memWarning} warningText={t('infra.memWarning')} />}
          {disk && <ResourceBar label={t('infra.disk')} icon="hard_drive" percent={diskPercent} detail={`${fmtGB(disk.used)} / ${fmtGB(disk.total)}`} warning={diskWarning} warningText={t('infra.diskWarning')} />}
        </div>
      </div>
    </Card>
  );
}
