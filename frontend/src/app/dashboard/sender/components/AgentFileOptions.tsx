/**
 * @file src/app/dashboard/sender/components/AgentFileOptions.tsx
 * @description Agent 파일 감지 옵션 섹션 (fingerprint, multiline, data_dir, API)
 *
 * 초보자 가이드:
 * 1. fingerprint: 파일 중복 감지 전략 (checksum 또는 device_and_inode)
 * 2. multiline: 여러 줄을 하나의 이벤트로 묶는 설정
 * 3. data_dir: Vector 내부 데이터 저장 경로
 * 4. API: Vector 자체 상태 API (헬스체크용)
 */
'use client';

import { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Sec, F, SF } from '@/app/dashboard/receiver/components/FormFields';
import { getVal, setVal } from './AgentConfigForm';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

const IC = 'text-accent';

/* ── TOML 파싱 헬퍼 ─────────────────────────────── */

/** data_dir 추출 */
const getDataDir = (c: string) => {
  const m = c.match(/^data_dir\s*=\s*"([^"]*)"/m);
  return m ? m[1].replace(/\\\\/g, '\\') : '';
};
const setDataDir = (c: string, v: string) =>
  c.replace(/(^data_dir\s*=\s*")[^"]*(")/m, `$1${v.replace(/\\/g, '\\\\')}$2`);

/** [api] address → [ip, port] */
const getApiAddr = (c: string): [string, string] => {
  const m = c.match(/\[api\]\s*\n[^[]*?address\s*=\s*"([^:]+):(\d+)"/);
  return m ? [m[1], m[2]] : ['127.0.0.1', '8686'];
};
const setApiAddr = (c: string, ip: string, port: string) =>
  c.replace(/(\[api\]\s*\n[^[]*?address\s*=\s*")[^"]*(")/,`$1${ip}:${port}$2`);

/** fingerprint.strategy */
const getFpStrategy = (c: string) => {
  const m = c.match(/fingerprint\.strategy\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'checksum';
};
const setFpStrategy = (c: string, v: string) =>
  c.replace(/(fingerprint\.strategy\s*=\s*")[^"]*(")/,`$1${v}$2`);

/** fingerprint.lines */
const getFpLines = (c: string) => {
  const m = c.match(/fingerprint\.lines\s*=\s*(\d+)/);
  return m ? m[1] : '5';
};
const setFpLines = (c: string, v: string) =>
  c.replace(/(fingerprint\.lines\s*=\s*)\d+/, `$1${v}`);

/** multiline.mode */
const getMlMode = (c: string) => {
  const m = c.match(/\[sources\.\w+\.multiline\][\s\S]*?mode\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'halt_before';
};
const setMlMode = (c: string, v: string) =>
  c.replace(
    /(\[sources\.\w+\.multiline\][\s\S]*?mode\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** multiline.start_pattern */
const getMlStart = (c: string) => {
  const m = c.match(/\[sources\.\w+\.multiline\][\s\S]*?start_pattern\s*=\s*"([^"]*)"/);
  return m ? m[1] : '^';
};
const setMlStart = (c: string, v: string) =>
  c.replace(
    /(\[sources\.\w+\.multiline\][\s\S]*?start_pattern\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** multiline.condition_pattern */
const getMlCond = (c: string) => {
  const m = c.match(/\[sources\.\w+\.multiline\][\s\S]*?condition_pattern\s*=\s*"([^"]*)"/);
  return m ? m[1] : '';
};
const setMlCond = (c: string, v: string) =>
  c.replace(
    /(\[sources\.\w+\.multiline\][\s\S]*?condition_pattern\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/* ── 컴포넌트 ──────────────────────────────────── */

export function AgentFileOptions({ content, onChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => {
    const [apiIp, apiPort] = getApiAddr(content);
    return {
      dataDir: getDataDir(content),
      apiIp, apiPort,
      fpStrategy: getFpStrategy(content),
      fpLines: getFpLines(content),
      mlMode: getMlMode(content),
      mlStart: getMlStart(content),
      mlCond: getMlCond(content),
    };
  }, [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  return (
    <Sec icon="manage_search" title={t('sender.form.fileDetection')} iconColor={IC}>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_70px] gap-2">
          <F label={t('sender.form.dataDir')} value={f.dataDir}
            onChange={v => u(c => setDataDir(c, v))} mono
            tooltip={t('sender.form.tooltip.dataDir')} />
          <F label={t('sender.form.apiPort')} value={f.apiPort} type="number"
            onChange={v => u(c => setApiAddr(c, f.apiIp, v))}
            tooltip={t('sender.form.tooltip.apiPort')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SF label={t('sender.form.fpStrategy')} value={f.fpStrategy}
            onChange={v => u(c => setFpStrategy(c, v))}
            options={[
              { value: 'checksum', label: 'Checksum' },
              { value: 'device_and_inode', label: 'Device+Inode' },
            ]}
            tooltip={t('sender.form.tooltip.fpStrategy')} />
          <F label={t('sender.form.fpLines')} value={f.fpLines} type="number"
            onChange={v => u(c => setFpLines(c, v))} suffix={t('sender.form.fpLinesUnit')}
            tooltip={t('sender.form.tooltip.fpLines')} />
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
          <SF label={t('sender.form.mlMode')} value={f.mlMode}
            onChange={v => u(c => setMlMode(c, v))}
            options={[
              { value: 'halt_before', label: 'halt_before' },
              { value: 'halt_with', label: 'halt_with' },
              { value: 'continue_through', label: 'continue_through' },
              { value: 'continue_past', label: 'continue_past' },
            ]}
            tooltip={t('sender.form.tooltip.mlMode')} />
          <F label={t('sender.form.mlStart')} value={f.mlStart} mono
            onChange={v => u(c => setMlStart(c, v))}
            tooltip={t('sender.form.tooltip.mlStart')} />
          <F label={t('sender.form.mlCond')} value={f.mlCond} mono
            onChange={v => u(c => setMlCond(c, v))}
            tooltip={t('sender.form.tooltip.mlCond')} />
        </div>
      </div>
    </Sec>
  );
}
