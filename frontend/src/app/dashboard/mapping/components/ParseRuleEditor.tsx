/**
 * @file src/app/dashboard/mapping/components/ParseRuleEditor.tsx
 * @description 설비 유형별 VRL 파싱 필드 편집기 (모달)
 *
 * 초보자 가이드:
 * 1. **VRL 동기화**: aggregator TOML의 VRL 코드에서 .data.* 필드를 자동 추출하여 DB에 등록
 * 2. 설비 유형을 선택하면 DB에 저장된 파싱 필드 목록을 표시
 * 3. 필드를 수동 추가/삭제하고 "저장" 시 POST /api/monitor/parse-rules로 전송
 * 4. 저장 후 부모 컴포넌트의 onSaved 콜백으로 필드 목록 갱신
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
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
    // 매핑 페이지에서 선택한 설비가 파싱 완료 상태면 해당 설비로
    if (selectedType && (parseRules[selectedType] || []).length > 0) {
      setEqType(selectedType);
      return;
    }
    // 아니면 파싱 완료된 첫 번째 설비로 자동 선택
    const types = getLogTypesFromRules(parseRules);
    const first = types.find(lt => (parseRules[lt] || []).length > 0);
    if (first) setEqType(first);
  }, [isOpen, selectedType, parseRules]);
  const [fields, setFields] = useState<Array<{ fieldName: string; fieldLabel: string }>>([]);
  const [newField, setNewField] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const dbFields = parseRules[eqType] || [];
    setFields(dbFields.map(f => ({ fieldName: f.fieldName, fieldLabel: f.fieldLabel })));
    setMsg('');
  }, [eqType, parseRules]);

  const addField = () => {
    const name = newField.trim();
    if (!name) return;
    const prefixed = name.startsWith('data.') ? name : `data.${name}`;
    if (fields.some(f => f.fieldName === prefixed)) return;
    setFields(prev => [...prev, { fieldName: prefixed, fieldLabel: prefixed }]);
    setNewField('');
  };

  const removeField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      await apiFetch('/api/monitor/parse-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentType: eqType, fields }),
      });
      setMsg(t('parseRule.saved'));
      onSaved();
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setSaving(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const res = await apiFetch<{ success: boolean; synced: Record<string, number>; details: Record<string, string[]> }>(
        '/api/monitor/parse-rules/sync',
        { method: 'POST' },
      );
      const total = Object.values(res.synced).reduce((a, b) => a + b, 0);
      const types = Object.keys(res.synced).join(', ');
      setMsg(t('parseRule.syncDone').replace('{count}', String(total)).replace('{types}', types));
      onSaved();
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setSyncing(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('parseRule.edit')} size="full">
      <div className="space-y-4">
        {/* VRL 동기화 배너 */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2">
            <Icon name="sync" size="sm" className="text-primary" />
            <span className="text-sm text-text dark:text-white">{t('parseRule.syncDesc')}</span>
          </div>
          <Button variant="primary" size="sm" leftIcon="sync" onClick={handleSync} disabled={syncing}>
            {syncing ? '...' : t('parseRule.sync')}
          </Button>
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
                      ? 'bg-success/10 text-success border border-success/30 cursor-pointer'
                      : 'bg-surface dark:bg-surface-dark text-muted-foreground/30 border border-border dark:border-border-dark cursor-not-allowed'}`}>
                {lt}
              </button>
            );
          })}
        </div>

        {/* 필드 추가 입력 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newField}
            onChange={e => setNewField(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addField()}
            placeholder={t('parseRule.placeholder')}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-mono
              bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
              text-text dark:text-white placeholder:text-muted-foreground/50
              focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button variant="outline" size="sm" leftIcon="add" onClick={addField}>
            {t('parseRule.add')}
          </Button>
        </div>

        {/* 필드 목록 */}
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t('parseRule.empty')}</p>
        ) : (
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {fields.map((f, idx) => (
              <div key={f.fieldName}
                className="flex items-center justify-between px-3 py-2 rounded-lg
                  bg-surface dark:bg-surface-dark border border-border/50 dark:border-border-dark/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono w-6 text-right">{idx + 1}</span>
                  <span className="text-sm font-mono font-medium text-text dark:text-white">{f.fieldName}</span>
                </div>
                <button onClick={() => removeField(idx)}
                  className="p-1 rounded hover:bg-error/10 text-muted-foreground hover:text-error transition-colors">
                  <Icon name="close" size="xs" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 하단 액션 */}
        <div className="flex items-center justify-between pt-2 border-t border-border dark:border-border-dark">
          {msg ? (
            <span className={`text-sm font-medium ${msg.startsWith('Error') ? 'text-error' : 'text-success'}`}>{msg}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{eqType}: {fields.length} {t('parseRule.fieldName')}</span>
          )}
          <Button variant="primary" size="sm" leftIcon="save" onClick={handleSave} disabled={saving}>
            {saving ? '...' : t('parseRule.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
