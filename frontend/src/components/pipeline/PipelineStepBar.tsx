/**
 * @file components/pipeline/PipelineStepBar.tsx
 * @description 5단계 파이프라인 스텝 바 공통 컴포넌트 — 아이콘 + 연결선 표시
 *
 * 초보자 가이드:
 * 1. **5단계**: receiver → sender → vrl → table → mapping
 * 2. **완료**: 초록 원 + 체크, **미완료**: 점선 + 회색
 * 3. **clickable**: true면 각 단계 클릭으로 해당 설정 페이지 이동 (매핑용)
 * 4. **compact**: true면 작은 아이콘만 표시 (송신기 목록용)
 */
'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { PipelineStatusMap, PipelineSteps } from '@/hooks/usePipelineStatus';

const STEP_KEYS: (keyof PipelineSteps)[] = ['receiver', 'sender', 'vrl', 'table', 'mapping'];
const ICONS = ['cell_tower', 'router', 'code', 'table_chart', 'check_circle'] as const;
const LINKS = ['/dashboard/receiver', '/dashboard/sender', '/dashboard/simulator', '/dashboard/mapping', '/dashboard/mapping'] as const;

interface PipelineStepBarProps {
  agents: PipelineStatusMap;
  agentName: string;
  clickable?: boolean;
  compact?: boolean;
}

export function PipelineStepBar({ agents, agentName, clickable = false, compact = false }: PipelineStepBarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const agent = agents[agentName];

  if (!agent) return null;

  const labels = [
    t('mapping.pipeline.receiver'), t('mapping.pipeline.sender'),
    t('mapping.pipeline.vrl'), t('mapping.pipeline.table'), t('mapping.pipeline.mapping'),
  ];

  const STEP_LABEL_KEYS = [
    'mapping.pipeline.receiver', 'mapping.pipeline.sender',
    'mapping.pipeline.vrl', 'mapping.pipeline.table', 'mapping.pipeline.mapping',
  ] as const;

  const steps = STEP_KEYS.map((key, i) => {
    const done = agent.steps[key];
    const et = agent.equipmentType;
    let detail = '-';
    if (key === 'receiver') detail = done ? t('mapping.pipeline.configured') : '-';
    else if (key === 'sender') detail = agentName;
    else if (key === 'vrl') detail = et || '-';
    else if (key === 'table') detail = done ? et : '-';
    else if (key === 'mapping') detail = done ? t('mapping.pipeline.configured') : '-';
    return { done, detail, icon: ICONS[i], label: labels[i], labelKey: STEP_LABEL_KEYS[i], link: LINKS[i] };
  });

  /* compact 모드: 송신기 목록의 작은 아이콘 행 */
  if (compact) {
    const doneCount = agent.doneCount ?? 0;
    return (
      <div className="flex items-center gap-0.5">
        {steps.map((step, i) => (
          <span key={i} title={t(step.labelKey)}
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full
              ${step.done
                ? 'bg-success/20 text-success'
                : 'bg-border/30 dark:bg-border-dark/30 text-muted-foreground/40'
              }`}>
            <Icon name={step.icon} size="xs" className="!text-[10px]" />
          </span>
        ))}
        <span className={`text-[9px] ml-0.5 font-medium
          ${doneCount === 5 ? 'text-success' : doneCount > 0 ? 'text-warning' : 'text-muted-foreground/50'}`}>
          {doneCount}/5
        </span>
      </div>
    );
  }

  /* 풀 모드: 5단계 아이콘 + 연결선 + 라벨 */
  const handleClick = (link: string) => {
    if (clickable) router.push(link);
  };

  return (
    <div className="flex items-start justify-between gap-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start flex-1 min-w-0">
          <button onClick={() => handleClick(step.link)}
            className={`flex flex-col items-center gap-1 min-w-[72px] group ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
            <div className="relative">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
                ${step.done
                  ? 'bg-success text-white shadow-sm shadow-success/30'
                  : 'border-2 border-dashed border-muted-foreground/30 text-muted-foreground/40 bg-transparent'}`}>
                <Icon name={step.icon} size="sm" />
              </div>
              {step.done && (
                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full
                  bg-white dark:bg-slate-900 flex items-center justify-center">
                  <Icon name="check_circle" className="text-success !text-[12px]" />
                </div>
              )}
            </div>
            <span className={`text-xs font-bold text-center leading-tight
              ${clickable ? 'group-hover:text-primary' : ''} transition-colors
              ${step.done ? 'text-text dark:text-white' : 'text-muted-foreground/40'}`}>
              {step.label}
            </span>
            <span className={`text-[10px] text-center leading-tight truncate max-w-[88px] font-medium
              ${step.done ? 'text-success' : 'text-muted-foreground/30'}`}
              title={step.detail}>
              {step.detail}
            </span>
          </button>
          {i < steps.length - 1 && (
            <div className="flex-1 flex items-center pt-4 px-1 min-w-[16px]">
              <div className={`w-full rounded
                ${step.done && steps[i + 1].done
                  ? 'h-0.5 bg-success/50'
                  : 'h-0 border-t-2 border-dashed border-muted-foreground/15'}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
