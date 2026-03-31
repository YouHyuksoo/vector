/**
 * @file components/VrlEditor.tsx
 * @description VRL 코드 편집기 — VRL 코드(좌) + 시뮬레이션 결과(우) + 버튼
 *
 * 초보자 가이드:
 * 1. 좌측: VRL 코드 편집 (설비 선택 시 서버에서 기존 코드 로드)
 * 2. 우측: 시뮬레이션 결과 표시
 * 3. 시뮬레이션: vector.exe vrl 명령 실행 → 결과를 onResult로 전달
 * 4. 검증: 샘플 로그 없이 VRL 문법만 체크
 * 5. 적용: aggregator TOML에 VRL 코드 삽입 → onApplied 호출
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import VrlResultPanel from './VrlResultPanel';

export interface SimResult {
  success: boolean;
  output?: Record<string, unknown>;
  fields?: Array<{ name: string; value: unknown }>;
  error?: string;
}

interface Props {
  equipmentType: string;
  logType: string;
  onLogTypeChange: (v: string) => void;
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
  equipmentType, logType,
  sampleLog,
  vrlCode, onVrlCodeChange, onResult, onApplied,
  codeFromServer, onCodeFromServerChange, result,
}: Props) {
  const { t } = useI18n();
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateMsg, setValidateMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setApplyMsg(null);
    setValidateMsg(null);
    onResult(null);
  }, [equipmentType]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleValidate = async () => {
    setValidating(true);
    setValidateMsg(null);
    try {
      const data = await apiFetch<{ success: boolean; error?: string }>('/api/monitor/vrl/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrlCode }),
      });
      setValidateMsg(data.success
        ? { ok: true, msg: t('vrlSim.validateOk') }
        : { ok: false, msg: data.error || 'Validation failed' });
    } catch (err) {
      setValidateMsg({ ok: false, msg: err instanceof Error ? err.message : 'Validation failed' });
    }
    setValidating(false);
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
        {/* 좌측: VRL 파싱 코드 */}
        <Card noPadding className="flex-1 min-w-0">
          <div className="flex flex-col gap-2 p-4 h-full">
            <label className="text-xs font-medium text-muted-foreground">{t('vrlSim.vrlCode')}</label>
            <textarea
              value={vrlCode}
              onChange={e => { onVrlCodeChange(e.target.value); onCodeFromServerChange(false); }}
              placeholder={t('vrlSim.vrlCodePlaceholder')}
              className="w-full flex-1 min-h-[250px] px-3 py-2 text-xs font-mono border rounded-lg resize-y
                bg-white dark:bg-slate-800 border-border"
            />
          </div>
        </Card>

        {/* 우측: 시뮬레이션 결과 */}
        <div className="flex-1 min-w-0">
          {result ? (
            <VrlResultPanel result={result} />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center">
                <Icon name="science" size="xl" className="text-muted-foreground opacity-20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">{t('vrlSim.noResult')}</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="primary" leftIcon="play_arrow" onClick={handleSimulate}
          disabled={simulating || !sampleLog || !vrlCode}>
          {simulating ? t('vrlSim.simulating') : t('vrlSim.simulate')}
        </Button>
        <Button variant="ghost" leftIcon="check_circle" onClick={handleValidate}
          disabled={validating || !vrlCode}>
          {validating ? t('vrlSim.validating') : t('vrlSim.validate')}
        </Button>
        <Button variant="ghost" leftIcon="upload" onClick={handleApply}
          disabled={applying || !vrlCode || (!result?.success && !codeFromServer)}>
          {applying ? t('vrlSim.applying') : t('vrlSim.apply')}
        </Button>
        {validateMsg && (
          <span className={`text-xs whitespace-pre-wrap ${validateMsg.ok ? 'text-success' : 'text-error'}`}>{validateMsg.msg}</span>
        )}
        {applyMsg && (
          <span className={`text-xs ${applyMsg.ok ? 'text-success' : 'text-error'}`}>{applyMsg.msg}</span>
        )}
      </div>
    </div>
  );
}
