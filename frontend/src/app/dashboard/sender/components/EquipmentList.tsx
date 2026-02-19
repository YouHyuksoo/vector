/**
 * @file src/app/dashboard/sender/components/EquipmentList.tsx
 * @description 설비 목록 좌측 패널 - 설비 선택, 추가, 삭제 버튼 제공
 */
'use client';

import { Icon, Button, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface EquipmentListProps {
  names: string[];
  selected: string | null;
  onSelect: (name: string) => void;
  onAdd: () => void;
  onDelete: () => void;
}

export function EquipmentList({ names, selected, onSelect, onAdd, onDelete }: EquipmentListProps) {
  const { t } = useI18n();

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
        {names.map(name => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all duration-200 text-sm
              ${selected === name
                ? 'bg-accent/10 text-accent border border-accent/30 font-bold'
                : 'bg-surface dark:bg-surface-dark hover:bg-accent/5 dark:hover:bg-accent/5 text-text dark:text-white border border-transparent'
              }`}
          >
            <Icon
              name={selected === name ? 'radio_button_checked' : 'radio_button_unchecked'}
              size="xs"
              className={selected === name ? 'text-accent' : 'text-muted-foreground'}
            />
            <span className="flex-1">{name}</span>
          </button>
        ))}

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
