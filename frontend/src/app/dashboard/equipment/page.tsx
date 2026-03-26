/**
 * @file equipment/page.tsx — 장비 대시보드 페이지
 * @description CollectorGrid를 별도 페이지로 분리하여 장비 수집기 현황만 표시.
 *   초보자 가이드: /dashboard/equipment 경로에서 장비별 하트비트, 로그 통계를 확인할 수 있습니다.
 */
'use client';

import { useMonitor } from '@/hooks/useMonitor';
import { CollectorGrid } from '../components/CollectorGrid';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

export default function EquipmentDashboardPage() {
  const { data, error, lastUpdate } = useMonitor();
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
          <Icon name="devices" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            {t('equipmentDashboard.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">/ {t('equipmentDashboard.subtitle')}</span>
        </h1>
      </div>

      <CollectorGrid equipments={data.equipments} logs={data.recentLogs} />

      <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t border-border dark:border-border-dark">
        <span>{t('dashboard.copyright')} &copy; 2026</span>
        <div className="flex items-center gap-3">
          {lastUpdate && <span>{t('dashboard.updated')} {lastUpdate.toLocaleTimeString('ko-KR', { hour12: false })}</span>}
          {error && <span className="text-error">{error}</span>}
          <span className="px-2 py-0.5 rounded bg-primary/10 text-text dark:text-white font-mono text-xs font-bold">
            {data.server.nodeEnv}
          </span>
        </div>
      </div>
    </>
  );
}
