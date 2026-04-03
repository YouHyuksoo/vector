/**
 * @file src/app/dashboard/mapping/components/ParseRuleEditor.tsx
 * @description 설비 유형별 VRL 파싱 필드 뷰어 (읽기 전용)
 *
 * 초보자 가이드:
 * 1. aggregator TOML의 VRL 코드에서 data.* 필드를 실시간 추출하여 표시
 * 2. 설비 유형을 선택하면 해당 설비의 파싱 필드 목록을 표시
 * 3. 필드 수정은 VRL 코드를 직접 편집해야 함 (수신기 설정 페이지)
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Modal } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { LogType, ParseField } from '../types';
import { getLogTypesFromRules } from '../mapping-utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parseRules: Record<string, ParseField[]>;
  onSaved: () => void;
  selectedType?: LogType | null;
}

export default function ParseRuleEditor({ isOpen, onClose, parseRules, onSaved, selectedType }: Props) {
  const { t } = useI18n();
  const logTypes = getLogTypesFromRules(parseRules);
  const [eqType, setEqType] = useState<LogType>(selectedType || logTypes[0] || '');

  useEffect(() => {
    if (!isOpen) return;
    if (selectedType && (parseRules[selectedType] || []).length > 0) {
      setEqType(selectedType);
      return;
    }
    const types = getLogTypesFromRules(parseRules);
    const first = types.find(lt => (parseRules[lt] || []).length > 0);
    if (first) setEqType(first);
  }, [isOpen, selectedType, parseRules]);

  const fields = (parseRules[eqType] || []).map(f => ({ fieldName: f.fieldName, fieldLabel: f.fieldLabel }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('parseRule.edit')} size="full">
      <div className="space-y-4">
        {/* VRL 실시간 추출 안내 */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20">
          <Icon name="sync" size="sm" className="text-primary" />
          <span className="text-sm text-text dark:text-white">VRL 코드에서 실시간 추출된 필드입니다. 수정은 수신기 설정에서 VRL을 편집하세요.</span>
        </div>

        {/* 설비 유형 선택 */}
        <div className="flex flex-wrap gap-1.5">
          {logTypes.map(lt => {
            const hasFields = (parseRules[lt] || []).length > 0;
            return (
              <button key={lt} onClick={() => hasFields && setEqType(lt)} disabled={!hasFields}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all
                  ${eqType === lt
                    ? 'bg-primary text-white'
                    : hasFields
                      ? 'bg-success/10 text-text dark:text-white border border-success/30 cursor-pointer'
                      : 'bg-surface dark:bg-surface-dark text-muted-foreground/30 border border-border dark:border-border-dark cursor-not-allowed'}`}>
                {lt}
              </button>
            );
          })}
        </div>

        {/* 필드 목록 */}
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t('parseRule.empty')}</p>
        ) : (
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {fields.map((f, idx) => (
              <div key={f.fieldName}
                className="flex items-center px-3 py-2 rounded-lg
                  bg-surface dark:bg-surface-dark border border-border/50 dark:border-border-dark/50">
                <span className="text-xs text-muted-foreground font-mono w-6 text-right mr-2">{idx + 1}</span>
                <span className="text-sm font-mono font-medium text-text dark:text-white">{f.fieldName}</span>
              </div>
            ))}
          </div>
        )}

        {/* 하단 정보 */}
        <div className="pt-2 border-t border-border dark:border-border-dark">
          <span className="text-sm text-muted-foreground">{eqType}: {fields.length} {t('parseRule.fieldName')}</span>
        </div>
      </div>
    </Modal>
  );
}
