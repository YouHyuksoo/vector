/**
 * @file src/app/dashboard/receiver/components/AggregatorConfigForm.tsx
 * @description Aggregator TOML의 주요 설정값을 폼으로 편집하는 컴포넌트
 *
 * 초보자 가이드:
 * 1. TOML 문자열에서 정규식으로 설정값을 추출하여 폼 필드로 표시
 * 2. 폼 필드 변경 시 정규식으로 TOML 문자열 내 해당 값을 교체
 * 3. VRL 파싱 로직(transforms.parse_logs)은 복잡하므로 폼 대상에서 제외
 * 4. 부모 컴포넌트에서 전체 TOML 문자열을 관리하고 저장 처리
 */
'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { TargetRoutingSection } from './TargetRoutingSection';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

/* ── TOML 파싱 헬퍼 ─────────────────────────────── */

/** [api] 섹션의 address → [ip, port] */
const getApiAddr = (c: string): [string, string] => {
  const m = c.match(/\[api\]\s*\n[^[]*?address\s*=\s*"([^:]+):(\d+)"/);
  return m ? [m[1], m[2]] : ['', ''];
};

/** [api] 섹션의 address 교체 */
const setApiAddr = (c: string, ip: string, port: string) =>
  c.replace(
    /(\[api\]\s*\n[^[]*?address\s*=\s*")[^"]*(")/,
    `$1${ip}:${port}$2`,
  );

/** [sources.from_agents] 섹션의 address → [ip, port] */
const getSourceAddr = (c: string): [string, string] => {
  const m = c.match(/\[sources\.from_agents\]\s*\n[^[]*?address\s*=\s*"([^:]+):(\d+)"/);
  return m ? [m[1], m[2]] : ['', ''];
};

/** [sources.from_agents] 섹션의 address 교체 */
const setSourceAddr = (c: string, ip: string, port: string) =>
  c.replace(
    /(\[sources\.from_agents\]\s*\n[^[]*?address\s*=\s*")[^"]*(")/,
    `$1${ip}:${port}$2`,
  );

/** [sinks.raw_file] path 추출 */
const getRawPath = (c: string) => {
  const m = c.match(/\[sinks\.raw_file\]\s*\n[^[]*?path\s*=\s*"([^"]*)"/);
  return m ? m[1].replace(/\\\\/g, '\\') : '';
};

/** [sinks.raw_file] path 교체 */
const setRawPath = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.raw_file\]\s*\n[^[]*?path\s*=\s*")[^"]*(")/,
    `$1${v.replace(/\\/g, '\\\\')}$2`,
  );

/** [sinks.raw_file.buffer] max_size 추출 */
const getRawBufSize = (c: string) => {
  const m = c.match(/\[sinks\.raw_file\.buffer\]\s*\n[^[]*?max_size\s*=\s*(\d+)/);
  return m ? m[1] : '';
};

/** [sinks.raw_file.buffer] max_size 교체 */
const setRawBufSize = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.raw_file\.buffer\]\s*\n[^[]*?max_size\s*=\s*)\d+/,
    `$1${v}`,
  );

/** [sinks.to_api] uri 추출 */
const getApiUri = (c: string) => {
  const m = c.match(/\[sinks\.to_api\]\s*\n[^[]*?uri\s*=\s*"([^"]*)"/);
  return m ? m[1] : '';
};

/** [sinks.to_api] uri 교체 */
const setApiUri = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\]\s*\n[^[]*?uri\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.to_api.batch] max_events 추출 */
const getBatchMaxEvents = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.batch\]\s*\n[^[]*?max_events\s*=\s*(\d+)/);
  return m ? m[1] : '';
};

/** [sinks.to_api.batch] max_events 교체 */
const setBatchMaxEvents = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.batch\]\s*\n[^[]*?max_events\s*=\s*)\d+/,
    `$1${v}`,
  );

/** [sinks.to_api.batch] timeout_secs 추출 */
const getBatchTimeout = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.batch\]\s*\n[^[]*?timeout_secs\s*=\s*(\d+)/);
  return m ? m[1] : '';
};

/** [sinks.to_api.batch] timeout_secs 교체 */
const setBatchTimeout = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.batch\]\s*\n[^[]*?timeout_secs\s*=\s*)\d+/,
    `$1${v}`,
  );

/** [sinks.to_api.buffer] max_size 추출 */
const getApiBufSize = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.buffer\]\s*\n[^[]*?max_size\s*=\s*(\d+)/);
  return m ? m[1] : '';
};

/** [sinks.to_api.buffer] max_size 교체 */
const setApiBufSize = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.buffer\]\s*\n[^[]*?max_size\s*=\s*)\d+/,
    `$1${v}`,
  );

/** [sinks.to_api.request] retry_initial_backoff_secs 추출 */
const getRetryInitial = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.request\]\s*\n[^[]*?retry_initial_backoff_secs\s*=\s*(\d+)/);
  return m ? m[1] : '';
};

/** [sinks.to_api.request] retry_initial_backoff_secs 교체 */
const setRetryInitial = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.request\]\s*\n[^[]*?retry_initial_backoff_secs\s*=\s*)\d+/,
    `$1${v}`,
  );

/** [sinks.to_api.request] retry_max_duration_secs 추출 */
const getRetryMax = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.request\]\s*\n[^[]*?retry_max_duration_secs\s*=\s*(\d+)/);
  return m ? m[1] : '';
};

