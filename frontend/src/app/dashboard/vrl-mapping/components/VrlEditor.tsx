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
      <div className="flex gap-4">
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
