/**
 * @file components/ProcedureMapping.tsx
 * @description 프로시져 파라미터 매핑 컴포넌트 — Oracle 파라미터에 소스 필드 매핑
 *
 * 초보자 가이드:
 * 1. Oracle DB에서 가져온 프로시져 파라미터(ARGUMENT_NAME, DATA_TYPE, IN_OUT) 표시
 * 2. 각 파라미터에 소스 필드를 드롭다운/텍스트로 매핑
 * 3. 설비 유형 선택 시 드롭다운으로 소스 필드 선택 가능
 */
'use client';

import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { LogType, ParseField, ProcedureParam, ProcedureCallMode } from '../types';
import { getMergedFields } from '../mapping-utils';

interface Props {
  procedureName: string;
  params: ProcedureParam[];
  logType: LogType | null;
  parseRules: Record<string, ParseField[]>;
  onParamsChange: (params: ProcedureParam[]) => void;
  callMode: ProcedureCallMode;
  onCallModeChange: (mode: ProcedureCallMode) => void;
  arrayTypeName: string;
  onArrayTypeNameChange: (name: string) => void;
}

export default function ProcedureMapping({
  procedureName, params, logType, parseRules, onParamsChange,
  callMode, onCallModeChange, arrayTypeName, onArrayTypeNameChange,
}: Props) {
  const { t } = useI18n();
  const availableFields = logType ? getMergedFields(logType, parseRules) : [];
  const updateParam = (idx: number, field: keyof ProcedureParam, value: string | number) => {
    onParamsChange(params.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };
  const mappedCount = params.filter(p => p.SOURCE_FIELD).length;

  return (
    <div className="space-y-3">
      <div className="px-4 py-3 border-b border-border dark:border-border-dark flex items-center gap-3">
        <Icon name="terminal" size="xs" className="text-muted-foreground" />
        <span className="font-mono text-sm font-bold text-primary">{procedureName}</span>
        <span className="text-sm text-muted-foreground">{params.length} {t('mapping.params')}</span>
        {mappedCount > 0 && (
          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success/10 text-success">
            {mappedCount} {t('mapping.mapped')}
          </span>
        )}
      </div>
      <div className="mx-4 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          {t('mapping.callMode')}
        </span>
        <div className="flex rounded-lg border border-border dark:border-border-dark overflow-hidden">
          <button onClick={() => onCallModeChange('NAMED')}
            className={`px-3 py-1.5 text-sm font-bold transition-all
              ${callMode === 'NAMED'
                ? 'bg-primary text-white'
                : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}>
            {t('mapping.callModeNamed')}
          </button>
          <button onClick={() => onCallModeChange('ARRAY')}
            className={`px-3 py-1.5 text-sm font-bold transition-all border-l border-border dark:border-border-dark
              ${callMode === 'ARRAY'
                ? 'bg-primary text-white'
                : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}>
            {t('mapping.callModeArray')}
          </button>
        </div>
        {callMode === 'ARRAY' && (
          <input type="text" value={arrayTypeName}
            onChange={e => onArrayTypeNameChange(e.target.value.toUpperCase())}
            placeholder={t('mapping.arrayTypeNamePlaceholder')}
            className="px-3 py-1.5 rounded-lg text-sm font-mono
              bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
              text-text dark:text-white placeholder:text-muted-foreground/50
              focus:outline-none focus:ring-1 focus:ring-primary/50 w-56" />
        )}
      </div>
      <div className="mx-4 flex items-center gap-2 p-3 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20">
        <Icon name="info" size="sm" className="text-primary shrink-0" />
        <span className="text-sm text-text dark:text-white">{t('mapping.procedureDesc')}</span>
      </div>
      {params.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">파라미터 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
                <th className="text-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-12" />
                <th className="text-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-12">{t('mapping.paramOrder')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('mapping.argumentName')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-28">{t('mapping.dataType')}</th>
                <th className="text-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-16">{t('mapping.inOut')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('mapping.sourceField')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-20">{t('mapping.required')}</th>
              </tr>
            </thead>
            <tbody>
              {params.map((param, idx) => {
                const isMapped = !!param.SOURCE_FIELD;
                return (
                  <tr key={param.ARGUMENT_NAME}
                    className={`border-b border-border/50 dark:border-border-dark/50 transition-colors
                      ${isMapped ? 'bg-success/5 dark:bg-success/5' : 'hover:bg-surface/50 dark:hover:bg-background-dark/50'}`}>
                    <td className="px-4 py-2 text-center">
                      {isMapped && <Icon name="check_circle" size="xs" className="text-success" />}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-flex items-center justify-center size-7 rounded-full bg-primary/10 text-primary text-sm font-bold font-mono">
                        {param.PARAM_ORDER}
                      </span>
                    </td>
                    <td className="px-4 py-2"><span className="font-mono text-sm font-bold">{param.ARGUMENT_NAME}</span></td>
                    <td className="px-4 py-2"><span className="text-sm text-muted-foreground font-mono">{param.DATA_TYPE}</span></td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded
                        ${param.IN_OUT === 'IN' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                        {param.IN_OUT}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {logType ? (
                        <select value={param.SOURCE_FIELD} onChange={e => updateParam(idx, 'SOURCE_FIELD', e.target.value)}
                          className={`w-full px-2 py-1.5 rounded text-sm font-mono
                            bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                            text-text dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/50
                            ${isMapped ? 'border-success/30' : ''}`}>
                          <option value="">{t('mapping.selectField')}</option>
                          {availableFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={param.SOURCE_FIELD}
                          onChange={e => updateParam(idx, 'SOURCE_FIELD', e.target.value)}
                          placeholder={t('mapping.placeholder')}
                          className="w-full px-2 py-1.5 rounded text-sm font-mono
                            bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                            text-text dark:text-white placeholder:text-muted-foreground/50
                            focus:outline-none focus:ring-1 focus:ring-primary/50" />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <select value={param.IS_REQUIRED} onChange={e => updateParam(idx, 'IS_REQUIRED', e.target.value)}
                        className="px-2 py-1.5 rounded text-sm bg-surface dark:bg-surface-dark border border-border dark:border-border-dark text-text dark:text-white">
                        <option value="N">{t('mapping.no')}</option>
                        <option value="Y">{t('mapping.yes')}</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
