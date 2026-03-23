/**
 * @file src/app/dashboard/download/components/QuickGuide.tsx
 * @description 송신기 설치 가이드 — 접기/펼치기 가능한 3단계 안내
 *
 * 초보자 가이드:
 * - Agent Manager 중심의 3단계 설치 가이드 (다운로드 → 설치+설정 → 시작)
 * - 접기/펼치기로 공간 절약 가능
 */
'use client';

import { useState } from 'react';
import { Icon, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

const STEPS = [
  {
    titleKey: 'download.guide.step1',
    descKey: 'download.guide.step1Desc',
    details: [{ labelKey: 'download.guide.agentMgr', textKey: 'download.guide.agentMgrDesc' }],
  },
  {
    titleKey: 'download.guide.step2',
    descKey: 'download.guide.step2Desc',
    details: [
      { labelKey: 'download.guide.installVector', textKey: 'download.guide.installVectorDesc' },
      { labelKey: 'download.guide.downloadToml', textKey: 'download.guide.downloadTomlDesc' },
      { labelKey: 'download.guide.editSettings', textKey: 'download.guide.editSettingsDesc' },
    ],
  },
  {
    titleKey: 'download.guide.step3',
    descKey: 'download.guide.step3Desc',
    details: [
      { labelKey: 'download.guide.startVector', textKey: 'download.guide.startVectorDesc' },
      { labelKey: 'download.guide.registerSvc', textKey: 'download.guide.registerSvcDesc' },
    ],
  },
];

export function QuickGuide() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-base font-bold text-text dark:text-white">{t('download.guide.title')}</p>
        <Icon name={open ? 'expand_less' : 'expand_more'} size="md" className="text-muted-foreground" />
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {STEPS.map((step, i) => (
            <div key={step.titleKey} className="rounded-lg border border-border dark:border-border-dark p-4">
              <p className="text-base font-bold text-text dark:text-white mb-2">
                <span className="text-primary mr-1">{i + 1}.</span>
                {t(step.titleKey)}
              </p>
              <p className="text-sm text-muted-foreground mb-3">{t(step.descKey)}</p>
              <ul className="space-y-2">
                {step.details.map(d => (
                  <li key={d.labelKey} className="text-sm text-muted-foreground">
                    <span className="font-bold text-text dark:text-white">{t(d.labelKey)}</span> — {t(d.textKey)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
