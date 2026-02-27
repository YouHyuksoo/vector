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
import { useI18n } from '@/contexts/I18nContext';
import { Sec, F, SF, TF, Tip } from '@/app/dashboard/receiver/components/FormFields';
import { AgentFileOptions } from './AgentFileOptions';
import { AgentTransportOptions } from './AgentTransportOptions';

interface Props {
  content: string;
  onChange: (content: string) => void;
  description?: string;
  onDescriptionChange?: (desc: string) => void;
}

const IC = 'text-accent';

/* ── TOML 파싱 헬퍼 ─────────────────────────────── */

/** VRL source 블록의 .key = "value" 추출 */
const getMeta = (c: string, k: string) =>
  c.match(new RegExp(`\\.${k}\\s*=\\s*"([^"]*)"`))  ?.[1] ?? '';

/** VRL source 블록의 .key = "value" 교체 */
const setMeta = (c: string, k: string, v: string) =>
  c.replace(new RegExp(`(\\.${k}\\s*=\\s*")([^"]*)(")`, 'm'), `$1${v}$3`);

/** 유일한 TOML 키의 값 추출 (address 제외 — 중복 키) */
export const getVal = (c: string, k: string) =>
  c.match(new RegExp(`^${k}\\s*=\\s*"?([^"\\n]*)"?`, 'm'))?.[1]?.trim() ?? '';

/** 유일한 TOML 키의 값 교체 */
export const setVal = (c: string, k: string, v: string, q = true) =>
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

/** multiline 섹션 존재 여부 (파일 통째 전송 모드) */
const hasMultiline = (c: string): boolean =>
  /\[sources\.work_logs\.multiline\]/.test(c);

/** multiline 섹션 추가 (파일 통째 전송) */
const addMultiline = (c: string): string => {
  if (hasMultiline(c)) return c;
  const ml = `\n# ── 파일 전체를 하나의 이벤트로 묶기 ──\n[sources.work_logs.multiline]\nstart_pattern = "^"\ncondition_pattern = "^$$NEVER_MATCH"\nmode = "halt_before"\ntimeout_ms = 1000\n`;
  return c.replace(/(\[transforms\.add_metadata\])/, ml + '\n$1');
};

