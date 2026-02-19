/**
 * @file src/app/dashboard/sender/components/AgentConfigForm.tsx
 * @description Agent TOML의 주요 설정값을 폼으로 편집하는 컴포넌트
 *
 * 초보자 가이드:
 * 1. TOML 문자열에서 정규식으로 설정값을 추출하여 폼 필드로 표시
 * 2. 폼 필드 변경 시 정규식으로 TOML 문자열 내 해당 값을 교체
 * 3. 부모 컴포넌트에서 전체 TOML 문자열을 관리하고 저장 처리
 */
'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

/* ── TOML 파싱 헬퍼 ─────────────────────────────── */

/** VRL source 블록의 .key = "value" 추출 */
const getMeta = (c: string, k: string) =>
  c.match(new RegExp(`\\.${k}\\s*=\\s*"([^"]*)"`))  ?.[1] ?? '';

/** VRL source 블록의 .key = "value" 교체 */
const setMeta = (c: string, k: string, v: string) =>
  c.replace(new RegExp(`(\\.${k}\\s*=\\s*")([^"]*)(")`, 'm'), `$1${v}$3`);

/** 유일한 TOML 키의 값 추출 (address 제외 — 중복 키) */
const getVal = (c: string, k: string) =>
  c.match(new RegExp(`^${k}\\s*=\\s*"?([^"\\n]*)"?`, 'm'))?.[1]?.trim() ?? '';

/** 유일한 TOML 키의 값 교체 */
const setVal = (c: string, k: string, v: string, q = true) =>
  c.replace(new RegExp(`(^${k}\\s*=\\s*)"?[^"\\n]*"?`, 'm'), `$1${q ? `"${v}"` : v}`);

/** [sinks.to_aggregator] 섹션의 address → [ip, port] */
const getSinkAddr = (c: string): [string, string] => {
  const m = c.match(/\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*"([^:]+):(\d+)"/);
  return m ? [m[1], m[2]] : ['', ''];
};

/** [sinks.to_aggregator] 섹션의 address 교체 */
const setSinkAddr = (c: string, ip: string, port: string) =>
  c.replace(
    /(\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*")[^"]*(")/,
    `$1${ip}:${port}$2`,
  );

/** include 배열 추출 (TOML \\ → 단일 \) */
const getInclude = (c: string) => {
  const m = c.match(/include\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return '';
  return m[1].split('\n').map(l => l.replace(/[",]/g, '').trim())
    .filter(Boolean).map(p => p.replace(/\\\\/g, '\\')).join('\n');
};

/** include 배열 교체 (단일 \ → TOML \\) */
const setInclude = (c: string, paths: string) => {
  const lines = paths.split('\n').filter(Boolean)
    .map(p => `  "${p.trim().replace(/\\/g, '\\\\')}",`).join('\n');
  return c.replace(/include\s*=\s*\[[\s\S]*?\]/, `include = [\n${lines}\n]`);
};

/* ── 메인 컴포넌트 ──────────────────────────────── */

export function AgentConfigForm({ content, onChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => {
    const [sinkIp, sinkPort] = getSinkAddr(content);
    return {
      equipType: getMeta(content, 'equipment_type'),
      logType: getMeta(content, 'log_type'),
      lineCode: getMeta(content, 'line_code'),
      equipId: getMeta(content, 'equipment_id'),
      sinkIp, sinkPort,
      logPaths: getInclude(content),
      readFrom: getVal(content, 'read_from'),
      ignoreOlder: getVal(content, 'ignore_older_secs'),
      timeoutMs: getVal(content, 'timeout_ms'),
      maxSize: getVal(content, 'max_size'),
    };
  }, [content]);

  const u = (fn: (c: string) => string) => onChange(fn(content));

  return (
    <div className="flex flex-col gap-2.5">
      {/* 설비 정보 — 한 줄 4칸 */}
      <Sec icon="precision_manufacturing" title={t('sender.form.equipment')}>
        <div className="grid grid-cols-4 gap-2">
          <F label={t('sender.form.equipType')} value={f.equipType}
            onChange={v => u(c => setMeta(c, 'equipment_type', v))} />
          <F label={t('sender.form.logType')} value={f.logType}
            onChange={v => u(c => setMeta(c, 'log_type', v))} />
          <F label={t('sender.form.lineCode')} value={f.lineCode}
            onChange={v => u(c => setMeta(c, 'line_code', v))} />
          <F label={t('sender.form.equipId')} value={f.equipId}
            onChange={v => u(c => setMeta(c, 'equipment_id', v))} />
        </div>
      </Sec>

      {/* 연결 + 타이밍 — 한 줄로 합침 */}
      <Sec icon="dns" title={t('sender.form.connection')}>
        <div className="grid grid-cols-[1fr_80px_120px_130px_120px_100px] gap-2">
          <F label={t('sender.form.serverIp')} value={f.sinkIp}
            onChange={v => u(c => setSinkAddr(c, v, f.sinkPort))} />
          <F label={t('sender.form.serverPort')} value={f.sinkPort}
            onChange={v => u(c => setSinkAddr(c, f.sinkIp, v))} />
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              {t('sender.form.readFrom')}
            </label>
            <select value={f.readFrom}
              onChange={e => u(c => setVal(c, 'read_from', e.target.value))}
              className="w-full px-2 py-2 text-base border rounded-lg
                bg-white dark:bg-slate-800 border-border">
              <option value="beginning">beginning</option>
              <option value="end">end</option>
            </select>
          </div>
          <F label={t('sender.form.ignoreOlder')} value={f.ignoreOlder} type="number" suffix="s"
            onChange={v => u(c => setVal(c, 'ignore_older_secs', v, false))} />
          <F label={t('sender.form.timeout')} value={f.timeoutMs} type="number" suffix="ms"
            onChange={v => u(c => setVal(c, 'timeout_ms', v, false))} />
          <F label={t('sender.form.bufferSize')}
            value={String(Math.round(Number(f.maxSize) / 1048576))} type="number" suffix="MB"
            onChange={v => u(c => setVal(c, 'max_size', String(Number(v) * 1048576), false))} />
        </div>
      </Sec>

      {/* 로그 경로 */}
      <Sec icon="folder_open" title={t('sender.form.logPaths')}>
        <textarea value={f.logPaths} rows={2}
          onChange={e => u(c => setInclude(c, e.target.value))}
          placeholder={'C:\\logs\\*.csv'}
          className="w-full px-3 py-2 text-base font-mono border rounded-lg resize-y
            bg-white dark:bg-slate-800 border-border" />
      </Sec>
    </div>
  );
}

/* ── 서브 컴포넌트 ──────────────────────────────── */

function Sec({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-surface/50 dark:bg-surface-dark/50 border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name={icon} size="md" className="text-accent" />
        <span className="text-base font-bold text-text dark:text-white">{title}</span>
      </div>
      {children}
    </div>
  );
}

function F({ label, value, onChange, type = 'text', suffix, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; suffix?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-1 block">{label}</label>
      <div className="relative">
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 text-base font-mono border rounded-lg
            bg-white dark:bg-slate-800 border-border ${suffix ? 'pr-12' : ''}`} />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
