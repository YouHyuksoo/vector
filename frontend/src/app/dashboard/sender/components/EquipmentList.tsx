/**
 * @file src/app/dashboard/sender/components/EquipmentList.tsx
 * @description 설비 목록 좌측 패널 — 설비 선택, 통합 5단계 파이프라인 진행률 표시, 설명 인라인 편집
 *
 * 초보자 가이드:
 * 1. **names**: 등록된 설비 이름 배열
 * 2. **descriptions**: 설비명 → 설명 매핑 (descriptions.json 기반)
 * 3. **pipelineStatus**: 설비별 통합 5단계 파이프라인 상태
 * 4. **인라인 편집**: 설명 영역 클릭 시 입력 모드, Enter/blur로 저장
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon, Button, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { PipelineStepBar } from '@/components/pipeline';
import type { PipelineStatusMap } from '@/hooks/usePipelineStatus';

interface EquipmentListProps {
  names: string[];
  descriptions: Record<string, string>;
  pipelineStatus: PipelineStatusMap;
  selected: string | null;
  onSelect: (name: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onDescriptionUpdate: (name: string, desc: string) => void;
}

export function EquipmentList({ names, descriptions, pipelineStatus, selected, onSelect, onAdd, onDelete, onDescriptionUpdate }: EquipmentListProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const startEdit = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(name);
    setEditValue(descriptions[name] || '');
  };

  const saveEdit = () => {
    if (editing) {
      onDescriptionUpdate(editing, editValue.trim());
      setEditing(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditing(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-text dark:text-white flex items-center gap-1.5">
          <Icon name="devices" className="text-accent" size="sm" />
          {t('sender.equipmentList')}
          <span className="text-muted-foreground font-normal">({names.length})</span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" leftIcon="add" onClick={onAdd} className="!text-xs !py-1.5">
            {t('sender.add')}
          </Button>
          {selected && (
            <Button variant="ghost" leftIcon="delete" onClick={onDelete} className="!text-xs !py-1.5 !text-error hover:!bg-error/10">
              {t('sender.delete')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
        {names.map(name => {
          const desc = descriptions[name];
          const isSel = selected === name;
          const isEditing = editing === name;
          const pipeline = pipelineStatus[name];
          const doneCount = pipeline?.doneCount ?? 0;
          const isComplete = doneCount === 5;

          return (
            <button
              key={name}
              onClick={() => onSelect(name)}
              className={`flex flex-col gap-1 px-2.5 py-2 rounded-lg text-left transition-all duration-200 group
                ${isSel
                  ? 'bg-accent/10 text-accent border border-accent/30 font-bold'
                  : isComplete
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-2 border-emerald-400/60 dark:border-emerald-500/40 shadow-sm shadow-emerald-200/50 dark:shadow-emerald-900/30'
                    : 'bg-surface dark:bg-surface-dark hover:bg-accent/5 dark:hover:bg-accent/5 text-text dark:text-white border border-transparent'
                }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon
                  name={isSel ? 'radio_button_checked' : isComplete ? 'check_circle' : 'radio_button_unchecked'}
                  size="xs"
                  className={`shrink-0 ${isSel ? 'text-accent' : isComplete ? 'text-success' : 'text-muted-foreground'}`}
                />
                <span className="text-xs font-bold truncate">{name}</span>
                {pipeline?.targetType && (
                  <span className={`shrink-0 px-1 py-px rounded text-[8px] font-bold uppercase leading-none
                    ${pipeline.targetType === 'PROCEDURE'
                      ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300'
                      : 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300'
                    }`}>
                    {pipeline.targetType === 'PROCEDURE' ? 'PROC' : 'TBL'}
                  </span>
                )}
                {!isEditing && (
                  <span
                    onClick={e => startEdit(name, e)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer transition-opacity shrink-0 ml-auto"
                  >
                    <Icon name="edit" size="xs" className="!text-[11px] text-muted-foreground" />
                  </span>
                )}
              </div>
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={handleKeyDown}
                  onClick={e => e.stopPropagation()}
                  placeholder={t('sender.descPlaceholder')}
                  className="w-full text-[10px] bg-white dark:bg-slate-800 border border-primary/40 rounded px-1.5 py-0.5
                    text-text dark:text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              ) : desc ? (
                <p className="text-[10px] text-muted-foreground leading-tight truncate">{desc}</p>
              ) : null}
              {pipeline && (
                <PipelineStepBar agents={pipelineStatus} agentName={name} compact />
              )}
            </button>
          );
        })}

        {names.length === 0 && (
          <Card className="col-span-full flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
            <Icon name="inventory_2" size="lg" />
            <p className="text-xs">{t('sender.empty')}</p>
          </Card>
        )}
      </div>

    </div>
  );
}