/** multiline 섹션 제거 (줄 단위 전송) */
const removeMultiline = (c: string): string =>
  c.replace(/\n?#[^\n]*파일 전체[^\n]*\n\[sources\.work_logs\.multiline\][\s\S]*?timeout_ms\s*=\s*\d+\n?/, '\n');

/** include 경로에 ** 패턴이 포함되어 있는지 */
const hasRecursive = (paths: string): boolean =>
  paths.split('\n').some(p => /\*\*/.test(p));

/** 하위폴더 포함 토글: *.ext ↔ **\*.ext */
const toggleRecursive = (paths: string, on: boolean): string =>
  paths.split('\n').filter(Boolean).map(p => {
    const trimmed = p.trim();
    if (on) {
      // C:\logs\*.csv → C:\logs\**\*.csv (이미 ** 있으면 스킵)
      if (/\*\*/.test(trimmed)) return trimmed;
      return trimmed.replace(/([/\\])(\*\.[^/\\]+)$/, '$1**$1$2');
    }
    // C:\logs\**\*.csv → C:\logs\*.csv
    return trimmed.replace(/([/\\])\*\*[/\\](\*\.)/, '$1$2');
  }).join('\n');

/* ── 메인 컴포넌트 ──────────────────────────────── */

export function AgentConfigForm({ content, onChange, description = '', onDescriptionChange }: Props) {
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
    <div className="flex flex-col gap-2">
      {/* 설비 정보 + 연결/타이밍 — 나란히 배치 */}
      <div className="grid grid-cols-2 gap-2">
        <Sec icon="precision_manufacturing" title={t('sender.form.equipment')} iconColor={IC}>
          <div className="grid grid-cols-2 gap-2">
            <F label={t('sender.form.equipType')} value={f.equipType}
              onChange={v => u(c => setMeta(c, 'equipment_type', v))}
              tooltip={t('sender.form.tooltip.equipType')} />
            <F label={t('sender.form.logType')} value={f.logType}
              onChange={v => u(c => setMeta(c, 'log_type', v))}
              tooltip={t('sender.form.tooltip.logType')} />
            <F label={t('sender.form.lineCode')} value={f.lineCode}
              onChange={v => u(c => setMeta(c, 'line_code', v))}
              tooltip={t('sender.form.tooltip.lineCode')} />
            <F label={t('sender.form.equipId')} value={f.equipId}
              onChange={v => u(c => setMeta(c, 'equipment_id', v))}
              tooltip={t('sender.form.tooltip.equipId')} />
          </div>
          {onDescriptionChange && (
            <div className="mt-2">
              <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">{t('sender.descLabel')}</label>
              <input value={description}
                onChange={e => onDescriptionChange(e.target.value)}
                placeholder={t('sender.descPlaceholder')}
                className="w-full px-2 py-1 text-xs border rounded-lg
                  bg-white dark:bg-slate-800 border-border dark:border-border-dark
                  text-text dark:text-white placeholder:text-muted-foreground/50
                  focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary" />
            </div>
          )}
        </Sec>

        <Sec icon="dns" title={t('sender.form.connection')} iconColor={IC}>
          <div className="grid grid-cols-3 gap-2">
            <F label={t('sender.form.serverIp')} value={f.sinkIp}
              onChange={v => u(c => setSinkAddr(c, v, f.sinkPort))}
              tooltip={t('sender.form.tooltip.serverIp')} />
            <F label={t('sender.form.serverPort')} value={f.sinkPort}
              onChange={v => u(c => setSinkAddr(c, f.sinkIp, v))}
              tooltip={t('sender.form.tooltip.serverPort')} />
            <SF label={t('sender.form.readFrom')} value={f.readFrom}
              onChange={v => u(c => setVal(c, 'read_from', v))}
              options={[
                { value: 'beginning', label: 'beginning' },
                { value: 'end', label: 'end' },
              ]}
              tooltip={t('sender.form.tooltip.readFrom')} />
            <F label={t('sender.form.ignoreOlder')} value={f.ignoreOlder} type="number" suffix="s"
              onChange={v => u(c => setVal(c, 'ignore_older_secs', v, false))}
              tooltip={t('sender.form.tooltip.ignoreOlder')} />
            <F label={t('sender.form.timeout')} value={f.timeoutMs} type="number" suffix="ms"
              onChange={v => u(c => setVal(c, 'timeout_ms', v, false))}
              tooltip={t('sender.form.tooltip.timeout')} />
            <F label={t('sender.form.bufferSize')}
              value={String(Math.round(Number(f.maxSize) / 1048576))} type="number" suffix="MB"
              onChange={v => u(c => setVal(c, 'max_size', String(Number(v) * 1048576), false))}
              tooltip={t('sender.form.tooltip.bufferSize')} />
          </div>
        </Sec>
      </div>

      {/* 로그 경로 */}
      <Sec icon="folder_open" title={t('sender.form.logPaths')} iconColor={IC}>
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <textarea value={f.logPaths} rows={2}
              onChange={e => u(c => setInclude(c, e.target.value))}
              placeholder={'C:\\logs\\*.csv'}
              className="w-full px-2.5 py-1.5 text-xs font-mono border rounded-lg resize-y
                bg-white dark:bg-slate-800 border-border" />
            <div className="absolute right-2 top-2">
              <Tip text={t('sender.form.tooltip.logPaths')} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasMultiline(content)}
                onChange={e => u(c => e.target.checked ? addMultiline(c) : removeMultiline(c))}
                className="w-3.5 h-3.5 rounded border-border accent-primary"
              />
              <span className="text-[11px] text-muted-foreground">
                {t('sender.form.wholeFile')}
              </span>
              <Tip text={t('sender.form.tooltip.wholeFile')} />
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasRecursive(f.logPaths)}
                onChange={e => {
                  const toggled = toggleRecursive(f.logPaths, e.target.checked);
                  u(c => setInclude(c, toggled));
                }}
                className="w-3.5 h-3.5 rounded border-border accent-primary"
              />
              <span className="text-[11px] text-muted-foreground">
                {t('sender.form.recursive')}
              </span>
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                {hasRecursive(f.logPaths) ? '**/*.ext' : '*.ext'}
              </span>
            </label>
          </div>
        </div>
      </Sec>

      {/* 파일 감지 + 전송 버퍼 옵션 — 파일감지 넓게 배치 */}
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <AgentFileOptions content={content} onChange={onChange} />
        <AgentTransportOptions content={content} onChange={onChange} />
      </div>
    </div>
  );
}
