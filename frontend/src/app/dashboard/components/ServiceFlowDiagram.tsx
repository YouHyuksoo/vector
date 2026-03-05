/**
 * @file ServiceFlowDiagram.tsx — 서비스 연결 흐름 다이어그램
 * @description Agent → Aggregator → Backend → Oracle/Redis → Frontend 흐름을 시각화.
 *   각 노드에 포트, 역할 설명, 온/오프라인 상태를 크게 표시하고 SVG 연결선+애니메이션으로 흐름을 나타냄.
 *   초보자 가이드: 이 컴포넌트는 서버 대시보드에서 서비스 간 데이터 흐름을 한눈에 보여줍니다.
 */
'use client';

import { Card, Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface ServiceFlowDiagramProps {
  data: {
    server: { nodeEnv: string };
    redis: { connected: boolean };
    oracle: { connected: boolean };
    vector: { running: boolean; apiReachable: boolean };
  };
}

interface NodeDef {
  id: string;
  labelKey: string;
  descKey: string;
  port: number;
  icon: string;
  online: boolean;
}

export function ServiceFlowDiagram({ data }: ServiceFlowDiagramProps) {
  const { t } = useI18n();

  const nodes: NodeDef[] = [
    { id: 'agent', labelKey: 'serviceFlow.agent', descKey: 'serviceFlow.agentDesc', port: 8686, icon: 'computer', online: true },
    { id: 'aggregator', labelKey: 'serviceFlow.aggregator', descKey: 'serviceFlow.aggregatorDesc', port: 6000, icon: 'hub', online: data.vector?.running || data.vector?.apiReachable },
    { id: 'backend', labelKey: 'serviceFlow.backend', descKey: 'serviceFlow.backendDesc', port: 3110, icon: 'dns', online: true },
    { id: 'oracle', labelKey: 'serviceFlow.oracle', descKey: 'serviceFlow.oracleDesc', port: 1588, icon: 'database', online: data.oracle?.connected },
    { id: 'redis', labelKey: 'serviceFlow.redis', descKey: 'serviceFlow.redisDesc', port: 6379, icon: 'memory', online: data.redis?.connected },
    { id: 'frontend', labelKey: 'serviceFlow.frontend', descKey: 'serviceFlow.frontendDesc', port: 3100, icon: 'web', online: true },
  ];

  const allOnline = nodes.every(n => n.online);
  const onlineCount = nodes.filter(n => n.online).length;

  return (
    <Card noPadding className="p-6 h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Icon name="device_hub" size="sm" className="text-primary" />
          <p className="text-sm font-bold text-text-secondary uppercase tracking-wider">
            {t('serviceFlow.title')}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
          allOnline
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
        }`}>
          <span className={`size-1.5 rounded-full ${allOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {onlineCount}/{nodes.length} {t('serviceFlow.online')}
        </div>
      </div>

      {/* 메인 파이프라인 Row 1: Agent → Aggregator → Backend */}
      <div className="flex-1 flex flex-col gap-5">
        <div className="flex items-stretch gap-0">
          <FlowNode node={nodes[0]} t={t} step={1} />
          <FlowArrow label={t('serviceFlow.arrowLog')} />
          <FlowNode node={nodes[1]} t={t} step={2} />
          <FlowArrow label={t('serviceFlow.arrowParsed')} />
          <FlowNode node={nodes[2]} t={t} step={3} />
        </div>

        {/* 연결 표시: Backend에서 아래로 분기 */}
        <div className="flex justify-center">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Icon name="keyboard_double_arrow_down" size="sm" className="text-primary animate-bounce" />
            <span className="text-[11px] font-mono tracking-wide">{t('serviceFlow.arrowStore')}</span>
            <Icon name="keyboard_double_arrow_down" size="sm" className="text-primary animate-bounce" />
          </div>
        </div>

        {/* Row 2: Oracle + Redis → Frontend */}
        <div className="flex items-stretch gap-0">
          <FlowNode node={nodes[3]} t={t} step={4} />
          <FlowArrow label={t('serviceFlow.arrowCache')} reverse />
          <FlowNode node={nodes[4]} t={t} step={5} />
          <FlowArrow label={t('serviceFlow.arrowServe')} />
          <FlowNode node={nodes[5]} t={t} step={6} />
        </div>
      </div>
    </Card>
  );
}

function FlowNode({ node, t, step }: { node: NodeDef; t: (k: string) => string; step: number }) {
  const on = node.online;
  return (
    <div className={`
      flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all relative
      ${on
        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white dark:border-emerald-800 dark:from-emerald-950/30 dark:to-slate-900/50'
        : 'border-red-200 bg-gradient-to-br from-red-50/80 to-white dark:border-red-800 dark:from-red-950/30 dark:to-slate-900/50'}
    `}>
      {/* 스텝 뱃지 */}
      <span className={`absolute -top-2.5 -left-2.5 size-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
        on ? 'bg-emerald-500' : 'bg-red-500'
      }`}>
        {step}
      </span>

      {/* 아이콘 + 상태 */}
      <div className={`size-11 rounded-xl flex items-center justify-center ${
        on
          ? 'bg-emerald-100 dark:bg-emerald-900/40'
          : 'bg-red-100 dark:bg-red-900/40'
      }`}>
        <Icon name={node.icon} className={on ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} />
      </div>

      {/* 이름 */}
      <span className="text-sm font-bold text-text dark:text-white">{t(node.labelKey)}</span>

      {/* 포트 */}
      <span className="font-mono text-xs text-muted-foreground bg-surface dark:bg-surface-dark px-2 py-0.5 rounded">
        :{node.port}
      </span>

      {/* 설명 */}
      <span className="text-[11px] text-muted-foreground text-center leading-snug">
        {t(node.descKey)}
      </span>

      {/* 상태 표시 */}
      <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
        on ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      }`}>
        <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        {on ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}

function FlowArrow({ label, reverse }: { label: string; reverse?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center w-16 shrink-0 gap-1">
      <span className="text-[9px] font-mono text-muted-foreground text-center leading-tight whitespace-nowrap">
        {label}
      </span>
      <div className="flex items-center w-full px-1">
        <div className="relative flex-1 h-0.5 bg-primary/20 dark:bg-primary/30 overflow-hidden rounded-full">
          <div className={`absolute inset-0 bg-primary rounded-full ${reverse ? 'animate-flow-left' : 'animate-flow-right'}`} />
        </div>
        <Icon name={reverse ? 'chevron_left' : 'chevron_right'} size="xs" className="text-primary -ml-0.5" />
      </div>
    </div>
  );
}
