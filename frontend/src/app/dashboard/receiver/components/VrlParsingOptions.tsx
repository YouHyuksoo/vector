/**
 * @file src/app/dashboard/receiver/components/VrlParsingOptions.tsx
 * @description VRL 파싱 옵션 (target_type, target_table, 타임스탬프)
 *
 * 초보자 가이드:
 * 1. TOML 내 VRL source 코드에서 target_type, target_table, timestamp 값 추출
 * 2. 폼 UI로 변경하면 TOML의 VRL source 내 해당 값을 정규식으로 교체
 */
'use client';

import { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Sec, F, SF } from './FormFields';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

/* ── TOML VRL source 내 값 추출/교체 ─────────────── */

/** .target_type = "TABLE" 또는 "PROCEDURE" */
const getTargetType = (c: string): string => {
  const m = c.match(/\.target_type\s*=\s*"([^"]*)"/);
  return m ? m[1] : 'TABLE';
};

const setTargetType = (c: string, v: string) =>
  c.replace(
    /(\.target_type\s*=\s*")[^"]*(")/,
    `$1${v}$2`,
  );

/** .target_table = "LOG_" + to_string!(.log_type) 또는 커스텀 값 */
const getTargetTable = (c: string): string => {
  const m = c.match(/\.target_table\s*=\s*"([^"]+)"/);
  return m ? m[1] : '';
};

const isDefaultTablePattern = (c: string): boolean => {
  return /\.target_table\s*=\s*"LOG_"\s*\+\s*to_string!\(\.log_type\)/.test(c);
};

const setTargetTable = (c: string, v: string) => {
  if (!v || v === 'LOG_{log_type}') {
    return c.replace(
      /\.target_table\s*=\s*.+/,
      '.target_table = "LOG_" + to_string!(.log_type)',
    );
  }
  return c.replace(
    /\.target_table\s*=\s*.+/,
    `.target_table = "${v}"`,
  );
};

/** .timestamp = now() 또는 커스텀 */
const getTimestampMode = (c: string): string => {
  const m = c.match(/\.timestamp\s*=\s*(\S+)/);
  return m && m[1] === 'now()' ? 'now' : 'field';
};

const setTimestampMode = (c: string, v: string) =>
  c.replace(
    /(\.timestamp\s*=\s*)\S+/,
    `$1${v === 'now' ? 'now()' : '.timestamp'}`,
  );

/* ── 컴포넌트 ──────────────────────────────────── */

export function VrlParsingOptions({ content, onChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => ({
    targetType: getTargetType(content),
    targetTable: getTargetTable(content),
    isDefaultTable: isDefaultTablePattern(content),
    timestampMode: getTimestampMode(content),
  }), [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  return (
    <Sec icon="data_object" title={t('receiver.form.vrlOptions')}>
      <div className="grid grid-cols-3 gap-2">
        <SF
          label={t('receiver.form.targetType')}
          value={f.targetType}
          onChange={v => u(c => setTargetType(c, v))}
          options={[
            { value: 'TABLE', label: t('receiver.form.targetTypeTable') },
            { value: 'PROCEDURE', label: t('receiver.form.targetTypeProcedure') },
          ]}
          tooltip={t('receiver.form.tooltip.targetType')}
        />
        <F
          label={t('receiver.form.targetTable')}
          value={f.isDefaultTable ? '' : f.targetTable}
          onChange={v => u(c => setTargetTable(c, v))}
          placeholder={t('receiver.form.targetTablePlaceholder')}
          tooltip={t('receiver.form.tooltip.targetTable')}
        />
        <SF
          label={t('receiver.form.timestampMode')}
          value={f.timestampMode}
          onChange={v => u(c => setTimestampMode(c, v))}
          options={[
            { value: 'now', label: t('receiver.form.timestampNow') },
            { value: 'field', label: t('receiver.form.timestampField') },
          ]}
          tooltip={t('receiver.form.tooltip.timestampMode')}
        />
      </div>
    </Sec>
  );
}
