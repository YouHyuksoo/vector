/**
 * @file src/app/dashboard/download/components/QuickGuide.tsx
 * @description 송신기 다운로드 페이지 빠른 도움말 컴포넌트
 *
 * 초보자 가이드:
 * - Agent Manager 중심의 3단계 설치 가이드 (다운로드 → 설치+설정 → 시작)
 * - 수동 설치 방법도 하단에 안내
 * - 접기/펼치기로 공간 절약 가능
 */
'use client';

import { useState } from 'react';
import { Icon, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface Phase {
  icon: string;
  titleKey: string;
  descKey: string;
  details: { labelKey: string; textKey: string }[];
  code?: string;
  pill: string;
  card: string;
  iconBox: string;
  iconColor: string;
  titleColor: string;
  dot: string;
}

const PHASES: Phase[] = [
  {
    icon: 'cloud_download',
    titleKey: 'download.guide.step1',
    descKey: 'download.guide.step1Desc',
    details: [
      { labelKey: 'download.guide.agentMgr', textKey: 'download.guide.agentMgrDesc' },
    ],
    pill: 'bg-primary/10 text-primary',
    card: 'border-primary/20',
    iconBox: 'bg-primary/10',
    iconColor: 'text-primary',
    titleColor: 'text-primary',
    dot: 'bg-primary',
  },
  {
    icon: 'settings_suggest',
    titleKey: 'download.guide.step2',
    descKey: 'download.guide.step2Desc',
    details: [
      { labelKey: 'download.guide.installVector', textKey: 'download.guide.installVectorDesc' },
      { labelKey: 'download.guide.downloadToml', textKey: 'download.guide.downloadTomlDesc' },
      { labelKey: 'download.guide.editSettings', textKey: 'download.guide.editSettingsDesc' },
    ],
    code: 'C:\\vector\\\n  ├── vector.exe      ← auto installed\n  ├── AOI.toml         ← downloaded from server\n  ├── data\\            ← auto created\n  └── start-vector.bat',
    pill: 'bg-accent/10 text-accent',
    card: 'border-accent/20',
    iconBox: 'bg-accent/10',
    iconColor: 'text-accent',
    titleColor: 'text-accent',
    dot: 'bg-accent',
  },
  {
    icon: 'play_circle',
    titleKey: 'download.guide.step3',
    descKey: 'download.guide.step3Desc',
    details: [
      { labelKey: 'download.guide.startVector', textKey: 'download.guide.startVectorDesc' },
      { labelKey: 'download.guide.registerSvc', textKey: 'download.guide.registerSvcDesc' },
    ],
    pill: 'bg-success/10 text-success',
    card: 'border-success/20',
    iconBox: 'bg-success/10',
    iconColor: 'text-success',
    titleColor: 'text-success',
    dot: 'bg-success',
  },
];

export function QuickGuide() {
  const [open, setOpen] = useState(true);
  const { t } = useI18n();

  return (
    <Card className="border-primary/30 dark:border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.03]">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="rocket_launch" className="text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-text dark:text-white">{t('download.guide.title')}</p>
            <p className="text-xs text-muted-foreground">{t('download.guide.subtitle')}</p>
          </div>
        </div>
        <Icon
          name={open ? 'expand_less' : 'expand_more'}
          className="text-muted-foreground"
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* 흐름 요약 바 */}
          <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
            {PHASES.map((p, i) => (
              <div key={p.titleKey} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${p.pill}`}>
                  <Icon name={p.icon} size="xs" />
                  {t(p.titleKey)}
                </div>
                {i < PHASES.length - 1 && (
                  <Icon name="arrow_forward" size="xs" className="text-muted-foreground" />
                )}
              </div>
            ))}
          </div>

          {/* 단계별 상세 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {PHASES.map(phase => (
              <div
                key={phase.titleKey}
                className={`rounded-xl border bg-white dark:bg-surface-dark p-4 space-y-3 ${phase.card}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`size-7 rounded-lg flex items-center justify-center ${phase.iconBox}`}>
                    <Icon name={phase.icon} size="sm" className={phase.iconColor} />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${phase.titleColor}`}>{t(phase.titleKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(phase.descKey)}</p>
                  </div>
                </div>

                <ul className="space-y-2">
                  {phase.details.map(d => (
                    <li key={d.labelKey} className="flex gap-2 text-xs">
                      <span className={`flex-shrink-0 mt-0.5 size-1.5 rounded-full ${phase.dot}`} />
                      <span className="text-text dark:text-white">
                        <span className="font-bold">{t(d.labelKey)}</span>
                        <span className="text-muted-foreground"> — {t(d.textKey)}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {phase.code && (
                  <pre className="text-[11px] leading-relaxed bg-slate-50 dark:bg-slate-800/50
                    rounded-lg px-3 py-2 text-muted-foreground font-mono overflow-x-auto">
                    {phase.code}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {/* 수동 설치 안내 */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl
            bg-slate-50 dark:bg-slate-800/30 border border-border dark:border-border-dark">
            <Icon name="terminal" className="text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-text dark:text-white mb-1">{t('download.guide.manualTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('download.guide.manualDesc')}</p>
            </div>
          </div>

          {/* Agent Manager 다국어 지원 안내 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/30">
            <Icon name="translate" size="sm" className="text-muted-foreground flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              <span className="font-bold">{t('download.guide.langSupport')}</span>
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
