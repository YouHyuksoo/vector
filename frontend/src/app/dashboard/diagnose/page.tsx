/**
 * @file src/app/dashboard/diagnose/page.tsx
 * @description 운영 진단 페이지 — 설정·현상·상태를 한 화면에서 판단
 *
 * 초보자 가이드:
 * 1. **목적**: 적체/지연/재시작 등 운영 이상을 한눈에 진단
 * 2. **데이터**: GET /api/diagnose/health 5초 polling
 * 3. **종합 헬스**: ok / warn / critical 색상 + reasons 목록
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui';
import { apiFetch } from '@/lib/api';

const POLL_INTERVAL = 5000;

interface BufferSegment { name: string; sizeMB: number; mtime: string; }
interface VectorMetric { id: string; received?: number | null; sent?: number | null; }
interface EquipmentItem {
  equipment_id: string; equipment_type: string; ip: string | null;
  online: boolean; vector_running: boolean; last_seen: string;
}
interface DiagnoseResponse {
  timestamp: string;
  diagnoseElapsedMs: number;
  health: 'ok' | 'warn' | 'critical';
  reasons: string[];
  backend: { pid: number; uptimeSec: number; heapMB: number; rssMB: number; systemMemoryPercent: number; cpuCores: number; };
  aggregator: {
    running: boolean; pid: number | null; apiReachable: boolean;
    bufferTotalMB: number; bufferSegments: BufferSegment[];
    vectorMetrics: { sources: VectorMetric[]; sinks: VectorMetric[]; };
  };
  oracle: { connected: boolean; poolMin: number; poolMax: number; };
  throughput: { insertPerMin: number | null; perTable: { table: string; cnt: number }[]; };
  lag: { hours: number | null; latestStartTime: string | null; latestCreatedAt: string | null; };
  equipments: { total: number; online: number; offline: number; list: EquipmentItem[]; };
  recentErrors: number;
  port6000Connections: string[];
  config: {
    maxMemoryRestart: string | null;
    oraclePool: { min: number; max: number; };
    vectorToApi: { batchMaxEvents: number | null; concurrency: number | string | null; bufferMaxMB: number | null; };
    rawLogBasePath: string;
  };
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

const healthColor: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
  critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
};
const healthLabel: Record<string, string> = { ok: '정상', warn: '주의', critical: '위험' };

export default function DiagnosePage() {
  const [data, setData] = useState<DiagnoseResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiFetch<DiagnoseResponse>('/api/diagnose/health');
      setData(json);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchHealth]);

  if (err && !data) {
    return <div className="p-6 text-rose-600">진단 조회 실패: {err}</div>;
  }
  if (!data) {
    return <div className="p-6 text-muted-foreground">진단 데이터 로딩 중...</div>;
  }

  const bufferPercent = data.config.vectorToApi.bufferMaxMB
    ? Math.round((data.aggregator.bufferTotalMB / data.config.vectorToApi.bufferMaxMB) * 100)
    : 0;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* 종합 헬스 */}
      <div className={`rounded-lg border-2 px-5 py-4 ${healthColor[data.health]}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-2xl font-bold">
              {data.health === 'ok' ? '✓' : data.health === 'warn' ? '⚠️' : '🔴'} {healthLabel[data.health]}
            </div>
            <div className="text-sm mt-1 opacity-80">
              {new Date(data.timestamp).toLocaleString('ko-KR')} · 진단 {data.diagnoseElapsedMs}ms
              {loading && ' · 갱신 중...'}
            </div>
          </div>
          <button onClick={fetchHealth} className="px-3 py-1.5 rounded bg-white/30 hover:bg-white/50 text-sm font-medium">
            새로고침
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {data.reasons.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 상태 */}
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-base mb-3">📊 상태 (Status)</h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Backend</dt>
                <dd>PID {data.backend.pid} · uptime {formatUptime(data.backend.uptimeSec)} · heap {data.backend.heapMB}MB / rss {data.backend.rssMB}MB</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">시스템 메모리</dt>
                <dd>{data.backend.systemMemoryPercent}% · CPU {data.backend.cpuCores}코어</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Aggregator</dt>
                <dd>{data.aggregator.running ? `✓ PID ${data.aggregator.pid}` : '✗ 중지'} · API {data.aggregator.apiReachable ? '✓' : '✗'}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Oracle</dt>
                <dd>{data.oracle.connected ? '✓ 연결' : '✗ 끊김'} · pool {data.oracle.poolMin}/{data.oracle.poolMax}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">설비</dt>
                <dd>{data.equipments.online}/{data.equipments.total} 온라인 · offline {data.equipments.offline}</dd>
              </div>
            </dl>
          </div>
        </Card>

        {/* 현상 */}
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-base mb-3">🔍 현상 (Symptoms)</h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between items-center"><dt className="text-muted-foreground">Aggregator buffer</dt>
                <dd>
                  <span className={data.aggregator.bufferTotalMB > 100 ? 'text-amber-600 font-medium' : ''}>
                    {data.aggregator.bufferTotalMB} MB
                  </span>
                  {data.config.vectorToApi.bufferMaxMB && ` / ${data.config.vectorToApi.bufferMaxMB} MB (${bufferPercent}%)`}
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">분당 INSERT</dt>
                <dd className={(data.throughput.insertPerMin ?? 0) < 100 && data.aggregator.bufferTotalMB > 50 ? 'text-rose-600 font-medium' : ''}>
                  {data.throughput.insertPerMin ?? '-'} 건
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">데이터 lag</dt>
                <dd className={(data.lag.hours ?? 0) > 1 ? 'text-amber-600 font-medium' : ''}>
                  {data.lag.hours != null ? `${data.lag.hours}시간` : '-'}
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">최근 5분 ERROR</dt>
                <dd className={data.recentErrors > 10 ? 'text-amber-600 font-medium' : ''}>{data.recentErrors} 건</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">port 6000 연결</dt>
                <dd>{data.port6000Connections.length}개 ({data.port6000Connections.slice(0, 3).join(', ')}{data.port6000Connections.length > 3 ? '...' : ''})</dd>
              </div>
            </dl>

            {data.aggregator.bufferSegments.length > 0 && (
              <div className="mt-3 pt-3 border-t border-muted">
                <div className="text-xs text-muted-foreground mb-1">Buffer 분해:</div>
                {data.aggregator.bufferSegments.map(s => (
                  <div key={s.name} className="text-xs flex justify-between">
                    <span className="font-mono">{s.name}</span>
                    <span>{s.sizeMB}MB · {new Date(s.mtime).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 설정 */}
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-base mb-3">⚙️ 설정 (Config)</h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">max_memory_restart</dt>
                <dd className="font-mono">{data.config.maxMemoryRestart || '-'}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Oracle pool</dt>
                <dd className="font-mono">min {data.config.oraclePool.min} / max {data.config.oraclePool.max}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Vector to_api batch</dt>
                <dd className="font-mono">max_events {data.config.vectorToApi.batchMaxEvents ?? '-'} · concurrency {data.config.vectorToApi.concurrency ?? 'adaptive'}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Vector to_api buffer</dt>
                <dd className="font-mono">disk · {data.config.vectorToApi.bufferMaxMB ?? '-'} MB max</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">raw-logs 경로</dt>
                <dd className="font-mono text-xs">{data.config.rawLogBasePath}</dd>
              </div>
            </dl>
          </div>
        </Card>

        {/* Vector 컴포넌트 메트릭 + 설비별 처리량 */}
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-base mb-3">📈 처리 흐름</h3>
            <div className="text-sm space-y-3">
              {data.aggregator.vectorMetrics.sources.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Aggregator sources (받음):</div>
                  {data.aggregator.vectorMetrics.sources.map(s => (
                    <div key={s.id} className="font-mono text-xs flex justify-between">
                      <span>{s.id}</span><span>{s.received?.toLocaleString() ?? 'null'} events</span>
                    </div>
                  ))}
                </div>
              )}
              {data.aggregator.vectorMetrics.sinks.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Aggregator sinks (보냄):</div>
                  {data.aggregator.vectorMetrics.sinks.map(s => (
                    <div key={s.id} className="font-mono text-xs flex justify-between">
                      <span>{s.id}</span><span>{s.sent?.toLocaleString() ?? 'null'} events</span>
                    </div>
                  ))}
                </div>
              )}
              {data.throughput.perTable.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">최근 1분 테이블별 INSERT:</div>
                  {data.throughput.perTable.map(t => (
                    <div key={t.table} className="font-mono text-xs flex justify-between">
                      <span>{t.table}</span><span>{t.cnt.toLocaleString()}건</span>
                    </div>
                  ))}
                </div>
              )}
              {data.lag.latestStartTime && data.lag.latestCreatedAt && (
                <div className="pt-2 border-t border-muted">
                  <div className="text-xs text-muted-foreground">최신 데이터 (LOG_EOL):</div>
                  <div className="text-xs">START_TIME: <span className="font-mono">{data.lag.latestStartTime}</span></div>
                  <div className="text-xs">CREATED_AT: <span className="font-mono">{new Date(data.lag.latestCreatedAt).toLocaleString('ko-KR')}</span></div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* 설비 목록 */}
      <Card>
        <div className="p-4">
          <h3 className="font-semibold text-base mb-3">🔌 설비 ({data.equipments.online}/{data.equipments.total} 온라인)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
            {data.equipments.list.map(eq => (
              <div key={eq.equipment_id}
                className={`p-2 rounded border ${eq.online ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-muted bg-muted/30'}`}>
                <div className="font-medium">{eq.online ? '✓' : '✗'} {eq.equipment_id}</div>
                <div className="text-muted-foreground">{eq.equipment_type} · {eq.ip ?? '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
