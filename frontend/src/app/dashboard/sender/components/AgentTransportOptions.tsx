/**
 * @file src/app/dashboard/sender/components/AgentTransportOptions.tsx
 * @description Agent 전송 버퍼/압축 옵션 섹션
 *
 * 초보자 가이드:
 * 1. buffer.type: 디스크 버퍼(안전) 또는 메모리 버퍼(빠름)
 * 2. buffer.when_full: 버퍼 가득 시 대기(block) 또는 최신 삭제(drop)
 * 3. compression: Aggregator 전송 시 데이터 압축 방식
 * 4. acknowledgements: 전송 확인 활성화 여부
 */
'use client';

import { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Sec, SF, TF } from '@/app/dashboard/receiver/components/FormFields';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

const IC = 'text-accent';

/* ── TOML 파싱 헬퍼 ─────────────────────────────── */

/** [sinks.to_aggregator.buffer] type */
const getBufType = (c: string) => {
  const m = c.match(/\[sinks\.to_aggregator\.buffer\]\s*\n[^[]*?type\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'disk';
};
const setBufType = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_aggregator\.buffer\]\s*\n[^[]*?type\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.to_aggregator.buffer] when_full */
const getBufPolicy = (c: string) => {
  const m = c.match(/\[sinks\.to_aggregator\.buffer\]\s*\n[^[]*?when_full\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'block';
};
const setBufPolicy = (c: string, v: string) =>
  c.replace(
    /(\[sinks\.to_aggregator\.buffer\]\s*\n[^[]*?when_full\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** [sinks.to_aggregator] compression (없으면 'none') */
const getCompression = (c: string) => {
  const m = c.match(/\[sinks\.to_aggregator\]\s*\n[^[]*?compression\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'none';
};
const setCompression = (c: string, v: string) => {
  const hasKey = /\[sinks\.to_aggregator\]\s*\n[^[]*?compression\s*=/.test(c);
  if (v === 'none') {
    return hasKey ? c.replace(/\ncompression\s*=\s*"[^"]*"/, '') : c;
  }
  if (hasKey) {
    return c.replace(
      /(\[sinks\.to_aggregator\]\s*\n[^[]*?compression\s*=\s*")[^"]*(")/,
      `$1${v}$2`,
    );
  }
  return c.replace(
    /(\[sinks\.to_aggregator\]\s*\n[^[]*?address\s*=\s*"[^"]*")/,
    `$1\ncompression = "${v}"`,
  );
};

/** [sinks.to_aggregator] acknowledgements (없으면 false) */
const getAck = (c: string): boolean => {
  const m = c.match(/\[sinks\.to_aggregator\]\s*\n[^[]*?acknowledgements\s*=\s*(true|false)/);
  return m ? m[1] === 'true' : false;
};
const setAck = (c: string, v: boolean) => {
  const hasKey = /\[sinks\.to_aggregator\]\s*\n[^[]*?acknowledgements\s*=/.test(c);
  if (hasKey) {
    return c.replace(
      /(\[sinks\.to_aggregator\]\s*\n[^[]*?acknowledgements\s*=\s*)(true|false)/,
      `$1${v}`,
    );
  }
  return c.replace(
    /(\[sinks\.to_aggregator\]\s*\n[^[]*?address\s*=\s*"[^"]*")/,
    `$1\nacknowledgements = ${v}`,
  );
};

/* ── 컴포넌트 ──────────────────────────────────── */

export function AgentTransportOptions({ content, onChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => ({
    bufType: getBufType(content),
    bufPolicy: getBufPolicy(content),
    compression: getCompression(content),
    ack: getAck(content),
  }), [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  return (
    <Sec icon="shield" title={t('sender.form.transportBuffer')} iconColor={IC}>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <SF label={t('sender.form.bufType')} value={f.bufType}
            onChange={v => u(c => setBufType(c, v))}
            options={[
              { value: 'disk', label: t('sender.form.bufTypeDisk') },
              { value: 'memory', label: t('sender.form.bufTypeMemory') },
            ]}
            tooltip={t('sender.form.tooltip.bufType')} />
          <SF label={t('sender.form.bufPolicy')} value={f.bufPolicy}
            onChange={v => u(c => setBufPolicy(c, v))}
            options={[
              { value: 'block', label: t('sender.form.bufPolicyBlock') },
              { value: 'drop_newest', label: t('sender.form.bufPolicyDrop') },
            ]}
            tooltip={t('sender.form.tooltip.bufPolicy')} />
        </div>
        <SF label={t('sender.form.compression')} value={f.compression}
          onChange={v => u(c => setCompression(c, v))}
          options={[
            { value: 'none', label: t('sender.form.compressionNone') },
            { value: 'gzip', label: 'gzip' },
            { value: 'snappy', label: 'snappy' },
            { value: 'zstd', label: 'zstd' },
          ]}
          tooltip={t('sender.form.tooltip.compression')} />
        <TF label={t('sender.form.acknowledgements')} checked={f.ack}
          onChange={v => u(c => setAck(c, v))}
          tooltip={t('sender.form.tooltip.acknowledgements')} />
      </div>
    </Sec>
  );
}
