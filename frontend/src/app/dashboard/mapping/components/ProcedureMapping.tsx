/**
 * @file src/app/dashboard/mapping/components/ProcedureMapping.tsx
 * @description 프로시져 타겟 매핑 컴포넌트 — 소스 필드를 배열 파라미터로 프로시져에 전송
 *
 * 초보자 가이드:
 * 1. 프로시져명 입력: Oracle 프로시져 이름 (예: PKG_LOG.INSERT_LOG)
 * 2. 파라미터 추가: 소스 필드를 순서대로 배열에 추가
 * 3. 순서가 곧 프로시져 호출 시 배열 인덱스
 * 4. 로그 유형 선택 시 드롭다운으로 소스 필드 선택 가능
 */
'use client';

import { Icon, Button } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { LogType, ParseField, ProcedureParam } from '../types';
import { getMergedFields } from '../types';

interface Props {
  procedureName: string;
  params: ProcedureParam[];
  logType: LogType | null;
  parseRules: Record<string, ParseField[]>;
  onProcedureNameChange: (name: string) => void;
  onParamsChange: (params: ProcedureParam[]) => void;
}

export default function ProcedureMapping({
  procedureName,
  params,
  logType,
  parseRules,
  onProcedureNameChange,
  onParamsChange,
}: Props) {
  const { t } = useI18n();
  const availableFields = logType ? getMergedFields(logType, parseRules) : [];

  const addParam = () => {
    onParamsChange([...params, {
      PARAM_ORDER: params.length + 1,
      SOURCE_FIELD: '',
      IS_REQUIRED: 'N',
    }]);
  };

  const updateParam = (idx: number, field: keyof ProcedureParam, value: string | number) => {
    const updated = params.map((p, i) =>
      i === idx ? { ...p, [field]: value } : p,
    );
    onParamsChange(updated);
  };

  const removeParam = (idx: number) => {
    const updated = params
      .filter((_, i) => i !== idx)
      .map((p, i) => ({ ...p, PARAM_ORDER: i + 1 }));
    onParamsChange(updated);
  };

  const moveParam = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === params.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...params];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    onParamsChange(updated.map((p, i) => ({ ...p, PARAM_ORDER: i + 1 })));
  };

  const mappedCount = params.filter(p => p.SOURCE_FIELD).length;

  return (
    <div className="space-y-3">
      {/* 프로시져명 입력 */}
      <div className="px-4 py-3 border-b border-border dark:border-border-dark flex items-center gap-3">
        <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
          {t('mapping.procedureName')}
        </span>
        <input
          type="text"
          value={procedureName}
          onChange={e => onProcedureNameChange(e.target.value)}
          placeholder={t('mapping.procedurePlaceholder')}
          className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono font-bold
            bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
            text-primary placeholder:text-muted-foreground/50
            focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        {mappedCount > 0 && (
          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success/10 text-success">
            {mappedCount} {t('mapping.mapped')}
          </span>
        )}
      </div>

      {/* 설명 배너 */}
      <div className="mx-4 flex items-center gap-2 p-3 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20">
        <Icon name="info" size="sm" className="text-primary shrink-0" />
        <span className="text-sm text-text dark:text-white">{t('mapping.procedureDesc')}</span>
      </div>

      {/* 파라미터 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
              <th className="text-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-16">
                {t('mapping.paramOrder')}
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('mapping.sourceField')}
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-24">
                {t('mapping.required')}
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-24" />
            </tr>
          </thead>
          <tbody>
            {params.map((param, idx) => {
              const isMapped = !!param.SOURCE_FIELD;
              return (
                <tr key={idx}
                  className={`border-b border-border/50 dark:border-border-dark/50 transition-colors
                    ${isMapped ? 'bg-success/5 dark:bg-success/5' : 'hover:bg-surface/50 dark:hover:bg-background-dark/50'}`}>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-flex items-center justify-center size-7 rounded-full
                      bg-primary/10 text-primary text-sm font-bold font-mono">
                      {param.PARAM_ORDER}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {logType ? (
                      <select
                        value={param.SOURCE_FIELD}
                        onChange={e => updateParam(idx, 'SOURCE_FIELD', e.target.value)}
                        className={`w-full px-2 py-1.5 rounded text-sm font-mono
                          bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                          text-text dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/50
                          ${isMapped ? 'border-success/30' : ''}`}
                      >
                        <option value="">{t('mapping.selectField')}</option>
                        {availableFields.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={param.SOURCE_FIELD}
                        onChange={e => updateParam(idx, 'SOURCE_FIELD', e.target.value)}
                        placeholder={t('mapping.placeholder')}
                        className="w-full px-2 py-1.5 rounded text-sm font-mono
                          bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                          text-text dark:text-white placeholder:text-muted-foreground/50
                          focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={param.IS_REQUIRED}
                      onChange={e => updateParam(idx, 'IS_REQUIRED', e.target.value)}
                      className="px-2 py-1.5 rounded text-sm
                        bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                        text-text dark:text-white"
                    >
                      <option value="N">{t('mapping.no')}</option>
                      <option value="Y">{t('mapping.yes')}</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => moveParam(idx, 'up')} disabled={idx === 0}
                        className="p-1 rounded hover:bg-surface dark:hover:bg-surface-dark
                          text-muted-foreground hover:text-text dark:hover:text-white
                          disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <Icon name="arrow_upward" size="xs" />
                      </button>
                      <button onClick={() => moveParam(idx, 'down')} disabled={idx === params.length - 1}
                        className="p-1 rounded hover:bg-surface dark:hover:bg-surface-dark
                          text-muted-foreground hover:text-text dark:hover:text-white
                          disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <Icon name="arrow_downward" size="xs" />
                      </button>
                      <button onClick={() => removeParam(idx)}
                        className="p-1 rounded hover:bg-error/10 text-muted-foreground hover:text-error transition-colors">
                        <Icon name="close" size="xs" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 파라미터 추가 버튼 */}
      <div className="px-4 pb-3">
        <Button variant="outline" size="sm" leftIcon="add" onClick={addParam}>
          {t('mapping.addParam')}
        </Button>
      </div>
    </div>
  );
}
