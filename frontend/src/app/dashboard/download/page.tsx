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
import { QuickGuide } from './components/QuickGuide';


export default function DownloadPage() {
  const [agents, setAgents] = useState<string[]>([]);
  const [edition, setEdition] = useState<'default' | 'win7'>('default');
  const { t } = useI18n();

  useEffect(() => {
    apiFetch<{ names: string[] }>('/api/monitor/agent/configs')
      .then(d => setAgents(d.names))
      .catch(() => {});
  }, []);

  const zipUrl = edition === 'win7'
    ? '/api/monitor/download/vector-zip?edition=win7'
    : '/api/monitor/download/vector-zip';

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

      <QuickGuide />

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

          {/* OS 버전 선택 */}
          <div className="flex gap-2 w-full max-w-xs">
            <button
              type="button"
              onClick={() => setEdition('default')}
              className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border-2 text-xs font-bold transition-all
                ${edition === 'default'
                  ? 'border-success bg-success/10 text-success'
                  : 'border-border dark:border-border-dark text-muted-foreground hover:border-success/50'}`}
            >
              <Icon name="desktop_windows" size="sm" />
              <span>Windows 10+</span>
              <span className="text-[10px] font-normal opacity-70">v0.45 ({t('download.editionLatest')})</span>
            </button>
            <button
              type="button"
              onClick={() => setEdition('win7')}
              className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border-2 text-xs font-bold transition-all
                ${edition === 'win7'
                  ? 'border-warning bg-warning/10 text-warning'
                  : 'border-border dark:border-border-dark text-muted-foreground hover:border-warning/50'}`}
            >
              <Icon name="history" size="sm" />
              <span>Windows 7</span>
              <span className="text-[10px] font-normal opacity-70">v0.38 ({t('download.editionLegacy')})</span>
            </button>
          </div>
          {edition === 'win7' && (
            <p className="text-[11px] text-warning font-medium px-3 text-center">
              {t('download.win7Notice')}
            </p>
          )}

          <a
            href={zipUrl}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm
              text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5
              ${edition === 'win7'
                ? 'bg-warning hover:bg-warning/90 shadow-warning/20 hover:shadow-warning/30'
                : 'bg-success hover:bg-success/90 shadow-success/20 hover:shadow-success/30'}`}
          >
            <Icon name="file_download" className="text-white" />
            {edition === 'win7' ? t('download.vectorExeBtnWin7') : t('download.vectorExeBtn')}
          </a>
          <p className="text-xs text-muted-foreground font-mono">{t('download.vectorExeSize')}</p>
        </Card>

        {/* Agent Manager 다운로드 */}
        <Card className="flex flex-col items-center gap-4 py-8">
          <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon name="settings_suggest" size="lg" className="text-primary" />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-text dark:text-white">{t('download.agentManager')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('download.agentManagerDesc')}</p>
          </div>
          <a
            href="/api/monitor/download/agent-manager"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm
              bg-primary text-white hover:bg-primary/90
              shadow-lg shadow-primary/20 hover:shadow-primary/30
              transition-all duration-200 hover:-translate-y-0.5"
          >
            <Icon name="file_download" className="text-white" />
            {t('download.agentManagerBtn')}
          </a>
          <p className="text-xs text-muted-foreground font-mono">{t('download.agentManagerSize')}</p>
        </Card>

        {/* 설비별 TOML 다운로드 */}
        <Card className="lg:col-span-3">
          <p className="text-base font-bold text-text dark:text-white mb-1 flex items-center gap-2">
            <Icon name="description" className="text-accent" />
            {t('download.agentConfig')}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {t('download.agentConfigDesc')}
            {edition === 'win7' && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-warning/10 text-warning">
                <Icon name="history" size="xs" />
                {t('download.win7TomlNotice')}
              </span>
            )}
          </p>

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
                    href={`/api/monitor/download/agent/${name}${edition === 'win7' ? '?edition=win7' : ''}`}
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

    </>
  );
}
