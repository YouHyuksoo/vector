/**
 * @file components/pipeline/EquipmentSidePanel.tsx
 * @description 설비 사이드 패널 공통 컴포넌트 — 완료/미완료 그룹 분리, 선택 콜백, sender 전용 기능(추가/삭제/설명 편집) 옵션 제공
 *
 * 초보자 가이드:
 * 1. **기본 사용** (vrl-mapping): agents + selected + onSelect 만 전달
 * 2. **sender 사용**: 위 3개 + onAdd, onDelete, descriptions, onDescriptionUpdate, fluentMode, names 추가 전달
 * 3. **완료 기준**: fluentMode=true면 항상 미완료, 아니면 doneCount === 5 여야 완료
 * 4. **names prop**: fluent 모드처럼 agents 맵에 없는 이름도 처리할 때 사용
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon, Button } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { PipelineStatusMap } from '@/hooks/usePipelineStatus';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface Props {
  /** 파이프라인 상태 맵 (equipmentType → 상태) */
  agents: PipelineStatusMap;
  /** 현재 선택된 설비 이름 */
  selected: string | null;
  /** 설비 선택 콜백 */
  onSelect: (name: string) => void;

  // ── sender 전용 옵션 props ──
  /** 설비 추가 버튼 클릭 핸들러 (제공 시 + 버튼 노출) */
  onAdd?: () => void;
  /** 설비 삭제 버튼 클릭 핸들러 (제공 시 선택 항목 있을 때 삭제 버튼 노출) */
  onDelete?: () => void;
  /** 설비별 설명 문자열 맵 (제공 시 이름 아래 설명 표시) */
  descriptions?: Record<string, string>;
  /** 설명 인라인 편집 저장 콜백 */
  onDescriptionUpdate?: (name: string, desc: string) => void;
  /** Fluent Bit 모드 — true면 항상 미완료 + CONF 배지 표시 */
  fluentMode?: boolean;
  /** 명시적 이름 목록 (fluent 모드 등 agents 맵에 없는 이름 포함 시 사용) */
  names?: string[];
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function EquipmentSidePanel({
  agents,
  selected,
  onSelect,
  onAdd,
  onDelete,
  descriptions,
  onDescriptionUpdate,
  fluentMode = false,
  names,
}: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  // 표시할 이름 목록 결정: names prop이 있으면 그것 사용, 없으면 agents 키 사용
  const allNames: string[] = names ?? Object.keys(agents);

  const isComplete = (name: string) => {
    if (fluentMode) return false;
    const entry = agents[name];
    return (entry?.doneCount ?? 0) >= 5;
  };

  const incomplete = allNames.filter(n => !isComplete(n));
  const complete = allNames.filter(n => isComplete(n));

  // ── 인라인 편집 핸들러 ──
  const startEdit = (name: string, e: React.MouseEvent) => {
    if (!onDescriptionUpdate) return;
    e.stopPropagation();
    setEditing(name);
    setEditValue(descriptions?.[name] || '');
  };

  const saveEdit = () => {
    if (editing && onDescriptionUpdate) {
      onDescriptionUpdate(editing, editValue.trim());
    }
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditing(null);
  };

  // ── 개별 아이템 렌더 ──
  const renderItem = (name: string) => {
    const entry = agents[name];
    const doneCount = entry?.doneCount ?? 0;
    const isActive = selected === name;
    const desc = descriptions?.[name];
    const isEd = editing === name;

    return (
      <button
        key={name}
        onClick={() => onSelect(name)}
        className={`w-full flex flex-col px-3 py-2 rounded-lg text-sm transition-colors text-left
          ${isActive
            ? 'bg-primary text-white font-bold'
            : 'text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark'}`}
      >
        <div className="flex items-center justify-between w-full">
          <span className="font-mono text-xs truncate">{name}</span>
          {fluentMode ? (
            <span className={`px-1 py-px rounded text-[8px] font-bold uppercase leading-none
              ${isActive ? 'bg-white/20 text-white' : 'bg-info/10 text-text dark:text-white'}`}>
              CONF
            </span>
          ) : (
            <span className={`text-[10px] font-bold shrink-0 ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>
              {doneCount}/5
            </span>
          )}
        </div>

        {/* 설명 영역 */}
        {desc && !isEd && (
          <span
            className={`text-[10px] truncate mt-0.5 ${isActive ? 'text-white/70' : 'text-muted-foreground'}`}
            onClick={e => startEdit(name, e)}
          >
            {desc}
          </span>
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
            className="mt-0.5 text-[10px] bg-white dark:bg-slate-800 border border-primary/40 rounded px-1 py-0.5 w-full
              text-text dark:text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        )}
      </button>
    );
  };

  // ── 그룹 렌더 헬퍼 ──
  const renderGroup = (
    label: string,
    icon: string,
    colorClass: string,
    items: string[],
  ) => (
    <div>
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Icon name={icon} size="xs" className={colorClass} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>
          {label} ({items.length})
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map(renderItem)}
      </div>
    </div>
  );

  return (
    <div className="w-52 shrink-0 border-r border-border dark:border-border-dark overflow-y-auto flex flex-col">
      {/* 추가/삭제 버튼 영역 */}
      {(onAdd || onDelete) && (
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border dark:border-border-dark">
          {onAdd && (
            <Button variant="ghost" leftIcon="add" onClick={onAdd} className="!text-xs !py-1 flex-1">
              {t('sender.add')}
            </Button>
          )}
          {onDelete && selected && (
            <Button
              variant="ghost"
              leftIcon="delete"
              onClick={onDelete}
              className="!text-xs !py-1 !text-error hover:!bg-error/10"
            >
              {t('sender.delete')}
            </Button>
          )}
        </div>
      )}

      {/* 목록 영역 */}
      <div className="p-3 space-y-4 flex-1">
        {incomplete.length > 0 && renderGroup(
          t('vrlMapping.incomplete'),
          'pending',
          'text-warning',
          incomplete,
        )}

        {complete.length > 0 && renderGroup(
          t('vrlMapping.complete'),
          'check_circle',
          'text-success',
          complete,
        )}

        {allNames.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t('vrlMapping.noEquipment')}
          </p>
        )}
      </div>
    </div>
  );
}
