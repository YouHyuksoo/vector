/**
 * @file src/app/dashboard/download/page.tsx
 * @description Vector 송신기 다운로드 페이지
 *
 * 초보자 가이드:
 * 1. **Vector 실행파일**: vector.zip 다운로드 (설비 PC에 압축 해제)
 * 2. **설비별 TOML**: 설비 목록에서 선택하여 개별 다운로드
 * 3. **설치 가이드**: 다운로드 후 설정 변경 방법 안내
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

const STEPS = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;

export default function DownloadPage() {
  const [agents, setAgents] = useState<string[]>([]);
  const { t } = useI18n();

  useEffect(() => {
    apiFetch<{ names: string[] }>('/api/monitor/agent/configs')
      .then(d => setAgents(d.names))
      .catch(() => {});
  }, []);

  return (
    <>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="file_download" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            {t('download.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">
            / {t('download.subtitle')}
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vector 실행파일 다운로드 */}
        <Card className="flex flex-col items-center gap-4 py-8">
          <div className="size-14 rounded-2xl bg-success/10 flex items-center justify-center">
            <Icon name="terminal" size="lg" className="text-success" />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-text dark:text-white">{t('download.vectorExe')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('download.vectorExeDesc')}</p>
          </div>
          <a
            href="/api/monitor/download/vector-zip"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm
              bg-success text-white hover:bg-success/90
              shadow-lg shadow-success/20 hover:shadow-success/30
              transition-all duration-200 hover:-translate-y-0.5"
          >
            <Icon name="file_download" className="text-white" />
            {t('download.vectorExeBtn')}
          </a>
          <p className="text-xs text-muted-foreground font-mono">{t('download.vectorExeSize')}</p>
        </Card>

        {/* 설비별 TOML 다운로드 */}
        <Card className="lg:col-span-2">
          <p className="text-base font-bold text-text dark:text-white mb-1 flex items-center gap-2">
            <Icon name="description" className="text-accent" />
            {t('download.agentConfig')}
          </p>
          <p className="text-sm text-muted-foreground mb-4">{t('download.agentConfigDesc')}</p>

          {!agents.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('download.noAgents')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map(name => (
                <div key={name}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-border dark:border-border-dark
                    hover:bg-surface/50 dark:hover:bg-surface-dark/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="size-2 rounded-full bg-accent" />
                    <span className="font-mono text-sm font-bold text-text dark:text-white">{name}</span>
                    <span className="text-xs text-muted-foreground">.toml</span>
                  </div>
                  <a
                    href={`/api/monitor/download/agent/${name}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                      bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Icon name="file_download" size="xs" />
                    {t('download.downloadBtn')}
                  </a>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 설치 가이드 */}
      <Card>
        <p className="text-base font-bold text-text dark:text-white mb-4 flex items-center gap-2">
          <Icon name="checklist" className="text-primary" />
          {t('download.steps')}
        </p>
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary
                flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <span className="text-text dark:text-white pt-0.5">{t(`download.${step}`)}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
