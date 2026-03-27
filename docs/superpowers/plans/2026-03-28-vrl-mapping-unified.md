# VRL & 매핑 통합 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard/simulator`와 `/dashboard/mapping`을 하나의 `/dashboard/vrl-mapping` 통합 페이지로 합친다.

**Architecture:** 왼쪽 설비 사이드 패널 + 오른쪽 VRL/매핑 탭 전환 구조. VrlSimulator(649줄)를 AiVrlGenerator, VrlEditor, VrlResultPanel 3개로 분리하고, 매핑 컴포넌트는 기존 것을 재사용한다.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: EquipmentSidePanel 컴포넌트 생성

**Files:**
- Create: `frontend/src/app/dashboard/vrl-mapping/components/EquipmentSidePanel.tsx`

- [ ] **Step 1: EquipmentSidePanel 작성**

`usePipelineStatus` 훅으로 설비 목록을 가져와서, 완료/미완료 그룹으로 분리 표시하는 사이드 패널.

```tsx
/**
 * @file components/EquipmentSidePanel.tsx
 * @description 설비 사이드 패널 — 파이프라인 완료/미완료 그룹 분리, 선택 시 콜백
 *
 * 초보자 가이드:
 * 1. usePipelineStatus로 설비별 5단계 상태 조회
 * 2. vrl/table/mapping 모두 완료 → "완료" 그룹, 아니면 "미완료"
 * 3. 설비 클릭 시 onSelect(equipmentType) 호출
 */
'use client';

import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { PipelineStatusMap } from '@/hooks/usePipelineStatus';

interface Props {
  agents: PipelineStatusMap;
  selected: string | null;
  onSelect: (equipmentType: string) => void;
}

export default function EquipmentSidePanel({ agents, selected, onSelect }: Props) {
  const { t } = useI18n();
  const entries = Object.entries(agents);

  const incomplete = entries.filter(([, a]) => a.doneCount < 5);
  const complete = entries.filter(([, a]) => a.doneCount >= 5);

  const renderItem = (name: string, equipType: string, doneCount: number) => {
    const isActive = selected === equipType;
    return (
      <button
        key={name}
        onClick={() => onSelect(equipType)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
          ${isActive
            ? 'bg-primary text-white font-bold'
            : 'text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark'}`}
      >
        <span className="font-mono text-xs">{equipType}</span>
        <span className={`text-[10px] font-bold ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>
          {doneCount}/5
        </span>
      </button>
    );
  };

  return (
    <div className="w-52 shrink-0 border-r border-border dark:border-border-dark overflow-y-auto">
      <div className="p-3 space-y-4">
        {/* 미완료 그룹 */}
        {incomplete.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Icon name="pending" size="xs" className="text-warning" />
              <span className="text-[10px] font-bold text-warning uppercase tracking-wider">
                {t('vrlMapping.incomplete')} ({incomplete.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {incomplete.map(([name, a]) => renderItem(name, a.equipmentType, a.doneCount))}
            </div>
          </div>
        )}

        {/* 완료 그룹 */}
        {complete.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Icon name="check_circle" size="xs" className="text-success" />
              <span className="text-[10px] font-bold text-success uppercase tracking-wider">
                {t('vrlMapping.complete')} ({complete.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {complete.map(([name, a]) => renderItem(name, a.equipmentType, a.doneCount))}
            </div>
          </div>
        )}

        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">{t('vrlMapping.noEquipment')}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/vrl-mapping/components/EquipmentSidePanel.tsx
git commit -m "feat(vrl-mapping): EquipmentSidePanel 컴포넌트 생성"
```

---

### Task 2: AiVrlGenerator 접이식 컴포넌트 생성

**Files:**
- Create: `frontend/src/app/dashboard/vrl-mapping/components/AiVrlGenerator.tsx`

- [ ] **Step 1: AiVrlGenerator 작성**

VrlSimulator.tsx의 AI 관련 상태 및 UI(448~554줄)와 로그 구조 옵션(320~446줄)을 분리한 접이식 컴포넌트.

```tsx
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
      {/* 접이식 헤더 */}
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

      {/* 펼쳐진 내용 */}
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-purple-500/20">
          {/* 로그 구조 옵션 */}
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

          {/* AI 모델 + 프롬프트 */}
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
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/vrl-mapping/components/AiVrlGenerator.tsx
git commit -m "feat(vrl-mapping): AiVrlGenerator 접이식 컴포넌트 생성"
```

---

### Task 3: VrlEditor 컴포넌트 생성

**Files:**
- Create: `frontend/src/app/dashboard/vrl-mapping/components/VrlEditor.tsx`

- [ ] **Step 1: VrlEditor 작성**

VrlSimulator.tsx에서 샘플 로그 입력 + VRL 코드 편집 + 시뮬레이션 실행/적용 기능을 분리한 컴포넌트.

```tsx
/**
 * @file components/VrlEditor.tsx
 * @description VRL 코드 편집기 — 샘플 로그 입력(좌) + VRL 코드(우) + 시뮬레이션/적용 버튼
 *
 * 초보자 가이드:
 * 1. 좌측: 샘플 로그 텍스트/파일 업로드 (UTF-8/EUC-KR 자동 감지)
 * 2. 우측: VRL 코드 편집 (설비 선택 시 서버에서 기존 코드 로드)
 * 3. 시뮬레이션: vector.exe vrl 명령 실행 → 결과를 onResult로 전달
 * 4. 적용: aggregator TOML에 VRL 코드 삽입 → onApplied 호출
 */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

export interface SimResult {
  success: boolean;
  output?: Record<string, unknown>;
  fields?: Array<{ name: string; value: unknown }>;
  error?: string;
}

interface Props {
  equipmentType: string;
  sampleLog: string;
  onSampleLogChange: (v: string) => void;
  vrlCode: string;
  onVrlCodeChange: (v: string) => void;
  onResult: (r: SimResult | null) => void;
  onApplied: () => void;
  codeFromServer: boolean;
  onCodeFromServerChange: (v: boolean) => void;
  result: SimResult | null;
}

export default function VrlEditor({
  equipmentType, sampleLog, onSampleLogChange,
  vrlCode, onVrlCodeChange, onResult, onApplied,
  codeFromServer, onCodeFromServerChange, result,
}: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logType, setLogType] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  /** 설비 변경 시 상태 초기화 */
  useEffect(() => {
    setApplyMsg(null);
    onResult(null);
  }, [equipmentType]); // eslint-disable-line react-hooks/exhaustive-deps

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
    onSampleLogChange(decoder.decode(bytes));
  }, [onSampleLogChange]);

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

  const handleSimulate = async () => {
    setSimulating(true);
    onResult(null);
    setApplyMsg(null);
    try {
      const data = await apiFetch<SimResult>('/api/monitor/vrl/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentType, logType, sampleLog, vrlCode }),
      });
      onResult(data);
    } catch (err) {
      onResult({ success: false, error: err instanceof Error ? err.message : 'Failed' });
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
      onApplied();
    } catch (err) {
      setApplyMsg({ ok: false, msg: err instanceof Error ? err.message : 'Apply failed' });
    }
    setApplying(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 좌우 분할: 샘플 로그 + VRL 코드 */}
      <div className="flex gap-4">
        {/* 샘플 로그 입력 */}
        <Card noPadding className="flex-1 min-w-0">
          <div className="flex flex-col gap-2 p-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('vrlSim.logType')}
              </label>
              <input
                type="text" value={logType} onChange={e => setLogType(e.target.value)}
                placeholder={t('vrlSim.logTypePlaceholder')}
                className="w-full max-w-xs px-3 py-1.5 text-xs font-mono border rounded-lg
                  bg-white dark:bg-slate-800 border-border"
              />
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragEnter={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={e => { e.preventDefault(); setDragging(false); }}
              onDrop={handleDrop}
              className="relative"
            >
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">{t('vrlSim.sampleLog')}</label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
                    <Icon name="drag_indicator" size="xs" className="!text-[12px]" />
                    {t('vrlSim.dragHint')}
                  </span>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors">
                    <Icon name="upload_file" size="xs" />
                    {t('vrlSim.uploadFile')}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept=".txt,.csv,.log,.tsv"
                  onChange={handleFileUpload} className="hidden" />
              </div>
              <textarea
                value={sampleLog} onChange={e => onSampleLogChange(e.target.value)}
                placeholder={t('vrlSim.sampleLogPlaceholder')}
                className={`w-full h-40 px-3 py-2 text-xs font-mono border rounded-lg resize-y
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
          </div>
        </Card>

        {/* VRL 코드 */}
        <Card noPadding className="flex-1 min-w-0">
          <div className="flex flex-col gap-2 p-4 h-full">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">{t('vrlSim.vrlCode')}</label>
            </div>
            <textarea
              value={vrlCode}
              onChange={e => { onVrlCodeChange(e.target.value); onCodeFromServerChange(false); }}
              placeholder={t('vrlSim.vrlCodePlaceholder')}
              className="w-full flex-1 min-h-[200px] px-3 py-2 text-xs font-mono border rounded-lg resize-y
                bg-white dark:bg-slate-800 border-border"
            />
          </div>
        </Card>
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-2">
        <Button variant="primary" leftIcon="play_arrow" onClick={handleSimulate}
          disabled={simulating || !sampleLog || !vrlCode}>
          {simulating ? t('vrlSim.simulating') : t('vrlSim.simulate')}
        </Button>
        <Button variant="ghost" leftIcon="upload" onClick={handleApply}
          disabled={applying || !vrlCode || (!result?.success && !codeFromServer)}>
          {applying ? t('vrlSim.applying') : t('vrlSim.apply')}
        </Button>
        {applyMsg && (
          <span className={`text-xs ${applyMsg.ok ? 'text-success' : 'text-error'}`}>{applyMsg.msg}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/vrl-mapping/components/VrlEditor.tsx
git commit -m "feat(vrl-mapping): VrlEditor 컴포넌트 생성"
```

---

### Task 4: VrlResultPanel 컴포넌트 생성

**Files:**
- Create: `frontend/src/app/dashboard/vrl-mapping/components/VrlResultPanel.tsx`

- [ ] **Step 1: VrlResultPanel 작성**

시뮬레이션 결과를 표시하는 컴포넌트. 결과가 없으면 아무것도 렌더링하지 않음.

```tsx
/**
 * @file components/VrlResultPanel.tsx
 * @description VRL 시뮬레이션 결과 표시 — 성공 시 필드 목록, 실패 시 에러 메시지
 *
 * 초보자 가이드:
 * 1. result가 null이면 아무것도 표시하지 않음 (공간 절약)
 * 2. 성공: 파싱된 필드명 + 값 목록
 * 3. 실패: 에러 메시지 (pre 태그로 줄바꿈 유지)
 */
'use client';

import { Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { SimResult } from './VrlEditor';

interface Props {
  result: SimResult | null;
}

export default function VrlResultPanel({ result }: Props) {
  const { t } = useI18n();

  if (!result) return null;

  if (result.success) {
    return (
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
    );
  }

  return (
    <div className="border border-error/30 rounded-xl p-3 overflow-auto max-h-[400px] bg-error/5">
      <p className="text-xs font-medium text-error mb-1">{t('vrlSim.error')}</p>
      <pre className="text-xs text-error/80 whitespace-pre-wrap font-mono">{result.error}</pre>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/vrl-mapping/components/VrlResultPanel.tsx
git commit -m "feat(vrl-mapping): VrlResultPanel 컴포넌트 생성"
```

---

### Task 5: 통합 page.tsx 생성

**Files:**
- Create: `frontend/src/app/dashboard/vrl-mapping/page.tsx`

- [ ] **Step 1: page.tsx 작성**

왼쪽 EquipmentSidePanel + 오른쪽 탭(VRL/매핑) 레이아웃.

```tsx
/**
 * @file src/app/dashboard/vrl-mapping/page.tsx
 * @description VRL & 매핑 통합 페이지 — 설비 사이드패널 + VRL/매핑 탭 전환
 *
 * 초보자 가이드:
 * 1. 왼쪽: 설비 목록 (완료/미완료 그룹)
 * 2. 오른쪽: VRL 탭 (AI 생성 + 코드 편집 + 시뮬레이션) / 매핑 탭 (테이블/프로시저 매핑)
 * 3. 설비 선택 시 양쪽 탭 모두 해당 설비 컨텍스트로 전환
 * 4. VRL 적용 후 매핑 탭으로 자동 전환 안내
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Icon, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { usePipelineStatus } from '@/hooks/usePipelineStatus';
import EquipmentSidePanel from './components/EquipmentSidePanel';
import AiVrlGenerator from './components/AiVrlGenerator';
import VrlEditor, { type SimResult } from './components/VrlEditor';
import VrlResultPanel from './components/VrlResultPanel';
import type { LogType, ParseField, TargetType } from '../mapping/types';
import { getLogTypesFromRules } from '../mapping/mapping-utils';
import { useTableMapping } from '../mapping/hooks/useTableMapping';
import { useProcedureMapping } from '../mapping/hooks/useProcedureMapping';
import SelectionPanel from '../mapping/components/SelectionPanel';
import MappingTable from '../mapping/components/MappingTable';
import ProcedureMapping from '../mapping/components/ProcedureMapping';
import AutoCreateModal from '../mapping/components/AutoCreateModal';

type Tab = 'vrl' | 'mapping';

interface TargetMapEntry { targetTable: string; targetType: string; }

export default function VrlMappingPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('vrl');
  const [pipelineKey, setPipelineKey] = useState(0);
  const { agents } = usePipelineStatus(pipelineKey);
  const [selectedEquip, setSelectedEquip] = useState<string | null>(null);

  /* ── VRL 탭 상태 ── */
  const [sampleLog, setSampleLog] = useState('');
  const [vrlCode, setVrlCode] = useState('');
  const [vrlResult, setVrlResult] = useState<SimResult | null>(null);
  const [codeFromServer, setCodeFromServer] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [showRestart, setShowRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<{ ok: boolean; msg: string } | null>(null);

  /* 로그 구조 옵션 */
  const [logStructure, setLogStructure] = useState<'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION'>('SINGLE');
  const [multiRowMode, setMultiRowMode] = useState<'BATCH' | 'ACCUMULATE'>('BATCH');
  const [hasHeader, setHasHeader] = useState(true);
  const [headerLines, setHeaderLines] = useState('1');
  const [startRow, setStartRow] = useState('');
  const [kvDelimiter, setKvDelimiter] = useState(':');
  const [sectionMarkers, setSectionMarkers] = useState('');

  /* ── 매핑 탭 상태 ── */
  const [targetType, setTargetType] = useState<TargetType>('TABLE');
  const [logType, setLogType] = useState<LogType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [parseRules, setParseRules] = useState<Record<string, ParseField[]>>({});
  const [autoCreateOpen, setAutoCreateOpen] = useState(false);
  const [forceRecreate, setForceRecreate] = useState(false);
  const [targetMap, setTargetMap] = useState<Record<string, TargetMapEntry>>({});
  const autoSelecting = useRef(false);
  const userSwitched = useRef(false);

  const guardedSetLogType = useCallback((v: LogType | null) => {
    if (autoSelecting.current && v === null) return;
    setLogType(v);
  }, []);
  const sharedOpts = { setLoading, setSaving, setSaveMsg, setLogType: guardedSetLogType, t };
  const tbl = useTableMapping({ logType, parseRules, ...sharedOpts });
  const proc = useProcedureMapping({ logType, ...sharedOpts });

  /* ── 설비 선택 시 VRL 코드 로드 + 매핑 logType 연동 ── */
  useEffect(() => {
    if (!selectedEquip) return;
    setLogType(selectedEquip);
    setLoadingCode(true);
    apiFetch<{
      code: string;
      logStructure?: {
        type: 'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION';
        multiRowMode?: 'BATCH' | 'ACCUMULATE';
        hasHeader: boolean; headerLines: number; delimiter?: string;
      };
    }>(`/api/monitor/vrl/code/${selectedEquip}`)
      .then(res => {
        setVrlCode(res.code || '');
        setCodeFromServer(!!res.code);
        if (res.logStructure) {
          setLogStructure(res.logStructure.type);
          setHasHeader(res.logStructure.hasHeader);
          setHeaderLines(String(res.logStructure.headerLines || 1));
          if (res.logStructure.multiRowMode) setMultiRowMode(res.logStructure.multiRowMode);
          if (res.logStructure.delimiter) setKvDelimiter(res.logStructure.delimiter);
        }
      })
      .catch(() => setVrlCode(''))
      .finally(() => setLoadingCode(false));
    setVrlResult(null);
  }, [selectedEquip]);

  /* ── 파싱 룰 + 타겟 맵 로드 ── */
  const loadParseRules = useCallback(async () => {
    try {
      const res = await apiFetch<{ rules: Record<string, ParseField[]> }>('/api/monitor/parse-rules');
      const rules = res.rules;
      if (!rules || Object.keys(rules).length === 0) {
        const syncRes = await apiFetch<{ synced: Record<string, number> }>('/api/monitor/parse-rules/sync', { method: 'POST' });
        if (syncRes.synced && Object.keys(syncRes.synced).length > 0) {
          const refreshed = await apiFetch<{ rules: Record<string, ParseField[]> }>('/api/monitor/parse-rules');
          setParseRules(refreshed.rules);
          return;
        }
      }
      setParseRules(rules);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadParseRules(); }, [loadParseRules]);
  useEffect(() => {
    apiFetch<{ map: Record<string, TargetMapEntry> }>('/api/monitor/vrl/target-map')
      .then(d => setTargetMap(d.map || {}))
      .catch(() => {});
  }, [pipelineKey]);

  /* ── 매핑 탭: 설비 선택 시 자동 테이블/프로시저 선택 ── */
  useEffect(() => {
    if (!logType || autoSelecting.current || tab !== 'mapping') return;
    if (userSwitched.current) { userSwitched.current = false; return; }
    const entry = targetMap[logType];
    if (!entry) return;
    const isProc = entry.targetType === 'PROCEDURE';
    if (isProc && proc.oracleProcs.length === 0) return;

    autoSelecting.current = true;
    const run = async () => {
      try {
        if (isProc) {
          if (targetType !== 'PROCEDURE') { setTargetType('PROCEDURE'); tbl.reset(); }
          const found = proc.oracleProcs.find(p =>
            p.DISPLAY_NAME === entry.targetTable || p.OBJECT_NAME === entry.targetTable,
          ) ?? {
            DISPLAY_NAME: entry.targetTable, OBJECT_NAME: entry.targetTable,
            PACKAGE_NAME: null, OBJECT_TYPE: 'PROCEDURE', ARG_COUNT: 0,
          };
          await proc.loadProcedure(found);
        } else {
          if (targetType !== 'TABLE') { setTargetType('TABLE'); proc.reset(); }
          await tbl.loadTable(entry.targetTable);
        }
      } finally { autoSelecting.current = false; }
    };
    run();
  }, [logType, targetMap, proc.oracleProcs.length, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── VRL 적용 → 재시작 모달 + 매핑 탭 전환 안내 ── */
  const handleVrlApplied = useCallback(() => {
    setShowRestart(true);
    setPipelineKey(k => k + 1);
    loadParseRules();
  }, [loadParseRules]);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await apiFetch<{ success: boolean }>('/api/monitor/vector/stop', { method: 'POST' });
      await new Promise(r => setTimeout(r, 1500));
      await apiFetch<{ success: boolean }>('/api/monitor/vector/start', { method: 'POST' });
      setRestartResult({ ok: true, msg: t('aggregator.restarted') });
      setTab('mapping');
    } catch (err) {
      setRestartResult({ ok: false, msg: err instanceof Error ? err.message : 'Restart failed' });
    }
    setRestarting(false);
    setShowRestart(false);
  };

  /* ── 매핑 탭 핸들러 ── */
  const rawSave = targetType === 'TABLE' ? tbl.saveTableMapping : proc.saveProcedureMapping;
  const handleSave = useCallback(async () => { await rawSave(); setPipelineKey(k => k + 1); }, [rawSave]);
  const hasSelection = targetType === 'TABLE' ? !!tbl.selected : !!proc.selectedProc;
  const mappedCount = targetType === 'TABLE'
    ? tbl.registry.filter(r => r.SOURCE_FIELD).length
    : proc.procParams.filter(p => p.SOURCE_FIELD).length;

  const switchTargetType = (type: TargetType) => {
    if (type === targetType) return;
    userSwitched.current = true;
    setTargetType(type);
    tbl.reset();
    proc.reset();
    setSaveMsg('');
  };

  const handleAutoCreated = useCallback(async (name: string, createdLogType: string) => {
    setSaveMsg(t('mapping.createSuccess'));
    setPipelineKey(k => k + 1);
    if (targetType === 'TABLE') {
      await tbl.refreshTables();
      await tbl.loadTable(name);
      setLogType(createdLogType);
      setTimeout(() => tbl.handleAutoMap(), 300);
    } else {
      const freshProcs = await proc.refreshProcs();
      const found = freshProcs.find(p => p.DISPLAY_NAME === name || p.OBJECT_NAME === name)
        ?? { DISPLAY_NAME: name, OBJECT_NAME: name, PACKAGE_NAME: null, OBJECT_TYPE: 'PROCEDURE', ARG_COUNT: 0 };
      await proc.loadProcedure(found);
      setLogType(createdLogType);
    }
  }, [targetType, tbl, proc, t]);

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="swap_horiz" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-info to-primary">
            VRL & {t('mapping.title')}
          </span>
        </h1>
        {restartResult && (
          <span className={`text-xs font-medium ${restartResult.ok ? 'text-success' : 'text-error'}`}>
            {restartResult.msg}
          </span>
        )}
      </div>

      {/* 메인 레이아웃: 사이드패널 + 탭 */}
      <div className="flex gap-0 border border-border dark:border-border-dark rounded-xl overflow-hidden bg-background-white dark:bg-background-dark min-h-[600px]">
        {/* 설비 사이드 패널 */}
        <EquipmentSidePanel
          agents={agents}
          selected={selectedEquip}
          onSelect={setSelectedEquip}
        />

        {/* 탭 영역 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* 탭 헤더 */}
          <div className="flex items-center border-b border-border dark:border-border-dark">
            <button
              onClick={() => setTab('vrl')}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold transition-colors border-b-2
                ${tab === 'vrl'
                  ? 'border-info text-info'
                  : 'border-transparent text-muted-foreground hover:text-text dark:hover:text-white'}`}
            >
              <Icon name="science" size="xs" />
              VRL
            </button>
            <button
              onClick={() => setTab('mapping')}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold transition-colors border-b-2
                ${tab === 'mapping'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-text dark:hover:text-white'}`}
            >
              <Icon name="swap_horiz" size="xs" />
              {t('mapping.title')}
            </button>
            {/* 매핑 탭: 저장 버튼 */}
            {tab === 'mapping' && hasSelection && (
              <div className="ml-auto pr-4 flex items-center gap-2">
                {saveMsg && (
                  <span className={`text-xs font-medium ${saveMsg.startsWith(t('mapping.error')) ? 'text-error' : 'text-success'}`}>
                    {saveMsg}
                  </span>
                )}
                <Button variant="primary" size="sm" leftIcon="save" onClick={handleSave} disabled={saving}>
                  {saving ? t('mapping.saving') : t('mapping.save')}
                </Button>
              </div>
            )}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="flex-1 p-4 overflow-y-auto">
            {!selectedEquip ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Icon name="touch_app" size="xl" className="opacity-30" />
                <p className="text-sm">{t('vrlMapping.selectEquipment')}</p>
              </div>
            ) : tab === 'vrl' ? (
              /* ── VRL 탭 ── */
              <div className="flex flex-col gap-3">
                <AiVrlGenerator
                  equipmentType={selectedEquip}
                  sampleLog={sampleLog}
                  onGenerated={code => { setVrlCode(code); setCodeFromServer(false); }}
                  logStructure={logStructure} onLogStructureChange={setLogStructure}
                  multiRowMode={multiRowMode} onMultiRowModeChange={setMultiRowMode}
                  hasHeader={hasHeader} onHasHeaderChange={setHasHeader}
                  headerLines={headerLines} onHeaderLinesChange={setHeaderLines}
                  startRow={startRow} onStartRowChange={setStartRow}
                  kvDelimiter={kvDelimiter} onKvDelimiterChange={setKvDelimiter}
                  sectionMarkers={sectionMarkers} onSectionMarkersChange={setSectionMarkers}
                />
                <VrlEditor
                  equipmentType={selectedEquip}
                  sampleLog={sampleLog} onSampleLogChange={setSampleLog}
                  vrlCode={vrlCode} onVrlCodeChange={setVrlCode}
                  onResult={setVrlResult} result={vrlResult}
                  onApplied={handleVrlApplied}
                  codeFromServer={codeFromServer} onCodeFromServerChange={setCodeFromServer}
                />
                <VrlResultPanel result={vrlResult} />
              </div>
            ) : (
              /* ── 매핑 탭 ── */
              <div className="space-y-4">
                {/* 타겟 유형 토글 */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                      {t('mapping.targetType')}
                    </span>
                    <div className="flex rounded-lg border border-border dark:border-border-dark overflow-hidden">
                      <button onClick={() => switchTargetType('TABLE')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all
                          ${targetType === 'TABLE'
                            ? 'bg-primary text-white'
                            : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}>
                        <Icon name="table_chart" size="xs" />
                        {t('mapping.targetTable')}
                      </button>
                      <button onClick={() => switchTargetType('PROCEDURE')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all border-l border-border dark:border-border-dark
                          ${targetType === 'PROCEDURE'
                            ? 'bg-primary text-white'
                            : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}>
                        <Icon name="terminal" size="xs" />
                        {t('mapping.targetProcedure')}
                      </button>
                    </div>
                  </div>
                  <label className={`flex items-center gap-1.5 cursor-pointer select-none
                    ${forceRecreate ? 'text-error' : 'text-muted-foreground'}`}>
                    <input type="checkbox" checked={forceRecreate} onChange={e => setForceRecreate(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-border accent-error cursor-pointer" />
                    <Icon name="warning" size="xs" className={forceRecreate ? 'text-error' : 'text-muted-foreground/50'} />
                    <span className="text-xs font-bold">
                      {targetType === 'TABLE' ? t('mapping.forceRecreateTable') : t('mapping.forceRecreateProc')}
                    </span>
                  </label>
                </div>

                {/* 매핑 메인 */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <SelectionPanel
                    targetType={targetType}
                    tables={tbl.tables} filteredTables={tbl.filteredTables} selected={tbl.selected}
                    tableFilter={tbl.tableFilter} onTableFilterChange={tbl.setTableFilter} onSelectTable={tbl.loadTable}
                    oracleProcs={proc.oracleProcs} filteredProcs={proc.filteredProcs} selectedProc={proc.selectedProc}
                    procFilter={proc.procFilter} onProcFilterChange={proc.setProcFilter} onSelectProcedure={proc.loadProcedure}
                    onAutoCreate={() => setAutoCreateOpen(true)}
                  />
                  <div className="lg:col-span-3 space-y-4">
                    {loading ? (
                      <div className="flex justify-center py-16">
                        <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
                      </div>
                    ) : !hasSelection ? (
                      <div className="text-center py-16">
                        <Icon name="touch_app" size="xl" className="text-muted-foreground opacity-30 mx-auto mb-3" />
                        <p className="text-base text-muted-foreground">{t('mapping.selectPrompt')}</p>
                      </div>
                    ) : (
                      <div className="border border-border dark:border-border-dark rounded-xl overflow-hidden">
                        {targetType === 'TABLE' ? (
                          <>
                            <div className="px-4 py-3 border-b border-border dark:border-border-dark flex items-center gap-3">
                              <Icon name="table_chart" size="xs" className="text-muted-foreground" />
                              <span className="font-mono text-base font-bold text-primary">{tbl.selected}</span>
                              <span className="text-sm text-muted-foreground">{tbl.columns.length} {t('mapping.columns')}</span>
                              {logType && <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-primary/10 text-text dark:text-white">{logType}</span>}
                              {mappedCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success/10 text-text dark:text-white">
                                  {mappedCount} {t('mapping.mapped')}
                                </span>
                              )}
                            </div>
                            <MappingTable
                              columns={tbl.columns} registry={tbl.registry}
                              logType={logType} parseRules={parseRules} onUpdate={tbl.updateRegistry}
                            />
                          </>
                        ) : (
                          <ProcedureMapping
                            procedureName={proc.procName} params={proc.procParams}
                            logType={logType} parseRules={parseRules} onParamsChange={proc.setProcParams}
                            callMode={proc.callMode} onCallModeChange={proc.setCallMode}
                            arrayTypeName={proc.arrayTypeName} onArrayTypeNameChange={proc.setArrayTypeName}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vector 재시작 모달 */}
      <Modal isOpen={showRestart} onClose={() => setShowRestart(false)} title={t('aggregator.restartPrompt')} size="sm">
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => { setShowRestart(false); setTab('mapping'); }}>
            {t('aggregator.later')}
          </Button>
          <Button variant="primary" leftIcon="restart_alt" onClick={handleRestart} disabled={restarting}>
            {restarting ? t('aggregator.restarting') : t('aggregator.restart')}
          </Button>
        </div>
      </Modal>

      {/* 자동 생성 모달 */}
      <AutoCreateModal
        isOpen={autoCreateOpen} onClose={() => setAutoCreateOpen(false)}
        targetType={targetType} parseRules={parseRules} onCreated={handleAutoCreated}
        initialLogType={logType ?? undefined} forceRecreate={forceRecreate}
      />
    </>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/vrl-mapping/page.tsx
git commit -m "feat(vrl-mapping): 통합 페이지 생성 — 설비 사이드패널 + VRL/매핑 탭"
```

---

### Task 6: 사이드바 메뉴 업데이트 + i18n 키 추가

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx:8-21`
- Modify: `frontend/src/locales/ko.json` (i18n 한국어)
- Modify: `frontend/src/locales/en.json` (i18n 영어)

- [ ] **Step 1: Sidebar.tsx NAV_ITEMS 수정**

`Sidebar.tsx`의 NAV_ITEMS에서 simulator와 mapping 항목을 제거하고, vrl-mapping 항목을 추가한다.

```tsx
const NAV_ITEMS = [
  { labelKey: 'nav.serverDashboard', icon: 'dns', href: '/dashboard' },
  { labelKey: 'nav.equipmentDashboard', icon: 'devices', href: '/dashboard/equipment' },
  { labelKey: 'nav.sender', icon: 'upload', href: '/dashboard/sender' },
  { labelKey: 'nav.receiver', icon: 'download', href: '/dashboard/receiver' },
  { labelKey: 'nav.vrlMapping', icon: 'swap_horiz', href: '/dashboard/vrl-mapping' },
  { labelKey: 'nav.logFileSearch', icon: 'folder_open', href: '/dashboard/log-files' },
  { labelKey: 'nav.systemLogs', icon: 'terminal', href: '/dashboard/system-logs' },
  { labelKey: 'nav.upload', icon: 'cloud_upload', href: '/dashboard/upload' },
  { labelKey: 'nav.download', icon: 'file_download', href: '/dashboard/download' },
  { labelKey: 'nav.settings', icon: 'settings', href: '/dashboard/settings' },
  { labelKey: 'nav.help', icon: 'help', href: '/dashboard/help' },
];
```

- [ ] **Step 2: i18n 한국어 키 추가**

`ko.json`에 다음 키 추가:

```json
{
  "nav.vrlMapping": "VRL & 매핑",
  "vrlMapping.incomplete": "미완료",
  "vrlMapping.complete": "완료",
  "vrlMapping.noEquipment": "등록된 설비가 없습니다",
  "vrlMapping.selectEquipment": "왼쪽에서 설비를 선택하세요"
}
```

- [ ] **Step 3: i18n 영어 키 추가**

`en.json`에 다음 키 추가:

```json
{
  "nav.vrlMapping": "VRL & Mapping",
  "vrlMapping.incomplete": "Incomplete",
  "vrlMapping.complete": "Complete",
  "vrlMapping.noEquipment": "No equipment registered",
  "vrlMapping.selectEquipment": "Select equipment from the left panel"
}
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/layout/Sidebar.tsx frontend/src/locales/ko.json frontend/src/locales/en.json
git commit -m "feat(vrl-mapping): 사이드바 메뉴 통합 + i18n 키 추가"
```

---

### Task 7: 빌드 검증 + 최종 커밋

**Files:** None (검증만)

- [ ] **Step 1: 빌드 검증**

```bash
cd frontend && npx next build
```

Expected: 빌드 성공, 에러 없음

- [ ] **Step 2: 브라우저에서 `/dashboard/vrl-mapping` 접속 확인**

확인 항목:
- 왼쪽 설비 사이드 패널에 완료/미완료 그룹 표시
- 설비 선택 시 VRL 탭에 기존 코드 로드
- AI 생성 영역 접이식 동작
- 매핑 탭 전환 시 테이블/프로시저 선택 가능
- 사이드바에 "VRL & 매핑" 메뉴만 표시 (Simulator, Target Mapping 제거)
