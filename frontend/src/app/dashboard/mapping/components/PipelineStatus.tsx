/**
 * @file components/PipelineStatus.tsx
 * @description 송신기(설비)별 파이프라인 설정 상태 5단계 스텝 바 (공통 컴포넌트 기반)
 *
 * 초보자 가이드:
 * 1. **송신기 선택**: 상단 칩에 진행률 표시, 클릭하면 해당 설비 기준 파이프라인 표시
 * 2. **5단계 판정**: 송신기 → 수신기 → VRL 파싱 → 테이블 → 매핑
 * 3. **클릭 이동**: 각 단계 클릭 시 해당 설정 페이지로 이동
 * 4. **칩 색상**: 초록=전체완료, 노랑=일부완료, 회색=미완료
 */
'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { usePipelineStatus } from '@/hooks/usePipelineStatus';
import { EquipmentTypeChips, PipelineStepBar } from '@/components/pipeline';

interface Props {
  refreshKey?: number;
  onEquipmentSelect?: (equipType: string | null) => void;
}

export default function PipelineStatus({ refreshKey = 0, onEquipmentSelect }: Props) {
  const { t } = useI18n();
  const { agents, loading } = usePipelineStatus(refreshKey);
  const [selected, setSelected] = useState<string | null>(null);

  const agentNames = Object.keys(agents);
  if (loading || agentNames.length === 0) return null;

  const handleChip = (name: string) => {
    const deselect = selected === name;
    setSelected(deselect ? null : name);
    if (onEquipmentSelect) {
      onEquipmentSelect(deselect ? null : (agents[name]?.equipmentType || null));
    }
  };

  return (
    <div className="rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark">
      {/* 송신기 선택 — 완료/미완료 그룹별 칩 */}
      <div className="px-4 py-3 border-b border-border dark:border-border-dark">
        <EquipmentTypeChips agents={agents} selected={selected} onSelect={handleChip} groupByStatus />
      </div>

      {/* 파이프라인 스텝 */}
      {selected && agents[selected] ? (
        <div className="px-4 py-3">
          <PipelineStepBar agents={agents} agentName={selected} clickable />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground/50">
          <Icon name="touch_app" size="sm" />
          <span className="text-xs font-medium">{t('mapping.pipeline.selectSender')}</span>
        </div>
      )}
    </div>
  );
}
