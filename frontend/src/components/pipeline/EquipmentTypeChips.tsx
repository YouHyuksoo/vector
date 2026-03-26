/**
 * @file components/pipeline/EquipmentTypeChips.tsx
 * @description 설비유형 선택 칩 공통 컴포넌트 — 파이프라인 상태 기반 에이전트 목록 표시
 *
 * 초보자 가이드:
 * 1. **agents**: usePipelineStatus()에서 가져온 설비별 파이프라인 상태
 * 2. **칩 색상**: 선택=primary, 5/5=success, 3~4=warning, 나머지=gray
 * 3. **groupByStatus**: true면 완료/미완료 그룹 분리 (매핑 페이지용)
 * 4. **진행률 배지**: 각 칩에 n/5 표시
 */
'use client';

import { useI18n } from '@/contexts/I18nContext';
import type { PipelineStatusMap } from '@/hooks/usePipelineStatus';

interface EquipmentTypeChipsProps {
  agents: PipelineStatusMap;
  selected: string | null;
  onSelect: (name: string) => void;
  groupByStatus?: boolean;
}

function chipColor(doneCount: number, isSel: boolean): string {
  if (isSel) return 'bg-primary text-white border-primary';
  if (doneCount >= 5) return 'bg-success/10 text-text dark:text-white border-success/30 hover:bg-success/15';
  if (doneCount >= 3) return 'bg-warning/10 text-text dark:text-white border-warning/30 hover:bg-warning/15';
  return 'bg-background dark:bg-background-dark text-text dark:text-white border-border dark:border-border-dark hover:bg-muted-foreground/5';
}

function dotColor(doneCount: number): string {
  if (doneCount >= 5) return 'bg-success';
  if (doneCount >= 3) return 'bg-warning';
  return 'bg-muted-foreground/30';
}

function ChipButton({ name, doneCount, isSel, targetType, onClick }: {
  name: string; doneCount: number; isSel: boolean; targetType?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold transition-all whitespace-nowrap border ${chipColor(doneCount, isSel)}`}>
      {!isSel && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor(doneCount)}`} />}
      {name}
      {targetType && (
        <span className={`px-1 py-px rounded text-[8px] font-bold uppercase leading-none
          ${targetType === 'PROCEDURE'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300'
            : 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300'
          }`}>
          {targetType === 'PROCEDURE' ? 'PROC' : 'TBL'}
        </span>
      )}
      {!isSel && <span className="opacity-70 ml-0.5">{doneCount}/5</span>}
    </button>
  );
}

export function EquipmentTypeChips({ agents, selected, onSelect, groupByStatus = false }: EquipmentTypeChipsProps) {
  const { t } = useI18n();
  const names = Object.keys(agents);

  if (names.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('download.noAgents')}</p>;
  }

  if (!groupByStatus) {
    return (
      <div className="flex flex-wrap gap-1">
        {names.map(name => (
          <ChipButton key={name} name={name}
            doneCount={agents[name]?.doneCount ?? 0}
            isSel={selected === name}
            targetType={agents[name]?.targetType}
            onClick={() => onSelect(name)} />
        ))}
      </div>
    );
  }

  const done = names.filter(n => (agents[n]?.doneCount ?? 0) >= 5);
  const prog = names.filter(n => (agents[n]?.doneCount ?? 0) < 5);

  return (
    <div className="space-y-2">
      {done.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold text-text dark:text-white uppercase tracking-wider mr-1 shrink-0 w-10">
            {t('mapping.pipeline.complete')}
          </span>
          <div className="flex flex-wrap -space-x-px">
            {done.map((name, i) => (
              <div key={name} className={i === 0 ? 'rounded-l overflow-hidden' : i === done.length - 1 ? 'rounded-r overflow-hidden' : ''}>
                <ChipButton name={name} doneCount={agents[name]?.doneCount ?? 0}
                  isSel={selected === name} targetType={agents[name]?.targetType} onClick={() => onSelect(name)} />
              </div>
            ))}
          </div>
        </div>
      )}
      {prog.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold text-text dark:text-white uppercase tracking-wider mr-1 shrink-0 w-10">
            {t('mapping.pipeline.incomplete')}
          </span>
          <div className="flex flex-wrap -space-x-px">
            {prog.map((name, i) => (
              <div key={name} className={i === 0 ? 'rounded-l overflow-hidden' : i === prog.length - 1 ? 'rounded-r overflow-hidden' : ''}>
                <ChipButton name={name} doneCount={agents[name]?.doneCount ?? 0}
                  isSel={selected === name} targetType={agents[name]?.targetType} onClick={() => onSelect(name)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
