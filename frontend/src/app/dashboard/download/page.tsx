/**
 * @file src/app/dashboard/download/page.tsx
 * @description Vector 송신기 다운로드 페이지 — 실행파일, 설정파일 다운로드
 *
 * 초보자 가이드:
 * 1. 아키텍처(64-bit / 32-bit) 선택
 * 2. 조합에 따라 Vector, Agent Manager, Fluent Bit, 설정 파일이 자동으로 맞춰짐
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
  const vectorZipUrl = is64
    ? '/api/monitor/download/vector-zip'
    : '/api/monitor/download/vector-zip?edition=x86';
  const agentManagerUrl = is64
    ? '/api/monitor/download/agent-manager'
    : '/api/monitor/download/agent-manager?arch=x86';
  const vectorVersion = is64 ? 'v0.45' : 'v0.38';

  const downloads = [
    {
      label: t('download.vectorExe'),
      desc: t('download.vectorExeDesc'),
      meta: `${vectorVersion} / ${is64 ? '64-bit' : '32-bit'}`,
      file: 'vector.zip',
      href: vectorZipUrl,
      size: t('download.vectorExeSize'),
    },
    {
      label: t('download.fluentBit'),
      desc: t('download.fluentBitDesc'),
      meta: t('download.fluentBitNotice'),
      file: t('download.fluentBitBtn'),
      href: '/api/monitor/download/fluent-bit',
      size: t('download.fluentBitSize'),
    },
    {
      label: t('download.agentManager'),
      desc: t('download.agentManagerDesc'),
      meta: `Go exe — Win7~Win11 (${is64 ? '64-bit' : '32-bit'}, ~9MB)`,
      file: `agent-manager-${is64 ? 'x64' : 'x86'}.exe`,
      href: agentManagerUrl,
      size: t('download.agentManagerSize'),
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

      {/* 아키텍처 선택 */}
      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold text-muted-foreground">{t('download.archLabel')}</span>
        {(['x64', 'x86'] as const).map(a => (
          <button key={a} type="button" onClick={() => setArch(a)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
              ${arch === a
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border dark:border-border-dark text-muted-foreground hover:border-primary/40'}`}>
            {a === 'x64' ? '64-bit' : '32-bit'}
            <span className="text-[10px] font-normal ml-1 opacity-60">
              {a === 'x64' ? t('download.archRecommended') : t('download.archLegacy')}
            </span>
          </button>
        ))}
      </div>

      {/* 다운로드 카드 — 가로 테이블형 */}
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border dark:border-border-dark bg-surface/50 dark:bg-surface-dark/50">
              <th className="text-left px-4 py-2 text-xs font-bold text-muted-foreground">{t('download.vectorExe')}</th>
              <th className="text-left px-4 py-2 text-xs font-bold text-muted-foreground hidden sm:table-cell">info</th>
              <th className="text-right px-4 py-2 text-xs font-bold text-muted-foreground">{t('download.downloadBtn')}</th>
            </tr>
          </thead>
          <tbody>
            {downloads.map(d => (
              <tr key={d.href} className="border-b last:border-b-0 border-border/50 dark:border-border-dark/50 hover:bg-surface/30 dark:hover:bg-surface-dark/30">
                <td className="px-4 py-3">
                  <p className="font-bold text-text dark:text-white text-sm">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.desc}</p>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <p className="text-xs text-muted-foreground">{d.meta}</p>
                  <p className="text-[11px] text-muted-foreground/60 font-mono">{d.size}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <a href={d.href}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                      bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    <Icon name="file_download" size="xs" />
                    {d.file}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 설비별 설정 파일 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-text dark:text-white">{t('download.agentConfig')}</p>
          <div className="flex gap-1">
            {(['vector', 'fluent'] as const).map(ct => (
              <button key={ct} type="button" onClick={() => setConfigType(ct)}
                className={`px-3 py-1 rounded text-xs font-bold transition-all
                  ${configType === ct
                    ? 'bg-primary/10 text-primary'
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