/** [sinks.to_api.request] retry_max_duration_secs 교체 */
const setRetryMax = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.request\]\s*\n[^[]*?retry_max_duration_secs\s*=\s*)\d+/,
    `$1${v}`,
  );

/** data_dir 추출 (최상위 레벨) */
const getDataDir = (c: string) => {
  const m = c.match(/^data_dir\s*=\s*"([^"]*)"/m);
  return m ? m[1].replace(/\\\\/g, '\\') : '';
};

/** data_dir 교체 */
const setDataDir = (c: string, v: string) =>
  c.replace(
    /(^data_dir\s*=\s*")[^"]*(")/m,
    `$1${v.replace(/\\/g, '\\\\')}$2`,
  );

/* ── 메인 컴포넌트 ──────────────────────────────── */

export function AggregatorConfigForm({ content, onChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => {
    const [apiIp, apiPort] = getApiAddr(content);
    const [srcIp, srcPort] = getSourceAddr(content);
    return {
      dataDir: getDataDir(content),
      apiIp, apiPort,
      srcIp, srcPort,
      rawPath: getRawPath(content),
      rawBufSize: getRawBufSize(content),
      apiUri: getApiUri(content),
      batchMaxEvents: getBatchMaxEvents(content),
      batchTimeout: getBatchTimeout(content),
      apiBufSize: getApiBufSize(content),
      retryInitial: getRetryInitial(content),
      retryMax: getRetryMax(content),
    };
  }, [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  return (
    <div className="flex flex-col gap-2.5">
      {/* 네트워크 — 기본 + Agent 수신을 한 섹션으로 */}
      <Sec icon="settings" title={t('receiver.form.basic')}>
        <F label={t('receiver.form.dataDir')} value={f.dataDir}
          onChange={v => u(c => setDataDir(c, v))}
          placeholder="C:\Project\vector\vector-data" mono />
        <div className="grid grid-cols-[1fr_80px_1fr_80px] gap-2 mt-2">
          <F label={t('receiver.form.apiIp')} value={f.apiIp}
            onChange={v => u(c => setApiAddr(c, v, f.apiPort))} />
          <F label={t('receiver.form.apiPort')} value={f.apiPort} type="number"
            onChange={v => u(c => setApiAddr(c, f.apiIp, v))} />
          <F label={t('receiver.form.listenIp')} value={f.srcIp}
            onChange={v => u(c => setSourceAddr(c, v, f.srcPort))} />
          <F label={t('receiver.form.listenPort')} value={f.srcPort} type="number"
            onChange={v => u(c => setSourceAddr(c, f.srcIp, v))} />
        </div>
      </Sec>

      {/* 파일 저장 — 경로 + 버퍼를 한 줄로 */}
      <Sec icon="folder_open" title={t('receiver.form.rawFile')}>
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <F label={t('receiver.form.rawPath')} value={f.rawPath}
            onChange={v => u(c => setRawPath(c, v))}
            placeholder="C:\data\raw-logs\{{ equipment_type }}\..." mono />
          <F label={t('receiver.form.rawBufSize')}
            value={String(Math.round(Number(f.rawBufSize) / 1048576))} type="number" suffix="MB"
            onChange={v => u(c => setRawBufSize(c, String(Number(v) * 1048576)))} />
        </div>
      </Sec>

      {/* 타겟 라우팅 — 설비별 TABLE/PROCEDURE 분기 */}
      <TargetRoutingSection content={content} onChange={onChange} />

      {/* API 전송 + 재시도 — 한 섹션으로 합침 */}
      <Sec icon="send" title={t('receiver.form.apiSink')}>
        <F label={t('receiver.form.apiUri')} value={f.apiUri}
          onChange={v => u(c => setApiUri(c, v))}
          placeholder="http://127.0.0.1:3100/api/logs" mono />
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 mt-2">
          <F label={t('receiver.form.batchMax')} value={f.batchMaxEvents} type="number" suffix={t('receiver.form.batchMaxUnit')}
            onChange={v => u(c => setBatchMaxEvents(c, v))} />
          <F label={t('receiver.form.batchTimeout')} value={f.batchTimeout} type="number" suffix="s"
            onChange={v => u(c => setBatchTimeout(c, v))} />
          <F label={t('receiver.form.apiBufSize')}
            value={String(Math.round(Number(f.apiBufSize) / 1048576))} type="number" suffix="MB"
            onChange={v => u(c => setApiBufSize(c, String(Number(v) * 1048576)))} />
          <F label={t('receiver.form.retryInitial')} value={f.retryInitial} type="number" suffix="s"
            onChange={v => u(c => setRetryInitial(c, v))} />
          <F label={t('receiver.form.retryMax')} value={f.retryMax} type="number" suffix="s"
            onChange={v => u(c => setRetryMax(c, v))} />
        </div>
      </Sec>
    </div>
  );
}

/* ── 서브 컴포넌트 ──────────────────────────────── */

export function Sec({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-surface/50 dark:bg-surface-dark/50 border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name={icon} size="md" className="text-success" />
        <span className="text-base font-bold text-text dark:text-white">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function F({ label, value, onChange, type = 'text', suffix, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; suffix?: string; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-1 block">{label}</label>
      <div className="relative">
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 text-base border rounded-lg
            bg-white dark:bg-slate-800 border-border
            ${mono ? 'font-mono text-sm' : ''}
            ${suffix ? 'pr-12' : ''}`} />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
