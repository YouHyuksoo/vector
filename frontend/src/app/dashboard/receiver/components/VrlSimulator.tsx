/**
 * @file src/app/dashboard/receiver/components/VrlSimulator.tsx
 * @description VRL 시뮬레이터 — AI 생성 / 수동 작성 / 시뮬레이션 / TOML 반영
 *
 * 초보자 가이드:
 * 1. **AI 생성**: 샘플 로그를 AI에게 보내 VRL 파싱 코드를 자동 생성
 * 2. **시뮬레이션**: vector.exe vrl 명령으로 실제 실행하여 결과 확인
 * 3. **TOML 반영**: 검증된 VRL 코드를 aggregator TOML의 해당 설비 블록에 삽입
 */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { usePipelineStatus } from '@/hooks/usePipelineStatus';
import { EquipmentTypeChips, PipelineStepBar } from '@/components/pipeline';


interface SimResult {
  success: boolean;
  output?: Record<string, unknown>;
  fields?: Array<{ name: string; value: unknown }>;
  error?: string;
}
interface AiModel { name: string; model: string; }

interface VrlSimulatorProps { onApplied?: () => void; }

export function VrlSimulator({ onApplied }: VrlSimulatorProps) {
  const { t } = useI18n();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [logType, setLogType] = useState('');
  const [sampleLog, setSampleLog] = useState('');
  const [vrlCode, setVrlCode] = useState('');
  const [result, setResult] = useState<SimResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파이프라인 상태 (매핑/송신기와 동일 소스)
  const { agents } = usePipelineStatus();

  // AI 관련 상태
  const [aiModels, setAiModels] = useState<AiModel[]>([]);
  const [selectedAi, setSelectedAi] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  // 로그 구조 옵션 (AI에게 전달)
  const [logStructure, setLogStructure] = useState<'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION'>('SINGLE');
  const [multiRowMode, setMultiRowMode] = useState<'BATCH' | 'ACCUMULATE'>('BATCH');
  const [hasHeader, setHasHeader] = useState(true);
  const [headerLines, setHeaderLines] = useState('1');
  const [startRow, setStartRow] = useState('');
  const [kvDelimiter, setKvDelimiter] = useState(':');
  const [sectionMarkers, setSectionMarkers] = useState('');

  /** 선택된 에이전트의 equipmentType 추출 */
  const equipmentType = selectedAgent ? (agents[selectedAgent]?.equipmentType || '') : '';

  /** 활성화된 AI 모델 목록 + 시스템 프롬프트 로드 */
  useEffect(() => {
    apiFetch<{ models: AiModel[] }>('/api/monitor/ai/models')
      .then(r => {
        setAiModels(r.models);
        if (r.models.length > 0) setSelectedAi(r.models[0].name);
      })
      .catch(() => {});
    apiFetch<{ prompt: string; isCustom: boolean }>('/api/monitor/ai/system-prompt')
      .then(r => { setSystemPrompt(r.prompt); setIsCustomPrompt(r.isCustom); })
      .catch(() => {});
  }, []);

  const loadExistingCode = useCallback(async (type: string) => {
    setLoadingCode(true);
    try {
      const res = await apiFetch<{
        code: string;
        logStructure?: {
          type: 'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION';
          multiRowMode?: 'BATCH' | 'ACCUMULATE';
          hasHeader: boolean;
          headerLines: number;
          delimiter?: string;
        };
      }>(`/api/monitor/vrl/code/${type}`);
      setVrlCode(res.code || '');
      if (res.logStructure) {
        setLogStructure(res.logStructure.type);
        setHasHeader(res.logStructure.hasHeader);
        setHeaderLines(String(res.logStructure.headerLines || 1));
        if (res.logStructure.multiRowMode) setMultiRowMode(res.logStructure.multiRowMode);
        if (res.logStructure.delimiter) setKvDelimiter(res.logStructure.delimiter);
      }
    } catch { setVrlCode(''); }
    setLoadingCode(false);
  }, []);

  useEffect(() => { if (equipmentType) loadExistingCode(equipmentType); }, [equipmentType, loadExistingCode]);

  /** 파일 → 텍스트 변환 (UTF-8 / EUC-KR 자동 감지) */
  const readFileAsText = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const isUtf8 = (() => {
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b <= 0x7F) continue;
        if (b >= 0xC2 && b <= 0xDF && i + 1 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80) { i += 1; continue; }
        if (b >= 0xE0 && b <= 0xEF && i + 2 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80 && (bytes[i + 2] & 0xC0) === 0x80) { i += 2; continue; }
        return false;
      }
      return true;
    })();
    const decoder = new TextDecoder(isUtf8 ? 'utf-8' : 'euc-kr');
    setSampleLog(decoder.decode(bytes));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await readFileAsText(file);
    e.target.value = '';
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await readFileAsText(file);
  }, [readFileAsText]);

  const handleAgentSelect = (name: string) => {
    setSelectedAgent(prev => prev === name ? null : name);
    setResult(null);
    setApplyMsg(null);
    setAiError('');
  };

  /** AI로 VRL 코드 생성 */
  const handleAiGenerate = async () => {
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
            provider: selectedAi,
            sampleLog,
            equipmentType,
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
        setVrlCode(res.vrlCode);
      } else {
        setAiError(res.error || 'Generation failed');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed');
    }
    setGenerating(false);
  };

  const handleSimulate = async () => {
    setSimulating(true);
    setResult(null);
    setApplyMsg(null);
    try {
      const data = await apiFetch<SimResult>('/api/monitor/vrl/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentType, logType, sampleLog, vrlCode }),
      });
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : 'Failed' });
    }
    setSimulating(false);
  };

  const handleApply = async () => {
    setApplying(true);
    setApplyMsg(null);
    try {
      await apiFetch('/api/monitor/vrl/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentType, vrlCode }),
      });
      setApplyMsg({ ok: true, msg: t('vrlSim.applied') });
      onApplied?.();
    } catch (err) {
      setApplyMsg({ ok: false, msg: err instanceof Error ? err.message : 'Apply failed' });
    }
    setApplying(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Icon name="science" className="text-info" />
        <div>
          <h2 className="text-sm font-bold">{t('vrlSim.title')}</h2>
          <p className="text-[10px] text-muted-foreground">{t('vrlSim.desc')}</p>
        </div>
      </div>

      {/* 입력 영역: 좌측(설비/샘플로그/AI) + 우측(VRL 코드) */}
      <div className="flex gap-4">
        {/* 좌측: 설비 유형 + 샘플 로그 + AI */}
        <Card noPadding className="flex-1 min-w-0">
          <div className="flex flex-col gap-3 p-4">
            {/* 설비 유형 (pipeline-status 동기화) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('vrlSim.equipType')}
              </label>
              <EquipmentTypeChips agents={agents} selected={selectedAgent} onSelect={handleAgentSelect} />
            </div>

            {/* 파이프라인 스텝 바 */}
            {selectedAgent && agents[selectedAgent] && (
              <PipelineStepBar agents={agents} agentName={selectedAgent} />
            )}

            {/* 로그 유형 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('vrlSim.logType')}
              </label>
              <input
                type="text"
                value={logType}
                onChange={e => setLogType(e.target.value)}
                placeholder={t('vrlSim.logTypePlaceholder')}
                className="w-full max-w-xs px-3 py-1.5 text-xs font-mono border rounded-lg
                  bg-white dark:bg-slate-800 border-border"
              />
            </div>

            {/* 샘플 로그 (드래그 앤 드롭 지원) */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragEnter={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={e => { e.preventDefault(); setDragging(false); }}
              onDrop={handleDrop}
              className="relative"
            >
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('vrlSim.sampleLog')}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
                    <Icon name="drag_indicator" size="xs" className="!text-[12px]" />
                    {t('vrlSim.dragHint')}
                  </span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                  >
                    <Icon name="upload_file" size="xs" />
                    {t('vrlSim.uploadFile')}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.log,.tsv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <textarea
                value={sampleLog}
                onChange={e => setSampleLog(e.target.value)}
                placeholder={t('vrlSim.sampleLogPlaceholder')}
                className={`w-full h-24 px-3 py-2 text-xs font-mono border rounded-lg resize-y
                  bg-white dark:bg-slate-800 transition-colors
                  ${dragging ? 'border-primary border-2 bg-primary/5 dark:bg-primary/10' : 'border-border'}`}
              />
              {dragging && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg
                  bg-primary/10 dark:bg-primary/20 border-2 border-dashed border-primary pointer-events-none">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Icon name="file_download" />
                    {t('vrlSim.dropFile')}
                  </div>
                </div>
              )}
            </div>

            {/* 로그 구조 옵션 — AI 생성 시 참조 */}
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-info/5 border border-info/20">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon name="description" size="xs" className="text-info" />
                <span className="text-[10px] font-bold text-info uppercase tracking-wider">
                  {t('receiver.form.logStructure')}
                </span>
              </div>
              {/* 1행: 구조 유형 + 타입별 부가 옵션 */}
              <div className="flex items-center gap-2 flex-wrap">
                {(['SINGLE', 'MULTI_ROW', 'KEY_VALUE', 'MULTI_SECTION'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setLogStructure(s)}
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
                        onClick={() => setMultiRowMode(m)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                          multiRowMode === m
                            ? 'bg-info/20 text-info border border-info/40'
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
                          onClick={() => setKvDelimiter(d)}
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
                            kvDelimiter === d
                              ? 'bg-info/20 text-info border border-info/40'
                              : 'text-muted-foreground hover:text-text'
                          }`}
                        >
                          {d === '\\t' ? 'TAB' : d}
                        </button>
                      ))}
                      <input
                        value={[':', '=', '\\t'].includes(kvDelimiter) ? '' : kvDelimiter}
                        onChange={e => setKvDelimiter(e.target.value)}
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
                    onChange={e => setSectionMarkers(e.target.value)}
                    placeholder="BoardInfo,Inspection"
                    className="flex-1 min-w-[140px] px-2 py-0.5 text-xs font-mono border rounded
                      bg-white dark:bg-slate-800 border-border placeholder:text-muted-foreground/50"
                  />
                )}
              </div>

              {/* 2행: 헤더/시작행 (SINGLE, MULTI_ROW 공통) */}
              {(logStructure === 'SINGLE' || logStructure === 'MULTI_ROW') && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {([true, false] as const).map(v => (
                      <button
                        key={String(v)}
                        onClick={() => setHasHeader(v)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                          hasHeader === v
                            ? 'bg-info/20 text-info border border-info/40'
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
                        type="number"
                        min="1"
                        value={headerLines}
                        onChange={e => setHeaderLines(e.target.value)}
                        className="w-12 px-1.5 py-0.5 text-xs text-center font-mono border rounded
                          bg-white dark:bg-slate-800 border-border"
                      />
                      <span className="text-[10px] text-muted-foreground">{t('receiver.form.headerLinesUnit')}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 border-l border-info/30 pl-2">
                    <span className="text-[10px] text-muted-foreground">{t('receiver.form.startRow')}:</span>
                    <input
                      type="number"
                      min="0"
                      value={startRow}
                      onChange={e => setStartRow(e.target.value)}
                      placeholder="0"
                      className="w-12 px-1.5 py-0.5 text-xs text-center font-mono border rounded
                        bg-white dark:bg-slate-800 border-border placeholder:text-muted-foreground/40"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* AI 생성 영역 */}
            {aiModels.length === 0 ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <Icon name="smart_toy" size="xs" className="text-purple-500/50 shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {t('vrlSim.aiNotConfigured')}
                </span>
                <a
                  href="/dashboard/settings"
                  className="text-xs text-purple-500 hover:text-purple-400 underline underline-offset-2 transition-colors whitespace-nowrap"
                >
                  {t('vrlSim.goSettings')}
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <div className="flex items-center gap-2">
                  <Icon name="smart_toy" size="xs" className="text-purple-500 shrink-0" />
                  <select
                    value={selectedAi}
                    onChange={e => setSelectedAi(e.target.value)}
                    className="text-xs px-2 py-1 rounded border bg-white dark:bg-slate-800 border-border"
                  >
                    {aiModels.map(m => (
                      <option key={m.name} value={m.name}>
                        {m.name.charAt(0).toUpperCase() + m.name.slice(1)} ({m.model})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    leftIcon="auto_awesome"
                    onClick={handleAiGenerate}
                    disabled={generating || !sampleLog}
                    className="!text-xs !px-2 !py-1"
                  >
                    {generating ? t('vrlSim.aiGenerating') : t('vrlSim.aiGenerate')}
                  </Button>
                  {aiError && <span className="text-[10px] text-error truncate">{aiError}</span>}
                </div>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder={t('vrlSim.aiPromptPlaceholder')}
                  className="w-full h-16 px-2 py-1.5 text-xs border rounded-lg resize-y
                    bg-white dark:bg-slate-800 border-border/50 placeholder:text-muted-foreground/50"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSystemPrompt(v => !v)}
                    className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
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
                      value={systemPrompt}
                      onChange={e => setSystemPrompt(e.target.value)}
                      className="w-full h-48 px-2 py-1.5 text-[10px] font-mono leading-relaxed border rounded-lg resize-y
                        bg-slate-50 dark:bg-slate-900 border-purple-500/30 text-muted-foreground"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setPromptSaving(true);
                          await apiFetch('/api/monitor/ai/system-prompt', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt: systemPrompt }),
                          });
                          setIsCustomPrompt(true);
                          setPromptSaving(false);
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
                            setSystemPrompt(res.prompt);
                            setIsCustomPrompt(false);
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
              </div>
            )}
          </div>
        </Card>

        {/* 우측: VRL 코드 + 액션 버튼 */}
        <Card noPadding className="flex-1 min-w-0">
          <div className="flex flex-col gap-3 p-4 h-full">
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('vrlSim.vrlCode')}
                </label>
                {loadingCode && (
                  <span className="text-[10px] text-muted-foreground animate-pulse">
                    {t('vrlSim.loadingCode')}
                  </span>
                )}
              </div>
              <textarea
                value={vrlCode}
                onChange={e => setVrlCode(e.target.value)}
                placeholder={t('vrlSim.vrlCodePlaceholder')}
                className="w-full flex-1 min-h-[280px] px-3 py-2 text-xs font-mono border rounded-lg resize-y
                  bg-white dark:bg-slate-800 border-border"
              />
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                leftIcon="play_arrow"
                onClick={handleSimulate}
                disabled={simulating || !sampleLog || !vrlCode}
              >
                {simulating ? t('vrlSim.simulating') : t('vrlSim.simulate')}
              </Button>
              <Button
                variant="ghost"
                leftIcon="upload"
                onClick={handleApply}
                disabled={applying || !vrlCode || !result?.success}
              >
                {applying ? t('vrlSim.applying') : t('vrlSim.apply')}
              </Button>
            </div>
            {applyMsg && (
              <p className={`text-xs ${applyMsg.ok ? 'text-success' : 'text-error'}`}>
                {applyMsg.msg}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* 결과 영역 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t('vrlSim.result')}
        </label>
        {!result ? (
          <Card className="flex items-center justify-center min-h-[120px]">
            <p className="text-xs text-muted-foreground">{t('vrlSim.noResult')}</p>
          </Card>
        ) : result.success ? (
          <Card noPadding>
            <div className="p-3 overflow-auto max-h-[400px]">
              <p className="text-[10px] text-success font-medium mb-2">
                {t('vrlSim.fieldCount').replace('{count}', String(result.fields?.length ?? 0))}
              </p>
              <div className="space-y-1">
                {result.fields?.map((f, i) => (
                  <div key={i} className="flex gap-2 text-xs font-mono">
                    <span className="text-info font-medium whitespace-nowrap">{f.name}</span>
                    <span className="text-muted-foreground">:</span>
                    <span className="text-text dark:text-white break-all">
                      {typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <div className="border border-error/30 rounded-xl p-3 overflow-auto max-h-[400px] bg-error/5">
            <p className="text-xs font-medium text-error mb-1">{t('vrlSim.error')}</p>
            <pre className="text-xs text-error/80 whitespace-pre-wrap font-mono">
              {result.error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
