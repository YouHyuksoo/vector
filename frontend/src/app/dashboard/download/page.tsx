/**
 * @file src/app/dashboard/download/page.tsx
 * @description Vector 송신기 다운로드 페이지
 *
 * 초보자 가이드:
 * 1. 상단에서 OS(Win10+ / Win7)와 아키텍처(64-bit / 32-bit) 선택
 * 2. 조합에 따라 Vector 엔진, Agent Manager, Fluent Bit, 설정 파일이 자동으로 맞춰짐
 * 3. Win7 또는 32-bit 선택 시 Fluent Bit 다운로드가 추가로 표시됨
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { QuickGuide } from './components/QuickGuide';

type ConfigType = 'vector' | 'fluent';

export default function DownloadPage() {
  const [agents, setAgents] = useState<string[]>([]);
  const [fluentAgents, setFluentAgents] = useState<string[]>([]);
  const [os, setOs] = useState<'win10' | 'win7'>('win10');
  const [arch, setArch] = useState<'x64' | 'x86'>('x64');
  const [configType, setConfigType] = useState<ConfigType>('vector');
  const { t } = useI18n();

  useEffect(() => {
    apiFetch<{ names: string[] }>('/api/monitor/agent/configs')
      .then(d => setAgents(d.names)).catch(() => {});
    apiFetch<{ names: string[] }>('/api/monitor/agent-fluent/configs')
      .then(d => setFluentAgents(d.names)).catch(() => {});
  }, []);

  const is64 = arch === 'x64';
  const isWin7 = os === 'win7';
  /* Vector zip URL 결정 */
  const vectorZipUrl = !is64
    ? '/api/monitor/download/vector-zip?edition=x86'
    : isWin7
      ? '/api/monitor/download/vector-zip?edition=win7'
      : '/api/monitor/download/vector-zip';

  /* Agent Manager URL 결정 (4가지 조합) */
  const agentManagerUrl = isWin7
    ? (is64 ? '/api/monitor/download/agent-manager?edition=win7' : '/api/monitor/download/agent-manager?edition=win7-x86')
    : (is64 ? '/api/monitor/download/agent-manager' : '/api/monitor/download/agent-manager?arch=x86');

  /* Vector 버전 표시 */
  const vectorVersion = is64 && !isWin7 ? 'v0.45' : 'v0.38';

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

      {/* OS + 아키텍처 선택 */}
      <div className="flex flex-wrap gap-6 items-center">
        <div className="flex gap-3 items-center">
          <span className="text-sm font-bold text-muted-foreground">OS</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOs('win10')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border-2
                ${!isWin7
                  ? 'border-success bg-success/10 text-success shadow-sm'
                  : 'border-border dark:border-border-dark text-muted-foreground hover:border-success/40'}`}>
              <Icon name="desktop_windows" size="sm" />
              Windows 10+
            </button>
            <button type="button" onClick={() => setOs('win7')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border-2
                ${isWin7
                  ? 'border-warning bg-warning/10 text-warning shadow-sm'
                  : 'border-border dark:border-border-dark text-muted-foreground hover:border-warning/40'}`}>
              <Icon name="history" size="sm" />
              Windows 7
            </button>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <span className="text-sm font-bold text-muted-foreground">{t('download.archLabel')}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setArch('x64')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border-2
                ${is64
                  ? 'border-primary bg-primary/10 text-primary shadow-sm'
                  : 'border-border dark:border-border-dark text-muted-foreground hover:border-primary/40'}`}>
              64-bit
              <span className="text-[10px] font-normal opacity-70">{t('download.archRecommended')}</span>
            </button>
            <button type="button" onClick={() => setArch('x86')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border-2
                ${!is64
                  ? 'border-orange-500 bg-orange-500/10 text-orange-500 shadow-sm'
                  : 'border-border dark:border-border-dark text-muted-foreground hover:border-orange-500/40'}`}>
              32-bit
              <span className="text-[10px] font-normal opacity-70">{t('download.archLegacy')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 lg:grid-cols-3`}>
        {/* Vector 실행파일 다운로드 */}
        <Card className="flex flex-col items-center gap-4 py-8">
          <div className="size-14 rounded-2xl flex items-center justify-center bg-success/10">
            <Icon name="terminal" size="lg" className="text-success" />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-text dark:text-white">{t('download.vectorExe')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('download.vectorExeDesc')}</p>
          </div>
          <p className="text-xs font-mono font-bold text-muted-foreground">
            {vectorVersion} / {is64 ? '64-bit' : '32-bit'} / {isWin7 ? 'Win7' : 'Win10+'}
          </p>
          <a href={vectorZipUrl}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5
              bg-success hover:bg-success/90 shadow-success/20">
            <Icon name="file_download" className="text-white" />
            vector.zip {t('download.downloadBtn')}
          </a>
          <p className="text-xs text-muted-foreground font-mono">{t('download.vectorExeSize')}</p>
        </Card>

        {/* Fluent Bit 실행파일 다운로드 (32-bit 또는 Win7에서 표시) */}
        <Card className="flex flex-col items-center gap-4 py-8">
          <div className="size-14 rounded-2xl flex items-center justify-center bg-info/10">
            <Icon name="air" size="lg" className="text-info" />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-text dark:text-white">{t('download.fluentBit')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('download.fluentBitDesc')}</p>
          </div>
          <p className="text-[11px] text-info font-medium px-3 text-center">{t('download.fluentBitNotice')}</p>
          <a href="/api/monitor/download/fluent-bit"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5
              bg-info hover:bg-info/90 shadow-info/20">
            <Icon name="file_download" className="text-white" />
            {t('download.fluentBitBtn')}
          </a>
          <p className="text-xs text-muted-foreground font-mono">{t('download.fluentBitSize')}</p>
        </Card>

        {/* Agent Manager 다운로드 */}
        <Card className="flex flex-col items-center gap-4 py-8">
          <div className={`size-14 rounded-2xl flex items-center justify-center ${is64 ? 'bg-primary/10' : 'bg-orange-500/10'}`}>
            <Icon name="settings_suggest" size="lg" className={is64 ? 'text-primary' : 'text-orange-500'} />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-text dark:text-white">{t('download.agentManager')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('download.agentManagerDesc')}</p>
          </div>
          {!is64 && (
            <p className="text-[11px] text-orange-500 font-medium px-3 text-center">{t('download.archX86Notice')}</p>
          )}
          <a href={agentManagerUrl}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5
              ${is64
                ? 'bg-primary hover:bg-primary/90 shadow-primary/20'
                : 'bg-orange-500 hover:bg-orange-500/90 shadow-orange-500/20'}`}>
            <Icon name="file_download" className="text-white" />
            {isWin7
              ? (is64 ? t('download.agentManagerBtnWin7') : t('download.agentManagerBtnWin7X86'))
              : (is64 ? t('download.agentManagerBtn') : t('download.agentManagerBtnX86'))}
          </a>
          <p className="text-xs text-muted-foreground font-mono">{t('download.agentManagerSize')}</p>
        </Card>

        {/* 설비별 설정 파일 다운로드 */}
        <Card className="lg:col-span-3">
          <p className="text-base font-bold text-text dark:text-white mb-1 flex items-center gap-2">
            <Icon name="description" className="text-accent" />
            {t('download.agentConfig')}
          </p>
          <p className="text-sm text-muted-foreground mb-3">{t('download.agentConfigDesc')}</p>

          {/* Vector / Fluent Bit 탭 */}
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => setConfigType('vector')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all
                ${configType === 'vector'
                  ? 'bg-accent/15 text-accent border-2 border-accent'
                  : 'bg-secondary text-muted-foreground border-2 border-transparent hover:border-accent/30'}`}>
              <Icon name="terminal" size="sm" />
              Vector (.toml)
            </button>
            <button type="button" onClick={() => setConfigType('fluent')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all
                ${configType === 'fluent'
                  ? 'bg-info/15 text-info border-2 border-info'
                  : 'bg-secondary text-muted-foreground border-2 border-transparent hover:border-info/30'}`}>
              <Icon name="air" size="sm" />
              Fluent Bit (.conf)
            </button>
          </div>

          {configType === 'fluent' && (
            <p className="text-xs text-info mb-3 flex items-center gap-1">
              <Icon name="info" size="xs" />
              {t('download.fluentNotice')}
            </p>
          )}

          {/* Vector TOML 목록 */}
          {configType === 'vector' && (
            !agents.length ? (
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
                    <a href={`/api/monitor/download/agent/${name}${isWin7 || !is64 ? '?edition=win7' : ''}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                        bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                      <Icon name="file_download" size="xs" />
                      {t('download.downloadBtn')}
                    </a>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Fluent Bit conf 목록 */}
          {configType === 'fluent' && (
            !fluentAgents.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('download.noFluentAgents')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fluentAgents.map(name => (
                  <div key={name}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-border dark:border-border-dark
                      hover:bg-surface/50 dark:hover:bg-surface-dark/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="size-2 rounded-full bg-info" />
                      <span className="font-mono text-sm font-bold text-text dark:text-white">{name}</span>
                      <span className="text-xs text-muted-foreground">.conf</span>
                    </div>
                    <a href={`/api/monitor/download/agent-fluent/${name}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                        bg-info/10 text-info hover:bg-info/20 transition-colors">
                      <Icon name="file_download" size="xs" />
                      {t('download.downloadBtn')}
                    </a>
                  </div>
                ))}
              </div>
            )
          )}
        </Card>
      </div>
    </>
  );
}
