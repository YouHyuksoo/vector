/**
 * @file src/app/dashboard/download/page.tsx
 * @description Vector 송신기 다운로드 페이지 — 실행파일, 설정파일 다운로드
 *
 * 초보자 가이드:
 * 1. 64-bit / 32-bit 파일이 카드로 나열되어 바로 선택 가능
 * 2. 설비별 TOML / Fluent Bit 설정 파일도 바로 다운로드
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
  const [configType, setConfigType] = useState<ConfigType>('vector');
  const { t } = useI18n();

  useEffect(() => {
    apiFetch<{ names: string[] }>('/api/monitor/agent/configs')
      .then(d => setAgents(d.names)).catch(() => {});
    apiFetch<{ names: string[] }>('/api/monitor/agent-fluent/configs')
      .then(d => setFluentAgents(d.names)).catch(() => {});
  }, []);

  const downloads = [
    {
      label: 'Vector',
      icon: 'memory',
      items: [
        { bit: '64-bit', version: 'v0.45', file: 'vector.zip', href: '/api/monitor/download/vector-zip' },
        { bit: '32-bit', version: 'v0.38', file: 'vector-x86.zip', href: '/api/monitor/download/vector-zip?edition=x86' },
      ],
      desc: t('download.vectorExeDesc'),
    },
    {
      label: 'Agent Manager',
      icon: 'settings_suggest',
      items: [
        { bit: '64-bit', version: 'Go exe', file: 'agent-manager-x64.exe', href: '/api/monitor/download/agent-manager' },
        { bit: '32-bit', version: 'Go exe', file: 'agent-manager-x86.exe', href: '/api/monitor/download/agent-manager?arch=x86' },
      ],
      desc: t('download.agentManagerDesc'),
    },
    {
      label: 'Fluent Bit',
      icon: 'air',
      items: [
        { bit: '32-bit', version: 'Windows', file: 'fluent-bit.zip', href: '/api/monitor/download/fluent-bit' },
      ],
      desc: t('download.fluentBitDesc'),
    },
  ];

  const configList = configType === 'vector' ? agents : fluentAgents;
  const configExt = configType === 'vector' ? '.toml' : '.conf';
  const configBase = configType === 'vector' ? '/api/monitor/download/agent' : '/api/monitor/download/agent-fluent';
  const noConfigMsg = configType === 'vector' ? t('download.noAgents') : t('download.noFluentAgents');

  return (
    <>
      <h1 className="text-lg font-bold text-text dark:text-white">
        {t('download.title')}
        <span className="text-muted-foreground text-sm font-normal ml-2">/ {t('download.subtitle')}</span>
      </h1>

      <QuickGuide />

      {/* 실행파일 다운로드 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {downloads.map(group => (
          <Card key={group.label} className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name={group.icon} size="sm" className="text-primary" />
              <p className="font-bold text-text dark:text-white">{group.label}</p>
            </div>
            <p className="text-xs text-muted-foreground">{group.desc}</p>
            <div className="flex flex-col gap-2 mt-auto">
              {group.items.map(item => (
                <a key={item.href} href={item.href}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-border dark:border-border-dark
                    hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors">
                  <div>
                    <span className="text-sm font-bold text-text dark:text-white">{item.bit}</span>
                    <span className="text-xs text-muted-foreground ml-2">{item.version}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary font-bold text-xs">
                    <Icon name="file_download" size="sm" />
                    {item.file}
                  </div>
                </a>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* 설비별 설정 파일 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-text dark:text-white">{t('download.agentConfig')}</p>
          <div className="flex gap-1">
            {(['vector', 'fluent'] as const).map(ct => (
              <button key={ct} type="button" onClick={() => setConfigType(ct)}
                className={`px-3 py-1 rounded text-xs font-bold transition-all
                  ${configType === ct
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-text dark:hover:text-white'}`}>
                {ct === 'vector' ? 'Vector (.toml)' : 'Fluent Bit (.conf)'}
              </button>
            ))}
          </div>
        </div>

        {configType === 'fluent' && (
          <p className="text-xs text-muted-foreground mb-2">{t('download.fluentNotice')}</p>
        )}

        {!configList.length ? (
          <p className="text-xs text-muted-foreground text-center py-4">{noConfigMsg}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {configList.map(name => (
              <a key={name} href={`${configBase}/${name}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-border dark:border-border-dark
                  hover:bg-surface/50 dark:hover:bg-surface-dark/50 transition-colors">
                <span className="font-mono font-bold text-text dark:text-white">{name}</span>
                <span className="text-muted-foreground">{configExt}</span>
                <Icon name="file_download" size="xs" className="text-primary" />
              </a>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
