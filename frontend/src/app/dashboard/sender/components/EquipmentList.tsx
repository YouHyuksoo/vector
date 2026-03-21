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
  fluentMode?: boolean;
}

export function EquipmentList({ names, descriptions, pipelineStatus, selected, onSelect, onAdd, onDelete, onDescriptionUpdate, fluentMode }: EquipmentListProps) {
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

  const isEquipComplete = (name: string) => {
    if (fluentMode) return false;
    const p = pipelineStatus[name];
    return (p?.doneCount ?? 0) === 5;
  };

  const incomplete = names.filter(n => !isEquipComplete(n));
  const complete = names.filter(n => isEquipComplete(n));

  const renderChip = (name: string) => {
    const desc = descriptions[name];
    const isSel = selected === name;
    const isEd = editing === name;
    const pipeline = fluentMode ? undefined : pipelineStatus[name];
    const done = isEquipComplete(name);

    return (
      <button
        key={name}
        onClick={() => onSelect(name)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-left transition-all duration-150 group text-xs
          ${isSel
            ? fluentMode
              ? 'bg-info/10 text-info border border-info/30 font-bold'
              : 'bg-accent/10 text-accent border border-accent/30 font-bold'
            : done
              ? 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-400/60 dark:border-emerald-500/40'
              : 'bg-surface dark:bg-surface-dark hover:bg-accent/5 dark:hover:bg-accent/5 text-text dark:text-white border border-transparent'
          }`}
      >
        <span className="font-bold truncate max-w-[120px]">{name}</span>
        {fluentMode ? (
          <span className="px-1 py-px rounded text-[8px] font-bold uppercase leading-none bg-info/10 text-info">CONF</span>
        ) : pipeline?.targetType ? (
          <span className={`px-1 py-px rounded text-[8px] font-bold uppercase leading-none
            ${pipeline.targetType === 'PROCEDURE'
              ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300'
              : 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300'
            }`}>
            {pipeline.targetType === 'PROCEDURE' ? 'PROC' : 'TBL'}
          </span>
        ) : null}
        {desc && !isEd && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[80px]" onClick={e => startEdit(name, e)}>{desc}</span>
        )}
        {isEd && (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            placeholder={t('sender.descPlaceholder')}
            className="text-[10px] bg-white dark:bg-slate-800 border border-primary/40 rounded px-1 py-0.5 w-20
              text-text dark:text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        )}
      </button>
    );
  };

  return (
    <Card className="p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-text dark:text-white">
          {t('sender.equipmentList')}
          <span className="text-muted-foreground font-normal ml-1">({names.length})</span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" leftIcon="add" onClick={onAdd} className="!text-xs !py-1">
            {t('sender.add')}
          </Button>
          {selected && (
            <Button variant="ghost" leftIcon="delete" onClick={onDelete} className="!text-xs !py-1 !text-error hover:!bg-error/10">
              {t('sender.delete')}
            </Button>
          )}
        </div>
      </div>

      {names.length === 0 && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <p className="text-xs">{t('sender.empty')}</p>
        </div>
      )}

      {incomplete.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            미완료 <span className="font-normal text-muted-foreground">({incomplete.length})</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {incomplete.map(renderChip)}
          </div>
        </div>
      )}

      {complete.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            완료 <span className="font-normal text-muted-foreground">({complete.length})</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {complete.map(renderChip)}
          </div>
        </div>
      )}

    </Card>
  );
}
