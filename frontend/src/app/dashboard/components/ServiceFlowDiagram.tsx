/**
 * @file ServiceFlowDiagram.tsx — 서비스 연결 흐름 다이어그램
 * @description Agent → Aggregator → Backend → Oracle/Redis → Frontend 흐름을 시각화.
 *   각 노드에 포트와 온/오프라인 상태를 표시하고, CSS 애니메이션으로 연결 방향을 나타냄.
 *   초보자 가이드: 이 컴포넌트는 서버 대시보드에서 서비스 간 데이터 흐름을 한눈에 보여줍니다.
 */
'use client';

import { Card, Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface ServiceNode {
  id: string;
  labelKey: string;
  port: number;
  icon: string;
  online: boolean;
}

interface ServiceFlowDiagramProps {
  data: {
    server: { nodeEnv: string };
    redis: { connected: boolean };
    oracle: { connected: boolean };
    vector: { running: boolean; apiReachable: boolean };
  };
}

export function ServiceFlowDiagram({ data }: ServiceFlowDiagramProps) {
  const { t } = useI18n();

  const nodes: ServiceNode[] = [
    { id: 'agent', labelKey: 'serviceFlow.agent', port: 8686, icon: 'computer', online: true },
    { id: 'aggregator', labelKey: 'serviceFlow.aggregator', port: 6000, icon: 'hub', online: data.vector?.running || data.vector?.apiReachable },
    { id: 'backend', labelKey: 'serviceFlow.backend', port: 3110, icon: 'dns', online: true },
    { id: 'oracle', labelKey: 'serviceFlow.oracle', port: 1588, icon: 'database', online: data.oracle?.connected },
    { id: 'redis', labelKey: 'serviceFlow.redis', port: 6379, icon: 'memory', online: data.redis?.connected },
    { id: 'frontend', labelKey: 'serviceFlow.frontend', port: 3100, icon: 'web', online: true },
  ];

  return (
    <Card noPadding className="p-5">
      <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 px-1">
        {t('serviceFlow.title')}
      </p>

      {/* 메인 파이프라인: Agent → Aggregator → Backend */}
      <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
        <NodeBox node={nodes[0]} t={t} />
        <Arrow />
        <NodeBox node={nodes[1]} t={t} />
        <Arrow />
        <NodeBox node={nodes[2]} t={t} />
      </div>

      {/* Backend에서 분기: Oracle / Redis → Frontend */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <NodeBox node={nodes[3]} t={t} />
            <span className="text-muted-foreground text-xs">/</span>
            <NodeBox node={nodes[4]} t={t} />
          </div>
        </div>
        <Arrow />
        <NodeBox node={nodes[5]} t={t} />
      </div>
    </Card>
  );
}

function NodeBox({ node, t }: { node: ServiceNode; t: (k: string) => string }) {
  const online = node.online;
  return (
    <div className={`
      flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
      ${online
        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
        : 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40'}
    `}>
      <Icon name={node.icon} size="sm" className={online ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} />
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-text dark:text-white leading-tight">{t(node.labelKey)}</span>
        <span className="text-[10px] font-mono text-muted-foreground leading-tight">:{node.port}</span>
      </div>
      <span className={`size-2 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center px-1">
      <div className="relative w-8 h-0.5 bg-primary/30 dark:bg-primary/50 overflow-hidden rounded-full">
        <div className="absolute inset-0 bg-primary animate-flow-right rounded-full" />
      </div>
      <Icon name="chevron_right" size="xs" className="text-primary -ml-1" />
    </div>
  );
}
