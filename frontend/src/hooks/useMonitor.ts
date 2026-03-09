/**
 * @file src/hooks/useMonitor.ts
 * @description 모니터링 데이터를 주기적으로 폴링하는 커스텀 훅
 *
 * 초보자 가이드:
 * 1. **useMonitor(intervalMs)**: intervalMs 간격(기본 30초)으로 /api/monitor/overview를 폴링
 * 2. **data**: 최신 모니터링 데이터 (MonitorOverview | null)
 * 3. **error**: 마지막 요청 에러 메시지 (string | null)
 * 4. **refresh()**: 수동으로 즉시 데이터를 다시 가져오는 함수
 */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type MonitorOverview } from '@/lib/api';

export function useMonitor(intervalMs = 30000) {
  const [data, setData] = useState<MonitorOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await apiFetch<MonitorOverview>('/api/monitor/overview');
      setData(d);
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, error, lastUpdate, refresh };
}
