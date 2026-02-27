/**
 * @file src/app/dashboard/receiver/components/AggregatorConfigView.tsx
 * @description Aggregator TOML 설정값을 읽기 전용으로 표시하는 보기 모드 컴포넌트
 *
 * 초보자 가이드:
 * 1. TOML 문자열에서 정규식으로 설정값을 추출하여 라벨:값 형태로 표시
 * 2. 편집 불가 — 현재 저장된 설정을 한눈에 확인하는 용도
 * 3. 섹션 레이아웃은 편집 모드(AggregatorConfigForm)와 동일 구조
 */
'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface Props {
  content: string;
}

/* ── 정규식 추출 헬퍼 ─────────────────────────────── */

const g = (c: string, re: RegExp, fb = '') => {
  const m = c.match(re);
  return m ? m[1] : fb;
};

/* ── 읽기 전용 필드 / 섹션 컴포넌트 ────────────────── */

function VSec({ icon, title, children }: {
  icon: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-xl bg-surface/50 dark:bg-surface-dark/50 border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name={icon} size="sm" className="text-success" />
        <span className="text-sm font-bold text-text dark:text-white">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

function VF({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span className={`text-xs font-medium text-text dark:text-white truncate ${mono ? 'font-mono' : ''}`}>
        {value || '-'}
      </span>
    </div>
  );
}

function VBadge({ label, value, color = 'primary' }: {
  label: string; value: string; color?: string;
}) {
  const cls = color === 'success' ? 'bg-success/10 text-success'
    : color === 'warning' ? 'bg-warning/10 text-warning'
    : 'bg-primary/10 text-primary';
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{value}</span>
    </div>
  );
}

/* ── 메인 컴포넌트 ──────────────────────────────── */

export function AggregatorConfigView({ content }: Props) {
  const { t } = useI18n();

  const v = useMemo(() => {
    const apiAddr = g(content, /\[api\]\s*\n[^[]*?address\s*=\s*"([^"]*)"/, '');
    const srcAddr = g(content, /\[sources\.from_agents\]\s*\n[^[]*?address\s*=\s*"([^"]*)"/, '');
    const rawBuf = g(content, /\[sinks\.raw_file\.buffer\]\s*\n[^[]*?max_size\s*=\s*(\d+)/, '0');
    const apiBuf = g(content, /\[sinks\.to_api\.buffer\]\s*\n[^[]*?max_size\s*=\s*(\d+)/, '0');

    return {
      dataDir: g(content, /^data_dir\s*=\s*"([^"]*)"/m).replace(/\\\\/g, '\\'),
      apiAddr,
      srcAddr,
      rawPath: g(content, /\[sinks\.raw_file\]\s*\n[^[]*?path\s*=\s*"([^"]*)"/).replace(/\\\\/g, '\\'),
      rawBuf: `${Math.round(Number(rawBuf) / 1048576)} MB`,
      batchMax: g(content, /\[sinks\.to_api\.batch\]\s*\n[^[]*?max_events\s*=\s*(\d+)/, '100'),
      batchTimeout: g(content, /\[sinks\.to_api\.batch\]\s*\n[^[]*?timeout_secs\s*=\s*(\d+)/, '5'),
      apiBuf: `${Math.round(Number(apiBuf) / 1048576)} MB`,
      retryInit: g(content, /\[sinks\.to_api\.request\]\s*\n[^[]*?retry_initial_backoff_secs\s*=\s*(\d+)/, '1'),
      retryMax: g(content, /\[sinks\.to_api\.request\]\s*\n[^[]*?retry_max_duration_secs\s*=\s*(\d+)/, '30'),
      targetType: g(content, /\.target_type\s*=\s*"([^"]*)"/, 'TABLE'),
      targetTable: /\.target_table\s*=\s*"LOG_"\s*\+\s*to_string!/.test(content)
        ? 'LOG_{log_type}' : g(content, /\.target_table\s*=\s*"([^"]+)"/, ''),
      timestamp: /\.timestamp\s*=\s*now\(\)/.test(content) ? t('receiver.form.timestampNow') : t('receiver.form.timestampField'),
      apiCodec: g(content, /\[sinks\.to_api\.encoding\]\s*\n[^[]*?codec\s*=\s*"([^"]*)"/, 'json').toUpperCase(),
      fileCodec: g(content, /\[sinks\.raw_file\.encoding\]\s*\n[^[]*?codec\s*=\s*"([^"]*)"/, 'text').toUpperCase(),
      httpMethod: g(content, /\[sinks\.to_api\]\s*\n[^[]*?method\s*=\s*"([^"]*)"/, 'post').toUpperCase(),
      compression: g(content, /\[sinks\.to_api\]\s*\n[^[]*?compression\s*=\s*"([^"]*)"/, 'none'),
      apiBufType: g(content, /\[sinks\.to_api\.buffer\]\s*\n[^[]*?type\s*=\s*"([^"]*)"/, 'disk'),
      apiBufPolicy: g(content, /\[sinks\.to_api\.buffer\]\s*\n[^[]*?when_full\s*=\s*"([^"]*)"/, 'block'),
      fileBufType: g(content, /\[sinks\.raw_file\.buffer\]\s*\n[^[]*?type\s*=\s*"([^"]*)"/, 'disk'),
      fileBufPolicy: g(content, /\[sinks\.raw_file\.buffer\]\s*\n[^[]*?when_full\s*=\s*"([^"]*)"/, 'block'),
      healthcheck: /\[sinks\.to_api\.healthcheck\]\s*\n[^[]*?enabled\s*=\s*true/.test(content),
      ack: /\[sinks\.to_api\]\s*\n[^[]*?acknowledgements\s*=\s*true/.test(content),
    };
  }, [content, t]);

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: 백엔드 전송 + 기본 설정 */}
      <div className="grid grid-cols-2 gap-2">
        <VSec icon="send" title={t('receiver.form.apiSink')}>
          <VF label={t('receiver.form.batchMax')} value={`${v.batchMax} ${t('receiver.form.batchMaxUnit')}`} />
          <VF label={t('receiver.form.batchTimeout')} value={`${v.batchTimeout}s`} />
          <VF label={t('receiver.form.apiBufSize')} value={v.apiBuf} />
          <VF label={t('receiver.form.retryInitial')} value={`${v.retryInit}s`} />
          <VF label={t('receiver.form.retryMax')} value={`${v.retryMax}s`} />
        </VSec>

        <VSec icon="settings" title={t('receiver.form.basic')}>
          <VF label={t('receiver.form.dataDir')} value={v.dataDir} mono />
          <VF label="Vector API" value={v.apiAddr} mono />
          <VF label={t('receiver.form.source')} value={v.srcAddr} mono />
        </VSec>
      </div>

      {/* Row 2: 파일 저장 + VRL 파싱 */}
      <div className="grid grid-cols-2 gap-2">
        <VSec icon="folder_open" title={t('receiver.form.rawFile')}>
          <div className="col-span-2">
            <VF label={t('receiver.form.rawPath')} value={v.rawPath} mono />
          </div>
          <VF label={t('receiver.form.rawBufSize')} value={v.rawBuf} />
        </VSec>

        <VSec icon="data_object" title={t('receiver.form.vrlOptions')}>
          <VBadge label={t('receiver.form.targetType')} value={v.targetType} color="primary" />
          <VF label={t('receiver.form.targetTable')} value={v.targetTable} mono />
          <VF label={t('receiver.form.timestampMode')} value={v.timestamp} />
        </VSec>
      </div>

      {/* Row 3: 전송/인코딩 + 버퍼/안전 */}
      <div className="grid grid-cols-2 gap-2">
        <VSec icon="swap_horiz" title={t('receiver.form.transport')}>
          <VBadge label={t('receiver.form.apiCodec')} value={v.apiCodec} />
          <VBadge label={t('receiver.form.fileCodec')} value={v.fileCodec} />
          <VBadge label={t('receiver.form.httpMethod')} value={v.httpMethod} />
          <VBadge label={t('receiver.form.compression')} value={v.compression === 'none' ? t('receiver.form.compressionNone') : v.compression} />
        </VSec>

        <VSec icon="shield" title={t('receiver.form.bufferSafety')}>
          <VF label={t('receiver.form.apiBufType')} value={v.apiBufType} />
          <VF label={t('receiver.form.apiBufPolicy')} value={v.apiBufPolicy} />
          <VF label={t('receiver.form.fileBufType')} value={v.fileBufType} />
          <VF label={t('receiver.form.fileBufPolicy')} value={v.fileBufPolicy} />
          <VBadge label={t('receiver.form.healthcheck')} value={v.healthcheck ? 'ON' : 'OFF'} color={v.healthcheck ? 'success' : 'warning'} />
          <VBadge label={t('receiver.form.acknowledgements')} value={v.ack ? 'ON' : 'OFF'} color={v.ack ? 'success' : 'warning'} />
        </VSec>
      </div>
    </div>
  );
}
