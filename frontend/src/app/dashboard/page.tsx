'use client';
import { useMonitor } from '@/hooks/useMonitor';
import { InfraStatusCard } from './components/InfraStatusCard';
import { QueueStats } from './components/QueueStats';
import { CollectorGrid } from './components/CollectorGrid';

import { Card, Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

export default function DashboardPage() {
  const { data, error, lastUpdate } = useMonitor(5000);
  const { t } = useI18n();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="dashboard" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            {t('dashboard.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">/ {t('dashboard.subtitle')}</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <InfraStatusCard data={data} />
          <QueueStats queue={data.queue} />
          <Card noPadding className="p-4">
            <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">{t('dashboard.registeredTables')}</p>
            {!data.tables.length ? (
              <p className="text-sm text-muted-foreground text-center py-3">{t('dashboard.noTables')}</p>
            ) : (
              <div className="space-y-1">
                {data.tables.map(tbl => (
                  <div key={tbl.TABLE_NAME} className="flex items-center justify-between px-1 py-1.5 border-b border-border/30 last:border-0">
                    <span className="font-mono text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <span className="size-1.5 rounded-sm bg-primary" />
                      {tbl.TABLE_NAME.replace('LOG_', '')}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{tbl.COLUMN_COUNT} {t('dashboard.cols')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <CollectorGrid equipments={data.equipments} logs={data.recentErrors} />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t border-border dark:border-border-dark">
        <span>{t('dashboard.copyright')} &copy; 2026</span>
        <div className="flex items-center gap-3">
          {lastUpdate && <span>{t('dashboard.updated')} {lastUpdate.toLocaleTimeString('ko-KR', { hour12: false })}</span>}
          {error && <span className="text-error">{error}</span>}
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-xs font-bold">
            {data.server.nodeEnv}
          </span>
        </div>
      </div>
    </>
  );
}
