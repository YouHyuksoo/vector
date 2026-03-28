/**
 * @file components/AiVrlGenerator.tsx
 * @description AI VRL 코드 생성 접이식 패널 — 모델 선택, 로그 구조, 프롬프트 입력
 *
 * 초보자 가이드:
 * 1. 기본 접힌 상태 — 클릭하면 펼쳐짐
 * 2. AI 모델 선택 → 프롬프트 입력 → 생성 버튼
 * 3. 로그 구조(SINGLE/MULTI_ROW/KEY_VALUE/MULTI_SECTION) 선택
 * 4. 생성된 VRL 코드를 onGenerated 콜백으로 전달
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface AiModel { name: string; model: string; }

interface Props {
  equipmentType: string;
  sampleLog: string;
  onGenerated: (code: string) => void;
  logStructure: 'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION';
  onLogStructureChange: (s: 'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION') => void;
  multiRowMode: 'BATCH' | 'ACCUMULATE';
  onMultiRowModeChange: (m: 'BATCH' | 'ACCUMULATE') => void;
  hasHeader: boolean;
  onHasHeaderChange: (v: boolean) => void;
  headerLines: string;
  onHeaderLinesChange: (v: string) => void;
  startRow: string;
  onStartRowChange: (v: string) => void;
  kvDelimiter: string;
  onKvDelimiterChange: (v: string) => void;
  sectionMarkers: string;
  onSectionMarkersChange: (v: string) => void;
}

export default function AiVrlGenerator({
  equipmentType, sampleLog, onGenerated,
  logStructure, onLogStructureChange,
  multiRowMode, onMultiRowModeChange,
  hasHeader, onHasHeaderChange,
  headerLines, onHeaderLinesChange,
  startRow, onStartRowChange,
  kvDelimiter, onKvDelimiterChange,
  sectionMarkers, onSectionMarkersChange,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [aiModels, setAiModels] = useState<AiModel[]>([]);
  const [selectedAi, setSelectedAi] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ models: AiModel[] }>('/api/monitor/ai/models')
      .then(r => { setAiModels(r.models); if (r.models.length > 0) setSelectedAi(r.models[0].name); })
      .catch(() => {});
    apiFetch<{ prompt: string; isCustom: boolean }>('/api/monitor/ai/system-prompt')
      .then(r => { setSystemPrompt(r.prompt); setIsCustomPrompt(r.isCustom); })
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!sampleLog || !selectedAi) return;
    setGenerating(true);
    setAiError('');
    try {
      const res = await apiFetch<{ success: boolean; vrlCode?: string; error?: string }>(
        '/api/monitor/ai/generate-vrl',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: selectedAi, sampleLog, equipmentType,
            userInstruction: aiPrompt,
            systemPrompt: systemPrompt || undefined,
            logStructure,
            multiRowMode: logStructure === 'MULTI_ROW' ? multiRowMode : undefined,
            hasHeader: (logStructure === 'SINGLE' || logStructure === 'MULTI_ROW') ? hasHeader : undefined,
            headerLines: (logStructure === 'SINGLE' || logStructure === 'MULTI_ROW') && hasHeader ? headerLines : undefined,
            startRow: (logStructure === 'SINGLE' || logStructure === 'MULTI_ROW') && startRow ? startRow : undefined,
            kvDelimiter: logStructure === 'KEY_VALUE' ? kvDelimiter : undefined,
            sectionMarkers: logStructure === 'MULTI_SECTION' ? sectionMarkers : undefined,
          }),
        },
      );
      if (res.success && res.vrlCode) {
        onGenerated(res.vrlCode);
      } else {
        setAiError(res.error || 'Generation failed');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed');
    }
    setGenerating(false);
  };

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-500/10 transition-colors"
      >
        <Icon name={open ? 'expand_less' : 'expand_more'} size="xs" className="text-purple-500" />
        <Icon name="smart_toy" size="xs" className="text-purple-500" />
        <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
          {t('vrlSim.aiGenerate')}
        </span>
        {aiModels.length === 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto">{t('vrlSim.aiNotConfigured')}</span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-purple-500/20">
          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-info/5 border border-info/20 mt-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Icon name="description" size="xs" className="text-info" />
              <span className="text-[10px] font-bold text-info uppercase tracking-wider">
                {t('receiver.form.logStructure')}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(['SINGLE', 'MULTI_ROW', 'KEY_VALUE', 'MULTI_SECTION'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => onLogStructureChange(s)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    logStructure === s
                      ? 'bg-info text-white'
                      : 'bg-muted dark:bg-muted/50 text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {t(`receiver.form.structure${
                    s === 'SINGLE' ? 'Single' : s === 'MULTI_ROW' ? 'MultiRow'
                      : s === 'KEY_VALUE' ? 'KeyValue' : 'MultiSection'
                  }`)}
                </button>
              ))}
              {logStructure === 'MULTI_ROW' && (
                <div className="flex items-center gap-0.5 ml-1 border-l border-info/30 pl-2">
                  {(['BATCH', 'ACCUMULATE'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => onMultiRowModeChange(m)}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                        multiRowMode === m
                          ? 'bg-info/20 text-text dark:text-white border border-info/40'
                          : 'text-muted-foreground hover:text-text'
                      }`}
                    >
                      {t(`receiver.form.multiRow${m === 'BATCH' ? 'Batch' : 'Accumulate'}`)}
                    </button>
                  ))}
                </div>
              )}
              {logStructure === 'KEY_VALUE' && (
                <div className="flex items-center gap-1 ml-1 border-l border-info/30 pl-2">
                  <span className="text-[10px] text-muted-foreground">{t('receiver.form.kvDelimiter')}:</span>
                  <div className="flex items-center gap-0.5">
                    {[':', '=', '\\t'].map(d => (
                      <button
                        key={d}
                        onClick={() => onKvDelimiterChange(d)}
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
                          kvDelimiter === d
                            ? 'bg-info/20 text-text dark:text-white border border-info/40'
                            : 'text-muted-foreground hover:text-text'
                        }`}
                      >
                        {d === '\\t' ? 'TAB' : d}
                      </button>
                    ))}
                    <input
                      value={[':', '=', '\\t'].includes(kvDelimiter) ? '' : kvDelimiter}
                      onChange={e => onKvDelimiterChange(e.target.value)}
                      placeholder={t('receiver.form.kvCustom')}
                      className="w-16 px-1.5 py-0.5 text-[10px] font-mono border rounded
                        bg-white dark:bg-slate-800 border-border placeholder:text-muted-foreground/40"
                    />
                  </div>
                </div>
              )}
              {logStructure === 'MULTI_SECTION' && (
                <input
                  value={sectionMarkers}
                  onChange={e => onSectionMarkersChange(e.target.value)}
                  placeholder="BoardInfo,Inspection"
                  className="flex-1 min-w-[140px] px-2 py-0.5 text-xs font-mono border rounded
                    bg-white dark:bg-slate-800 border-border placeholder:text-muted-foreground/50"
                />
              )}
            </div>
            {(logStructure === 'SINGLE' || logStructure === 'MULTI_ROW') && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-0.5">
                  {([true, false] as const).map(v => (
                    <button
                      key={String(v)}
                      onClick={() => onHasHeaderChange(v)}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                        hasHeader === v
                          ? 'bg-info/20 text-text dark:text-white border border-info/40'
                          : 'text-muted-foreground hover:text-text'
                      }`}
                    >
                      {t(`receiver.form.header${v ? 'Yes' : 'No'}`)}
                    </button>
                  ))}
                </div>
                {hasHeader && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="1" value={headerLines}
                      onChange={e => onHeaderLinesChange(e.target.value)}
                      className="w-12 px-1.5 py-0.5 text-xs text-center font-mono border rounded
                        bg-white dark:bg-slate-800 border-border"
                    />
                    <span className="text-[10px] text-muted-foreground">{t('receiver.form.headerLinesUnit')}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 border-l border-info/30 pl-2">
                  <span className="text-[10px] text-muted-foreground">{t('receiver.form.startRow')}:</span>
                  <input
                    type="number" min="0" value={startRow}
                    onChange={e => onStartRowChange(e.target.value)}
                    placeholder="0"
                    className="w-12 px-1.5 py-0.5 text-xs text-center font-mono border rounded
                      bg-white dark:bg-slate-800 border-border placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>
            )}
          </div>

          {aiModels.length === 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('vrlSim.aiNotConfigured')}</span>
              <a href="/dashboard/settings" className="text-xs text-purple-500 hover:text-purple-400 underline underline-offset-2">
                {t('vrlSim.goSettings')}
              </a>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <select
                  value={selectedAi} onChange={e => setSelectedAi(e.target.value)}
                  className="text-xs px-2 py-1 rounded border bg-white dark:bg-slate-800 border-border"
                >
                  {aiModels.map(m => (
                    <option key={m.name} value={m.name}>
                      {m.name.charAt(0).toUpperCase() + m.name.slice(1)} ({m.model})
                    </option>
                  ))}
                </select>
                <Button variant="secondary" leftIcon="auto_awesome" onClick={handleGenerate}
                  disabled={generating || !sampleLog} className="!text-xs !px-2 !py-1">
                  {generating ? t('vrlSim.aiGenerating') : t('vrlSim.aiGenerate')}
                </Button>
                {aiError && <span className="text-[10px] text-error truncate">{aiError}</span>}
              </div>
              <textarea
                value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                placeholder={t('vrlSim.aiPromptPlaceholder')}
                className="w-full h-16 px-2 py-1.5 text-xs border rounded-lg resize-y
                  bg-white dark:bg-slate-800 border-border/50 placeholder:text-muted-foreground/50"
              />
              <div className="flex items-center gap-2">
                <button onClick={() => setShowSystemPrompt(v => !v)}
                  className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors">
                  <Icon name={showSystemPrompt ? 'expand_less' : 'expand_more'} size="xs" />
                  {t('vrlSim.systemPrompt')}
                </button>
                {isCustomPrompt && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    {t('vrlSim.customSaved')}
                  </span>
                )}
              </div>
              {showSystemPrompt && (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                    className="w-full h-48 px-2 py-1.5 text-[10px] font-mono leading-relaxed border rounded-lg resize-y
                      bg-slate-50 dark:bg-slate-900 border-purple-500/30 text-muted-foreground"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        setPromptSaving(true);
                        await apiFetch('/api/monitor/ai/system-prompt', {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: systemPrompt }),
                        });
                        setIsCustomPrompt(true); setPromptSaving(false);
                      }}
                      disabled={promptSaving}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded
                        bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
                    >
                      <Icon name="save" size="xs" />
                      {t('vrlSim.savePrompt')}
                    </button>
                    {isCustomPrompt && (
                      <button
                        onClick={async () => {
                          const res = await apiFetch<{ prompt: string }>('/api/monitor/ai/system-prompt', { method: 'DELETE' });
                          setSystemPrompt(res.prompt); setIsCustomPrompt(false);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded
                          text-muted-foreground hover:text-text border border-border hover:border-border/80 transition-colors"
                      >
                        <Icon name="restart_alt" size="xs" />
                        {t('vrlSim.resetPrompt')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
