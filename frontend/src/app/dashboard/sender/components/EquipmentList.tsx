/**
 * @file src/app/dashboard/sender/components/EquipmentList.tsx
 * @description 설비 목록 좌측 패널 — 설비 선택, 설명 표시/인라인 편집, 추가/삭제
 *
 * 초보자 가이드:
 * 1. **names**: 등록된 설비 이름 배열
 * 2. **descriptions**: 설비명 → 설명 매핑 (descriptions.json 기반)
 * 3. **인라인 편집**: 설명 영역 클릭 시 입력 모드, Enter/blur로 저장
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon, Button, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface EquipmentListProps {
  names: string[];
  descriptions: Record<string, string>;
  selected: string | null;
  onSelect: (name: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onDescriptionUpdate: (name: string, desc: string) => void;
}

export function EquipmentList({ names, descriptions, selected, onSelect, onAdd, onDelete, onDescriptionUpdate }: EquipmentListProps) {
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
      </div>

      <div className="flex flex-col gap-1.5">
        {names.map(name => {
          const desc = descriptions[name];
          const isSel = selected === name;
          const isEditing = editing === name;

          return (
            <button
              key={name}
              onClick={() => onSelect(name)}
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-left transition-all duration-200 text-sm group
                ${isSel
                  ? 'bg-accent/10 text-accent border border-accent/30 font-bold'
                  : 'bg-surface dark:bg-surface-dark hover:bg-accent/5 dark:hover:bg-accent/5 text-text dark:text-white border border-transparent'
                }`}
            >
              <Icon
                name={isSel ? 'radio_button_checked' : 'radio_button_unchecked'}
                size="xs"
                className={`mt-0.5 shrink-0 ${isSel ? 'text-accent' : 'text-muted-foreground'}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="truncate">{name}</span>
                  {!isEditing && (
                    <span
                      onClick={e => startEdit(name, e)}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer transition-opacity shrink-0"
                    >
                      <Icon name="edit" size="xs" className="!text-[12px] text-muted-foreground" />
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
                    className="mt-1 w-full text-xs bg-white dark:bg-slate-800 border border-primary/40 rounded px-1.5 py-1
                      text-text dark:text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                ) : desc ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight truncate">{desc}</p>
                ) : null}
              </div>
            </button>
          );
        })}

        {names.length === 0 && (
          <Card className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
            <Icon name="inventory_2" size="lg" />
            <p className="text-xs">{t('sender.empty')}</p>
          </Card>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        <Button variant="ghost" leftIcon="add" onClick={onAdd} className="flex-1 !text-xs !py-1.5">
          {t('sender.add')}
        </Button>
        {selected && (
          <Button variant="ghost" leftIcon="delete" onClick={onDelete} className="!text-xs !py-1.5 !text-error hover:!bg-error/10">
            {t('sender.delete')}
          </Button>
        )}
      </div>
    </div>
  );
}
