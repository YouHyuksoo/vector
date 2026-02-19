'use client';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

function timeSince(iso: string) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface Equipment {
  equipment_id: string;
  online: boolean;
  last_seen: string;
  metadata: Record<string, string>;
}

export function CollectorGrid({ equipments }: { equipments: Equipment[] }) {
  const online = equipments.filter(e => e.online).length;
  const offline = equipments.length - online;
  const { t } = useI18n();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-text-secondary uppercase tracking-wider">{t('collector.title')}</p>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{equipments.length}</strong> {t('collector.total')}</span>
          <span className="text-success"><strong>{online}</strong> {t('collector.online')}</span>
          <span className="text-error"><strong>{offline}</strong> {t('collector.offline')}</span>
        </div>
      </div>

      {!equipments.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Icon name="sensors" size="xl" className="opacity-30 mb-3" />
          <p className="text-base">{t('collector.empty')}</p>
          <p className="text-sm opacity-60">{t('collector.emptyDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {equipments.map((eq, i) => (
            <div key={eq.equipment_id}
              className={`group relative rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5
                bg-card hover:bg-card-hover animate-fade-in
                ${eq.online ? 'border-success/20 hover:border-success/40' : 'border-error/20 hover:border-error/40'}`}
              style={{ animationDelay: `${i * 40}ms` }}>
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
                style={{ background: eq.online
                  ? 'linear-gradient(90deg, #22c55e, rgba(34,197,94,0.2))'
                  : 'linear-gradient(90deg, #ef4444, rgba(239,68,68,0.2))' }} />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`size-2.5 rounded-full ${eq.online ? 'bg-success animate-pulse-glow' : 'bg-error'}`} />
                  <span className="font-mono text-base font-bold">{eq.equipment_id}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md
                  ${eq.online ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                  {eq.online ? t('collector.online') : t('collector.offline')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Icon name="schedule" size="xs" /> {t('collector.lastSeen')}
                </span>
                <span className={`font-mono font-medium ${eq.online ? 'text-success' : 'text-error'}`}>
                  {timeSince(eq.last_seen)}
                </span>
              </div>
              {Object.entries(eq.metadata || {}).filter(([k]) => k !== 'equipment_id' && k !== 'last_seen').length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(eq.metadata).filter(([k]) => k !== 'equipment_id' && k !== 'last_seen')
                    .map(([k, v]) => (
                      <span key={k} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                        {k}: {v}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
