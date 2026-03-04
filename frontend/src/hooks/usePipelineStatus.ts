/**
 * @file src/hooks/usePipelineStatus.ts
 * @description 통합 5단계 파이프라인 진행률 훅
 *
 * 초보자 가이드:
 * 1. **usePipelineStatus(refreshKey)**: /api/monitor/pipeline-status 호출
 * 2. **agents**: 설비별 5단계 상태 (sender, receiver, vrl, table, mapping)
 * 3. **refreshKey 변경 시 자동 재요청**
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

export interface PipelineSteps {
  sender: boolean;
  receiver: boolean;
  vrl: boolean;
  table: boolean;
  mapping: boolean;
}

export interface AgentPipelineStatus {
  steps: PipelineSteps;
  equipmentType: string;
  doneCount: number;
  targetType?: string;
  targetTable?: string;
}

export type PipelineStatusMap = Record<string, AgentPipelineStatus>;

export function usePipelineStatus(refreshKey = 0) {
  const [agents, setAgents] = useState<PipelineStatusMap>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ agents: PipelineStatusMap }>('/api/monitor/pipeline-status');
      setAgents(data.agents);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  return { agents, loading, refresh };
}
