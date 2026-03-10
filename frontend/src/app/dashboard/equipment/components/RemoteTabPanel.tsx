/**
 * @file RemoteTabPanel.tsx — 원격 장비 관리 탭 컨테이너
 * @description 장비 카드 클릭 시 표시. 처리내역/상태/설정/제어/로그 탭 전환.
 *   초보자 가이드: Equipment 페이지에서 장비 선택 시 인라인으로 열리는 관리 패널입니다.
 */
'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { RemoteStatusTab } from './RemoteStatusTab';
import { RemoteConfigTab } from './RemoteConfigTab';
import { RemoteControlTab } from './RemoteControlTab';
import { RemoteLogsTab } from './RemoteLogsTab';

const TABS = ['activity', 'status', 'config', 'control', 'logs'] as const;
type Tab = typeof TABS[number];

const TAB_ICONS: Record<Tab, string> = {
  activity: 'history',
  status: 'monitor_heart',
  config: 'settings',
  control: 'power_settings_new',
  logs: 'folder_open',
};

interface Props {
  equipmentId: string;
  activityPanel: React.ReactNode;
}

export function RemoteTabPanel({ equipmentId, activityPanel }: Props) {
  const [tab, setTab] = useState<Tab>('activity');
  const { t } = useI18n();

  return (
    <div className="mt-1 rounded-lg border border-primary/20 bg-white dark:bg-background-dark
      animate-in slide-in-from-top-1 duration-200">
      {/* 탭 헤더 */}
      <div className="flex border-b border-border/50 dark:border-border-dark/50 overflow-x-auto">
        {TABS.map(tb => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap
              transition-colors border-b-2
              ${tab === tb
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
          >
            <Icon name={TAB_ICONS[tb]} size="xs" />
            {t(`remote.tabs.${tb}`)}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="p-3">
        {tab === 'activity' && activityPanel}
        {tab === 'status' && <RemoteStatusTab equipmentId={equipmentId} />}
        {tab === 'config' && <RemoteConfigTab equipmentId={equipmentId} />}
        {tab === 'control' && <RemoteControlTab equipmentId={equipmentId} />}
        {tab === 'logs' && <RemoteLogsTab equipmentId={equipmentId} />}
      </div>
    </div>
  );
}
