/**
 * @file src/app/dashboard/sender/components/FluentConfigPanel.tsx
 * @description Fluent Bit Agent .conf 설정 패널 — 모든 옵션 폼 + 접이식 원본 에디터
 *
 * 초보자 가이드:
 * 1. API에서 .conf 내용을 로드하여 모든 설정을 폼 필드로 표시
 * 2. 폼 필드 변경 시 .conf 문자열 내 해당 값을 정규식으로 교체
 * 3. Vector의 AgentConfigPanel과 동일한 패턴 (Fluent Bit 포맷)
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { Sec, F, SF } from '@/app/dashboard/receiver/components/FormFields';
import {
  getFlush, setFlush,
  getLogLevel, setLogLevel,
  getStoragePath, setStoragePath,
  getStorageSync, setStorageSync,
  getFlushTimeout, setFlushTimeout,
  getInputPath, setInputPath,
  getInputTag, setInputTag,
  getReadFromHead, setReadFromHead,
  getDB, setDB,
  getRefreshInterval, setRefreshInterval,
  getMultiline, setMultiline,
  getFilterAdd, setFilterAdd,
  getOutputHost, setOutputHost,
  getOutputPort, setOutputPort,
  getBufferSize, setBufferSize,
} from './fluent-conf-helpers';

interface Props {
  name: string;
  onSaved?: () => void;
}

const IC = 'text-info';

export function FluentConfigPanel({ name, onSaved }: Props) {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiFetch<{ content: string }>(`/api/monitor/agent-fluent/config/${name}`);
      setContent(res.content);
      setOriginal(res.content);
    } catch {
      setContent('');
      setOriginal('');
    }
  }, [name]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const hasChanges = content !== original;

  const f = useMemo(() => ({
    // SERVICE
    flush: getFlush(content),
    logLevel: getLogLevel(content),
    storagePath: getStoragePath(content),
    storageSync: getStorageSync(content),
    // MULTILINE_PARSER
    flushTimeout: getFlushTimeout(content),
    // INPUT
    inputPath: getInputPath(content),
    inputTag: getInputTag(content),
    readFromHead: getReadFromHead(content),
    db: getDB(content),
    refreshInterval: getRefreshInterval(content),
    multiline: getMultiline(content),
    // FILTER
    equipType: getFilterAdd(content, 'equipment_type'),
    logType: getFilterAdd(content, 'log_type'),
    lineCode: getFilterAdd(content, 'line_code'),
    equipId: getFilterAdd(content, 'equipment_id'),
    // OUTPUT
    host: getOutputHost(content),
    port: getOutputPort(content),
    bufferSize: getBufferSize(content),
  }), [content]);

  const u = (fn: (c: string) => string) => { setContent(fn(content)); setMsg(null); };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/api/monitor/agent-fluent/config/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setOriginal(content);
      setMsg({ ok: true, text: t('sender.saved') });
      onSaved?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    }
    setSaving(false);
  };

  const handleDownload = () => {
    window.open(`/api/monitor/download/agent-fluent/${name}`, '_blank');
  };

  return (
    <Card noPadding>
      <div className="flex flex-col gap-3 p-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="air" className="text-info" />
            <h3 className="text-sm font-bold text-text dark:text-white">{name}.conf</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/10 text-text dark:text-white font-bold">
              Fluent Bit
            </span>
          </div>
          <div className="flex items-center gap-2">
            {msg && (
              <span className={`text-xs ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>
            )}
            <Button variant="ghost" leftIcon="file_download" onClick={handleDownload} className="!text-xs">
              {t('sender.download')}
            </Button>
            <Button variant="primary" leftIcon="save" onClick={handleSave}
              disabled={saving || !hasChanges} className="!text-xs">
              {saving ? t('sender.saving') : t('sender.save')}
            </Button>
          </div>
        </div>

        {/* 폼 필드 */}
        <div className="flex flex-col gap-2">
          {/* 1행: 설비 정보 + 연결 설정 */}
          <div className="grid grid-cols-2 gap-2">
            <Sec icon="precision_manufacturing" title={t('sender.form.equipment')} iconColor={IC}>
              <div className="grid grid-cols-2 gap-2">
                <F label={t('sender.form.equipType')} value={f.equipType}
                  onChange={v => u(c => setFilterAdd(c, 'equipment_type', v))}
                  tooltip={t('sender.form.tooltip.equipType')} />
                <F label={t('sender.form.logType')} value={f.logType}
                  onChange={v => u(c => setFilterAdd(c, 'log_type', v))}
                  tooltip={t('sender.form.tooltip.logType')} />
                <F label={t('sender.form.lineCode')} value={f.lineCode}
                  onChange={v => u(c => setFilterAdd(c, 'line_code', v))}
                  tooltip={t('sender.form.tooltip.lineCode')} />
                <F label={t('sender.form.equipId')} value={f.equipId}
                  onChange={v => u(c => setFilterAdd(c, 'equipment_id', v))}
                  tooltip={t('sender.form.tooltip.equipId')} />
              </div>
            </Sec>

            <Sec icon="dns" title={t('sender.form.connection')} iconColor={IC}>
              <div className="grid grid-cols-2 gap-2">
                <F label={t('sender.form.serverIp')} value={f.host}
                  onChange={v => u(c => setOutputHost(c, v))}
                  tooltip={t('sender.form.tooltip.serverIp')} />
                <F label={t('sender.form.serverPort')} value={f.port}
                  onChange={v => u(c => setOutputPort(c, v))}
                  tooltip={t('sender.form.tooltip.serverPort')} />
                <F label={t('sender.form.bufferSize')} value={f.bufferSize} type="number" suffix="MB"
                  onChange={v => u(c => setBufferSize(c, v))}
                  tooltip={t('sender.form.tooltip.bufferSize')} />
              </div>
            </Sec>
          </div>

          {/* 2행: 로그 경로 */}
          <Sec icon="folder_open" title={t('sender.form.logPaths')} iconColor={IC}>
            <textarea value={f.inputPath} rows={2}
              onChange={e => u(c => setInputPath(c, e.target.value))}
              placeholder={'C:\\logs\\aoi\\*.txt,C:\\logs\\aoi\\*.csv'}
              className="w-full px-2.5 py-1.5 text-xs font-mono border rounded-lg resize-y
                bg-white dark:bg-slate-800 border-border" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('sender.fluent.pathHint')}
            </p>
          </Sec>

          {/* 3행: 서비스 옵션 + 입력 옵션 */}
          <div className="grid grid-cols-2 gap-2">
            <Sec icon="settings" title={t('sender.fluent.service')} iconColor={IC}>
              <div className="grid grid-cols-2 gap-2">
                <F label={t('sender.fluent.flush')} value={f.flush} type="number" suffix="s"
                  onChange={v => u(c => setFlush(c, v))}
                  tooltip={t('sender.fluent.tooltip.flush')} />
                <SF label={t('sender.fluent.logLevel')} value={f.logLevel}
                  onChange={v => u(c => setLogLevel(c, v))}
                  options={[
                    { value: 'error', label: 'error' },
                    { value: 'warning', label: 'warning' },
                    { value: 'info', label: 'info' },
                    { value: 'debug', label: 'debug' },
                    { value: 'trace', label: 'trace' },
                  ]}
                  tooltip={t('sender.fluent.tooltip.logLevel')} />
                <F label={t('sender.fluent.storagePath')} value={f.storagePath}
                  onChange={v => u(c => setStoragePath(c, v))}
                  tooltip={t('sender.fluent.tooltip.storagePath')} />
                <SF label={t('sender.fluent.storageSync')} value={f.storageSync}
                  onChange={v => u(c => setStorageSync(c, v))}
                  options={[
                    { value: 'normal', label: 'normal' },
                    { value: 'full', label: 'full' },
                  ]}
                  tooltip={t('sender.fluent.tooltip.storageSync')} />
              </div>
            </Sec>

            <Sec icon="input" title={t('sender.fluent.input')} iconColor={IC}>
              <div className="grid grid-cols-2 gap-2">
                <F label="Tag" value={f.inputTag}
                  onChange={v => u(c => setInputTag(c, v))}
                  tooltip={t('sender.fluent.tooltip.tag')} />
                <SF label="Read_from_Head" value={f.readFromHead}
                  onChange={v => u(c => setReadFromHead(c, v))}
                  options={[
                    { value: 'true', label: 'true' },
                    { value: 'false', label: 'false' },
                  ]}
                  tooltip={t('sender.fluent.tooltip.readFromHead')} />
                <F label="DB" value={f.db}
                  onChange={v => u(c => setDB(c, v))}
                  tooltip={t('sender.fluent.tooltip.db')} />
                <F label={t('sender.fluent.refreshInterval')} value={f.refreshInterval}
                  type="number" suffix="s"
                  onChange={v => u(c => setRefreshInterval(c, v))}
                  tooltip={t('sender.fluent.tooltip.refreshInterval')} />
                <SF label="Multiline" value={f.multiline}
                  onChange={v => u(c => setMultiline(c, v))}
                  options={[
                    { value: 'On', label: 'On' },
                    { value: 'Off', label: 'Off' },
                  ]}
                  tooltip={t('sender.fluent.tooltip.multiline')} />
                <F label={t('sender.fluent.flushTimeout')} value={f.flushTimeout}
                  type="number" suffix="ms"
                  onChange={v => u(c => setFlushTimeout(c, v))}
                  tooltip={t('sender.fluent.tooltip.flushTimeout')} />
              </div>
            </Sec>
          </div>
        </div>

        {/* 원본 에디터 (접이식) */}
        <button onClick={() => setShowRaw(v => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-text transition-colors self-start">
          <Icon name={showRaw ? 'expand_less' : 'expand_more'} size="xs" />
          {t('sender.rawEditor')}
        </button>
        {showRaw && (
          <textarea value={content}
            onChange={e => { setContent(e.target.value); setMsg(null); }}
            spellCheck={false}
            className="w-full h-[400px] px-3 py-2 text-xs font-mono leading-relaxed border rounded-lg resize-y
              bg-slate-50 dark:bg-slate-900 border-border dark:border-border-dark
              focus:outline-none focus:ring-2 focus:ring-info/30 focus:border-info" />
        )}

        {hasChanges && (
          <p className="text-[10px] text-warning flex items-center gap-1">
            <Icon name="edit" size="xs" />
            {t('sender.unsaved')}
          </p>
        )}
      </div>
    </Card>
  );
}
