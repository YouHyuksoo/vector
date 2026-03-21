/**
 * @file src/app/dashboard/sender/components/AgentConfigForm.tsx
 * @description Agent TOML의 주요 설정값을 폼으로 편집하는 컴포넌트
 *
 * 초보자 가이드:
 * 1. TOML 문자열에서 정규식으로 설정값을 추출하여 폼 필드로 표시
 * 2. 폼 필드 변경 시 정규식으로 TOML 문자열 내 해당 값을 교체
 * 3. 하트비트 설정 변경 시 설비 메타데이터 태그도 자동 동기화
 */
'use client';

import { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Sec, F, SF, Tip } from '@/app/dashboard/receiver/components/FormFields';
import { AgentFileOptions } from './AgentFileOptions';
import { AgentTransportOptions } from './AgentTransportOptions';
import {
  getMeta, setMeta, getVal, setVal,
  getSinkAddr, setSinkAddr,
  hasHeartbeat, getHeartbeatInterval, setHeartbeatInterval,
  addHeartbeat, removeHeartbeat, syncHeartbeatTags, getHeartbeatTag,
  getInclude, setInclude,
  hasMultiline, addMultiline, removeMultiline,
  hasRecursive, toggleRecursive,
} from './agent-toml-helpers';

// re-export for other components
export { getVal, setVal };

interface Props {
  content: string;
  onChange: (content: string) => void;
  description?: string;
  onDescriptionChange?: (desc: string) => void;
  encoding?: string;
  onEncodingChange?: (enc: string) => void;
}

const IC = 'text-accent';

export function AgentConfigForm({ content, onChange, description = '', onDescriptionChange, encoding = 'utf-8', onEncodingChange }: Props) {
  const { t } = useI18n();

  const f = useMemo(() => {
    const [sinkIp, sinkPort] = getSinkAddr(content);
    return {
      equipType: getMeta(content, 'equipment_type'),
      logType: getMeta(content, 'log_type'),
      lineCode: getMeta(content, 'line_code'),
      equipId: getMeta(content, 'equipment_id'),
      equipIp: getHeartbeatTag(content, 'ip'),
      sinkIp, sinkPort,
      logPaths: getInclude(content),
      readFrom: getVal(content, 'read_from'),
      ignoreOlder: getVal(content, 'ignore_older_secs'),
      timeoutMs: getVal(content, 'timeout_ms'),
      maxSize: getVal(content, 'max_size'),
      heartbeatOn: hasHeartbeat(content),
      heartbeatInterval: getHeartbeatInterval(content),
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
              onChange={v => u(c => syncHeartbeatTags(setMeta(c, 'equipment_type', v), 'equipment_type', v))}
              tooltip={t('sender.form.tooltip.equipType')} />
            <F label={t('sender.form.logType')} value={f.logType}
              onChange={v => u(c => syncHeartbeatTags(setMeta(c, 'log_type', v), 'log_type', v))}
              tooltip={t('sender.form.tooltip.logType')} />
            <F label={t('sender.form.lineCode')} value={f.lineCode}
              onChange={v => u(c => syncHeartbeatTags(setMeta(c, 'line_code', v), 'line_code', v))}
              tooltip={t('sender.form.tooltip.lineCode')} />
            <F label={t('sender.form.equipId')} value={f.equipId}
              onChange={v => u(c => syncHeartbeatTags(setMeta(c, 'equipment_id', v), 'equipment_id', v))}
              tooltip={t('sender.form.tooltip.equipId')} />
            <F label={t('sender.form.equipIp')} value={f.equipIp}
              onChange={v => u(c => syncHeartbeatTags(c, 'ip', v))}
              placeholder="192.168.0.100"
              tooltip={t('sender.form.tooltip.equipIp')} />
          </div>
          {onDescriptionChange && (
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">{t('sender.descLabel')}</label>
                <input value={description}
                  onChange={e => onDescriptionChange(e.target.value)}
                  placeholder={t('sender.descPlaceholder')}
                  className="w-full px-2 py-1 text-xs border rounded-lg
                    bg-white dark:bg-slate-800 border-border dark:border-border-dark
                    text-text dark:text-white placeholder:text-muted-foreground/50
                    focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary" />
              </div>
              {onEncodingChange && (
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">{t('sender.form.encoding')}</label>
                  <select value={encoding} onChange={e => onEncodingChange(e.target.value)}
                    className="h-[26px] px-2 text-xs border rounded-lg
                      bg-white dark:bg-slate-800 border-border dark:border-border-dark
                      text-text dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/30">
                    <option value="utf-8">UTF-8</option>
                    <option value="euc-kr">EUC-KR</option>
                    <option value="cp949">CP949</option>
                  </select>
                </div>
              )}
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
          <div className="mt-2 pt-2 border-t border-border/50 dark:border-border-dark/50">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={f.heartbeatOn}
                  onChange={e => u(c => e.target.checked ? addHeartbeat(c) : removeHeartbeat(c))}
                  className="w-3.5 h-3.5 rounded border-border accent-primary" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t('sender.form.heartbeat')}
                </span>
                <Tip text={t('sender.form.tooltip.heartbeat')} />
              </label>
              {f.heartbeatOn && (
                <F label={t('sender.form.heartbeatInterval')} value={f.heartbeatInterval}
                  type="number" suffix="s"
                  onChange={v => u(c => setHeartbeatInterval(c, v))}
                  tooltip={t('sender.form.tooltip.heartbeatInterval')} />
              )}
            </div>
          </div>
        </Sec>
      </div>

      {/* 로그 경로 */}
      <Sec icon="folder_open" title={t('sender.form.logPaths')} iconColor={IC}>
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <textarea value={f.logPaths} rows={2}
              onChange={e => u(c => setInclude(c, e.target.value))}
              placeholder={'C:\\logs\\설비명\\*.csv\nC:\\logs\\설비명\\*.txt'}
              className="w-full px-2.5 py-1.5 text-xs font-mono border rounded-lg resize-y
                bg-white dark:bg-slate-800 border-border" />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              따옴표 없이 경로만 입력 (줄바꿈으로 여러 경로 추가)
            </p>
            <div className="absolute right-2 top-2">
              <Tip text={t('sender.form.tooltip.logPaths')} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={hasMultiline(content)}
                onChange={e => u(c => e.target.checked ? addMultiline(c) : removeMultiline(c))}
                className="w-3.5 h-3.5 rounded border-border accent-primary" />
              <span className="text-[11px] text-muted-foreground">{t('sender.form.wholeFile')}</span>
              <Tip text={t('sender.form.tooltip.wholeFile')} />
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={hasRecursive(f.logPaths)}
                onChange={e => {
                  const toggled = toggleRecursive(f.logPaths, e.target.checked);
                  u(c => setInclude(c, toggled));
                }}
                className="w-3.5 h-3.5 rounded border-border accent-primary" />
              <span className="text-[11px] text-muted-foreground">{t('sender.form.recursive')}</span>
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                {hasRecursive(f.logPaths) ? '**/*.ext' : '*.ext'}
              </span>
            </label>
          </div>
        </div>
      </Sec>

      {/* 파일 감지 + 전송 버퍼 옵션 */}
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <AgentFileOptions content={content} onChange={onChange} />
        <AgentTransportOptions content={content} onChange={onChange} />
      </div>
    </div>
  );
}
