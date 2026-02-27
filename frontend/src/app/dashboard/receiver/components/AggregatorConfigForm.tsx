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
import { useI18n } from '@/contexts/I18nContext';
import { Sec, F } from './FormFields';
import { VrlParsingOptions } from './VrlParsingOptions';
import { TransportOptions, BufferSafetyOptions } from './AdvancedOptions';

export { Sec, F, SF, TF, Tip } from './FormFields';


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

/** TOML 내 모든 HTTP sink의 uri에서 포트를 일괄 교체 (to_api, to_file_notify 등) */
export const syncApiPort = (c: string, port: number | string): string =>
  c.replace(
    /(uri\s*=\s*"http:\/\/127\.0\.0\.1:)\d+(\/api\/)/g,
    `$1${port}$2`,
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
      batchMaxEvents: getBatchMaxEvents(content),
      batchTimeout: getBatchTimeout(content),
      apiBufSize: getApiBufSize(content),
      retryInitial: getRetryInitial(content),
      retryMax: getRetryMax(content),
    };
  }, [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  return (
    <div className="flex flex-col gap-2">
      {/* API 전송 + 기본 설정 — 나란히 배치 */}
      <div className="grid grid-cols-2 gap-2">
        <Sec icon="send" title={t('receiver.form.apiSink')} hint={t('receiver.form.apiUriAuto')}>
          <div className="grid grid-cols-3 gap-2">
            <F label={t('receiver.form.batchMax')} value={f.batchMaxEvents} type="number" suffix={t('receiver.form.batchMaxUnit')}
              onChange={v => u(c => setBatchMaxEvents(c, v))}
              tooltip={t('receiver.form.tooltip.batchMax')} />
            <F label={t('receiver.form.batchTimeout')} value={f.batchTimeout} type="number" suffix="s"
              onChange={v => u(c => setBatchTimeout(c, v))}
              tooltip={t('receiver.form.tooltip.batchTimeout')} />
            <F label={t('receiver.form.apiBufSize')}
              value={String(Math.round(Number(f.apiBufSize) / 1048576))} type="number" suffix="MB"
              onChange={v => u(c => setApiBufSize(c, String(Number(v) * 1048576)))}
              tooltip={t('receiver.form.tooltip.apiBufSize')} />
            <F label={t('receiver.form.retryInitial')} value={f.retryInitial} type="number" suffix="s"
              onChange={v => u(c => setRetryInitial(c, v))}
              tooltip={t('receiver.form.tooltip.retryInitial')} />
            <F label={t('receiver.form.retryMax')} value={f.retryMax} type="number" suffix="s"
              onChange={v => u(c => setRetryMax(c, v))}
              tooltip={t('receiver.form.tooltip.retryMax')} />
          </div>
        </Sec>

        <Sec icon="settings" title={t('receiver.form.basic')}>
          <div className="flex flex-col gap-2">
            <F label={t('receiver.form.dataDir')} value={f.dataDir}
              onChange={v => u(c => setDataDir(c, v))}
              tooltip={t('receiver.form.tooltip.dataDir')}
              placeholder="C:\Project\vector\vector-data" mono />
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <F label={t('receiver.form.apiIp')} value={f.apiIp}
                onChange={v => u(c => setApiAddr(c, v, f.apiPort))}
                tooltip={t('receiver.form.tooltip.apiIp')} />
              <F label={t('receiver.form.apiPort')} value={f.apiPort} type="number"
                onChange={v => u(c => setApiAddr(c, f.apiIp, v))}
                tooltip={t('receiver.form.tooltip.apiPort')} />
            </div>
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <F label={t('receiver.form.listenIp')} value={f.srcIp}
                onChange={v => u(c => setSourceAddr(c, v, f.srcPort))}
                tooltip={t('receiver.form.tooltip.listenIp')} />
              <F label={t('receiver.form.listenPort')} value={f.srcPort} type="number"
                onChange={v => u(c => setSourceAddr(c, f.srcIp, v))}
                tooltip={t('receiver.form.tooltip.listenPort')} />
            </div>
          </div>
        </Sec>
      </div>

      {/* 파일 저장 + VRL 파싱 옵션 — 나란히 배치 */}
      <div className="grid grid-cols-2 gap-2">
        <Sec icon="folder_open" title={t('receiver.form.rawFile')}>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <F label={t('receiver.form.rawPath')} value={f.rawPath}
              onChange={v => u(c => setRawPath(c, v))}
              tooltip={t('receiver.form.tooltip.rawPath')}
              placeholder="{{ equipment_type }}\{{ equipment_id }}\..." mono />
            <F label={t('receiver.form.rawBufSize')}
              value={String(Math.round(Number(f.rawBufSize) / 1048576))} type="number" suffix="MB"
              onChange={v => u(c => setRawBufSize(c, String(Number(v) * 1048576)))}
              tooltip={t('receiver.form.tooltip.rawBufSize')} />
          </div>
        </Sec>
        <VrlParsingOptions content={content} onChange={onChange} />
      </div>

      {/* 전송/인코딩 옵션 (신규) */}
      <TransportOptions content={content} onChange={onChange} />

      {/* 버퍼/안전 옵션 (신규) */}
      <BufferSafetyOptions content={content} onChange={onChange} />

    </div>
  );
}

