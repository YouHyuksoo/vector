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

const EQUIPMENT_TYPES = [
  'SP', 'SPI', 'MAOI', 'AOI', 'REFLOW', 'ICT', 'FCT',
  'BURNIN', 'HIPOT', 'EOL', 'METALMASK', 'MOUNTER', 'VISCOSITY',
] as const;


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
  const [equipmentType, setEquipmentType] = useState('AOI');
  const [logType, setLogType] = useState('');
  const [sampleLog, setSampleLog] = useState('');
  const [vrlCode, setVrlCode] = useState('');
  const [result, setResult] = useState<SimResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI 관련 상태
  const [aiModels, setAiModels] = useState<AiModel[]>([]);
  const [selectedAi, setSelectedAi] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  /** 활성화된 AI 모델 목록 로드 */
  useEffect(() => {
    apiFetch<{ models: AiModel[] }>('/api/monitor/ai/models')
      .then(r => {
        setAiModels(r.models);
        if (r.models.length > 0) setSelectedAi(r.models[0].name);
      })
      .catch(() => {});
  }, []);

  const loadExistingCode = useCallback(async (type: string) => {
    setLoadingCode(true);
    try {
      const res = await apiFetch<{ code: string }>(`/api/monitor/vrl/code/${type}`);
      setVrlCode(res.code || '');
    } catch { setVrlCode(''); }
    setLoadingCode(false);
  }, []);

  useEffect(() => { loadExistingCode(equipmentType); }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') setSampleLog(reader.result); };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTypeChange = (type: string) => {
    setEquipmentType(type);
    setResult(null);
    setApplyMsg(null);
    setAiError('');
    loadExistingCode(type);
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
          body: JSON.stringify({ provider: selectedAi, sampleLog, equipmentType, userInstruction: aiPrompt }),
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

      {/* 입력 영역 */}
      <Card noPadding>
        <div className="flex flex-col gap-3 p-4">
          {/* 설비 유형 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t('vrlSim.equipType')}
            </label>
            <div className="flex flex-wrap gap-1">
              {EQUIPMENT_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                    equipmentType === type
                      ? 'bg-primary text-white'
                      : 'bg-muted dark:bg-muted/50 text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

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

          {/* 샘플 로그 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t('vrlSim.sampleLog')}
              </label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
              >
                <Icon name="upload_file" size="xs" />
                {t('vrlSim.uploadFile')}
              </button>
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
              className="w-full h-24 px-3 py-2 text-xs font-mono border rounded-lg resize-y
                bg-white dark:bg-slate-800 border-border"
            />
          </div>

          {/* AI 생성 영역 */}
          {aiModels.length > 0 && (
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
            </div>
          )}

          {/* VRL 코드 */}
          <div>
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
              className="w-full h-36 px-3 py-2 text-xs font-mono border rounded-lg resize-y
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
