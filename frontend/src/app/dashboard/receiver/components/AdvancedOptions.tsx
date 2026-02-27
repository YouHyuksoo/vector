/**
 * @file src/app/dashboard/receiver/components/AdvancedOptions.tsx
 * @description 전송/인코딩 옵션 + 버퍼/안전 옵션 섹션
 *
 * 초보자 가이드:
 * 1. TOML의 sinks 섹션에서 encoding, method, compression 등을 추출
 * 2. 폼 UI로 변경하면 정규식으로 TOML 내 해당 값을 교체
 * 3. 존재하지 않는 옵션(compression 등)은 새 줄로 삽입
 */
'use client';

import { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Sec, SF, TF } from './FormFields';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

/* ── TOML 파싱 헬퍼: 전송/인코딩 ─────────────────── */

/** [sinks.to_api.encoding] codec */
const getApiCodec = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.encoding\]\s*\n[^[]*?codec\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'json';
};
const setApiCodec = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.encoding\]\s*\n[^[]*?codec\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.raw_file.encoding] codec */
const getFileCodec = (c: string) => {
  const m = c.match(/\[sinks\.raw_file\.encoding\]\s*\n[^[]*?codec\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'text';
};
const setFileCodec = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.raw_file\.encoding\]\s*\n[^[]*?codec\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.to_api] method */
const getHttpMethod = (c: string) => {
  const m = c.match(/\[sinks\.to_api\]\s*\n[^[]*?method\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'post';
};
const setHttpMethod = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\]\s*\n[^[]*?method\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.to_api] compression (없으면 'none') */
const getCompression = (c: string) => {
  const m = c.match(/\[sinks\.to_api\]\s*\n[^[]*?compression\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'none';
};
const setCompression = (c: string, v: string) => {
  const hasKey = /\[sinks\.to_api\]\s*\n[^[]*?compression\s*=/.test(c);
  if (v === 'none') {
    return hasKey ? c.replace(/\ncompression\s*=\s*"[^"]*"/, '') : c;
  }
  if (hasKey) {
    return c.replace(
      /(\[sinks\.to_api\]\s*\n[^[]*?compression\s*=\s*")[^"]*(")/,
      `$1${v}$2`,
    );
  }
  return c.replace(
    /(\[sinks\.to_api\]\s*\n[^[]*?method\s*=\s*"[^"]*")/,
    `$1\ncompression = "${v}"`,
  );
};

/* ── TOML 파싱 헬퍼: 버퍼/안전 ───────────────────── */

/** [sinks.to_api.buffer] type */
const getApiBufType = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.buffer\]\s*\n[^[]*?type\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'disk';
};
const setApiBufType = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.buffer\]\s*\n[^[]*?type\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.to_api.buffer] when_full */
const getApiBufPolicy = (c: string) => {
  const m = c.match(/\[sinks\.to_api\.buffer\]\s*\n[^[]*?when_full\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'block';
};
const setApiBufPolicy = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_api\.buffer\]\s*\n[^[]*?when_full\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.raw_file.buffer] type */
const getFileBufType = (c: string) => {
  const m = c.match(/\[sinks\.raw_file\.buffer\]\s*\n[^[]*?type\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'disk';
};
const setFileBufType = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.raw_file\.buffer\]\s*\n[^[]*?type\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.raw_file.buffer] when_full */
const getFileBufPolicy = (c: string) => {
  const m = c.match(/\[sinks\.raw_file\.buffer\]\s*\n[^[]*?when_full\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'block';
};
const setFileBufPolicy = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.raw_file\.buffer\]\s*\n[^[]*?when_full\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** healthcheck (sinks.to_api 하위) */
const getHealthcheck = (c: string): boolean => {
  const m = c.match(/\[sinks\.to_api\.healthcheck\]\s*\n[^[]*?enabled\s*=\s*(true|false)/);
  return m ? m[1] === 'true' : false;
};
const setHealthcheck = (c: string, v: boolean) => {
  const hasSection = /\[sinks\.to_api\.healthcheck\]/.test(c);
  if (hasSection) {
    return c.replace(
      /(\[sinks\.to_api\.healthcheck\]\s*\n[^[]*?enabled\s*=\s*)(true|false)/,
      `$1${v}`,
    );
  }
  return c.replace(
    /(\[sinks\.to_api\.request\])/,
    `[sinks.to_api.healthcheck]\nenabled = ${v}\n\n$1`,
  );
};

/** acknowledgements (sinks.to_api 하위) */
const getAcknowledgements = (c: string): boolean => {
  const m = c.match(/\[sinks\.to_api\]\s*\n[^[]*?acknowledgements\s*=\s*(true|false)/);
  return m ? m[1] === 'true' : false;
};
const setAcknowledgements = (c: string, v: boolean) => {
  const hasKey = /\[sinks\.to_api\]\s*\n[^[]*?acknowledgements\s*=/.test(c);
  if (hasKey) {
    return c.replace(
      /(\[sinks\.to_api\]\s*\n[^[]*?acknowledgements\s*=\s*)(true|false)/,
      `$1${v}`,
    );
  }
  return c.replace(
    /(\[sinks\.to_api\]\s*\n[^[]*?method\s*=\s*"[^"]*")/,
    `$1\nacknowledgements = ${v}`,
  );
};

/* ── 전송/인코딩 옵션 컴포넌트 ───────────────────── */

export function TransportOptions({ content, onChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => ({
    apiCodec: getApiCodec(content),
    fileCodec: getFileCodec(content),
    httpMethod: getHttpMethod(content),
    compression: getCompression(content),
  }), [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  return (
    <Sec icon="swap_horiz" title={t('receiver.form.transport')}>
      <div className="grid grid-cols-4 gap-2">
        <SF label={t('receiver.form.apiCodec')} value={f.apiCodec}
          onChange={v => u(c => setApiCodec(c, v))}
          options={[
            { value: 'json', label: 'JSON' },
            { value: 'text', label: 'Text' },
            { value: 'ndjson', label: 'NDJSON' },
          ]}
          tooltip={t('receiver.form.tooltip.apiCodec')} />
        <SF label={t('receiver.form.fileCodec')} value={f.fileCodec}
          onChange={v => u(c => setFileCodec(c, v))}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'json', label: 'JSON' },
            { value: 'ndjson', label: 'NDJSON' },
            { value: 'csv', label: 'CSV' },
          ]}
          tooltip={t('receiver.form.tooltip.fileCodec')} />
        <SF label={t('receiver.form.httpMethod')} value={f.httpMethod}
          onChange={v => u(c => setHttpMethod(c, v))}
          options={[
            { value: 'post', label: 'POST' },
            { value: 'put', label: 'PUT' },
          ]}
          tooltip={t('receiver.form.tooltip.httpMethod')} />
        <SF label={t('receiver.form.compression')} value={f.compression}
          onChange={v => u(c => setCompression(c, v))}
          options={[
            { value: 'none', label: t('receiver.form.compressionNone') },
            { value: 'gzip', label: 'gzip' },
            { value: 'zlib', label: 'zlib' },
            { value: 'snappy', label: 'snappy' },
            { value: 'zstd', label: 'zstd' },
          ]}
          tooltip={t('receiver.form.tooltip.compression')} />
      </div>
    </Sec>
  );
}

/* ── 버퍼/안전 옵션 컴포넌트 ──────────────────────── */

export function BufferSafetyOptions({ content, onChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => ({
    apiBufType: getApiBufType(content),
    apiBufPolicy: getApiBufPolicy(content),
    fileBufType: getFileBufType(content),
    fileBufPolicy: getFileBufPolicy(content),
    healthcheck: getHealthcheck(content),
    acknowledgements: getAcknowledgements(content),
  }), [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  const bufTypeOpts = [
    { value: 'disk', label: t('receiver.form.bufTypeDisk') },
    { value: 'memory', label: t('receiver.form.bufTypeMemory') },
  ];
  const bufPolicyOpts = [
    { value: 'block', label: t('receiver.form.bufPolicyBlock') },
    { value: 'drop_newest', label: t('receiver.form.bufPolicyDrop') },
  ];

  return (
    <Sec icon="shield" title={t('receiver.form.bufferSafety')}>
      <div className="grid grid-cols-4 gap-2">
        <SF label={t('receiver.form.apiBufType')} value={f.apiBufType}
          onChange={v => u(c => setApiBufType(c, v))} options={bufTypeOpts}
          tooltip={t('receiver.form.tooltip.apiBufType')} />
        <SF label={t('receiver.form.apiBufPolicy')} value={f.apiBufPolicy}
          onChange={v => u(c => setApiBufPolicy(c, v))} options={bufPolicyOpts}
          tooltip={t('receiver.form.tooltip.apiBufPolicy')} />
        <SF label={t('receiver.form.fileBufType')} value={f.fileBufType}
          onChange={v => u(c => setFileBufType(c, v))} options={bufTypeOpts}
          tooltip={t('receiver.form.tooltip.fileBufType')} />
        <SF label={t('receiver.form.fileBufPolicy')} value={f.fileBufPolicy}
          onChange={v => u(c => setFileBufPolicy(c, v))} options={bufPolicyOpts}
          tooltip={t('receiver.form.tooltip.fileBufPolicy')} />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <TF label={t('receiver.form.healthcheck')} checked={f.healthcheck}
          onChange={v => u(c => setHealthcheck(c, v))}
          tooltip={t('receiver.form.tooltip.healthcheck')} />
        <TF label={t('receiver.form.acknowledgements')} checked={f.acknowledgements}
          onChange={v => u(c => setAcknowledgements(c, v))}
          tooltip={t('receiver.form.tooltip.acknowledgements')} />
      </div>
    </Sec>
  );
}
