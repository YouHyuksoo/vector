/**
 * @file components/EquipmentSidePanel.tsx
 * @description 설비 사이드 패널 — 파이프라인 완료/미완료 그룹 분리, 선택 시 콜백
 *
 * 초보자 가이드:
 * 1. usePipelineStatus로 설비별 5단계 상태 조회
 * 2. vrl/table/mapping 모두 완료 → "완료" 그룹, 아니면 "미완료"
 * 3. 설비 클릭 시 onSelect(equipmentType) 호출
 */
'use client';

import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { PipelineStatusMap } from '@/hooks/usePipelineStatus';

interface Props {
  agents: PipelineStatusMap;
  selected: string | null;
  onSelect: (equipmentType: string) => void;
}

export default function EquipmentSidePanel({ agents, selected, onSelect }: Props) {
  const { t } = useI18n();
  const entries = Object.entries(agents);

  const incomplete = entries.filter(([, a]) => a.doneCount < 5);
  const complete = entries.filter(([, a]) => a.doneCount >= 5);

  const renderItem = (name: string, equipType: string, doneCount: number) => {
    const isActive = selected === equipType;
    return (
      <button
        key={name}
        onClick={() => onSelect(equipType)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
          ${isActive
            ? 'bg-primary text-white font-bold'
            : 'text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark'}`}
      >
        <span className="font-mono text-xs">{equipType}</span>
        <span className={`text-[10px] font-bold ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>
          {doneCount}/5
        </span>
      </button>
    );
  };

  return (
    <div className="w-52 shrink-0 border-r border-border dark:border-border-dark overflow-y-auto">
      <div className="p-3 space-y-4">
        {incomplete.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Icon name="pending" size="xs" className="text-warning" />
              <span className="text-[10px] font-bold text-warning uppercase tracking-wider">
                {t('vrlMapping.incomplete')} ({incomplete.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {incomplete.map(([name, a]) => renderItem(name, a.equipmentType, a.doneCount))}
            </div>
          </div>
        )}

        {complete.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Icon name="check_circle" size="xs" className="text-success" />
              <span className="text-[10px] font-bold text-success uppercase tracking-wider">
                {t('vrlMapping.complete')} ({complete.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {complete.map(([name, a]) => renderItem(name, a.equipmentType, a.doneCount))}
            </div>
          </div>
        )}

        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">{t('vrlMapping.noEquipment')}</p>
        )}
      </div>
    </div>
  );
}
