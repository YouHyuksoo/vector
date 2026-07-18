/**
 * @file src/app/dashboard/diagnose/page.tsx
 * @description 운영 진단 페이지 — Vector.OPS 미션 컨트롤 UI
 *
 * 초보자 가이드:
 * 1. **컨셉**: 항공우주 control room / Bloomberg terminal — 다크 인더스트리얼 + 모노스페이스 + 형광 액센트
 * 2. **데이터**: GET /api/diagnose/health 5초 polling
 * 3. **위계**: HEADER → KPI 6개 → CHART 3개 → BUFFER+DATAFLOW → EQUIPMENT MATRIX → CONFIG
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Sparkline, type HistoryPoint } from './components/Sparkline';

const POLL_INTERVAL = 5000;
const HISTORY_MAX = 120;

// ─── Types ──────────────────────────────────────────────────────────────
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
    memoryMB: number | null;
    bufferTotalMB: number; bufferActiveMB: number; bufferSegments: BufferSegment[]; unsentEvents: number;
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

// ─── Helpers ────────────────────────────────────────────────────────────
function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

const STATUS = {
  ok: { label: 'NOMINAL', dot: 'bg-emerald-400', text: 'text-emerald-300', glow: '#34d399', panel: 'bg-emerald-950/30 border-emerald-400/30' },
  warn: { label: 'CAUTION', dot: 'bg-amber-400', text: 'text-amber-300', glow: '#fbbf24', panel: 'bg-amber-950/30 border-amber-400/30' },
  critical: { label: 'CRITICAL', dot: 'bg-rose-400', text: 'text-rose-300', glow: '#fb7185', panel: 'bg-rose-950/30 border-rose-400/40' },
};

// ─── Sub Components ─────────────────────────────────────────────────────
function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="border border-[rgba(127,153,178,0.15)] bg-[#11161f]/60 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(127,153,178,0.1)]">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-[10px]">▼</span>
          <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#a0b0c0] font-medium">{title}</h3>
          <span className="h-px flex-1 bg-gradient-to-r from-[rgba(127,153,178,0.25)] to-transparent w-12" />
        </div>
        {meta && <span className="text-[10px] text-[#5a6b7d] tracking-wider">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label, value, unit, status, sub, accent,
}: {
  label: string; value: string | number; unit?: string;
  status?: 'ok' | 'warn' | 'critical' | 'neutral'; sub?: string; accent?: string;
}) {
  const accentColor = accent ?? (status === 'critical' ? '#fb7185' : status === 'warn' ? '#fbbf24' : status === 'ok' ? '#34d399' : '#67e8f9');
  return (
    <div className="relative border border-[rgba(127,153,178,0.15)] bg-[#11161f]/60 backdrop-blur-sm p-3 overflow-hidden group hover:border-[rgba(127,153,178,0.3)] transition">
      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
      <div className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
      <div className="text-[9px] uppercase tracking-[0.22em] text-[#6b7d8f] mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl lg:text-3xl font-light tabular-nums" style={{ color: accentColor, textShadow: `0 0 12px ${accentColor}40` }}>{value}</span>
        {unit && <span className="text-[10px] text-[#6b7d8f] uppercase tracking-wider">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-[#5a6b7d] mt-0.5 tracking-wide">{sub}</div>}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────
export default function DiagnosePage() {
  const [data, setData] = useState<DiagnoseResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bufferHistory, setBufferHistory] = useState<HistoryPoint[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<HistoryPoint[]>([]);
  const [insertHistory, setInsertHistory] = useState<HistoryPoint[]>([]);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiFetch<DiagnoseResponse>('/api/diagnose/health');
      setData(json);
      setErr(null);
      const ts = Date.parse(json.timestamp) || Date.now();
      setBufferHistory(prev => [...prev, { t: ts, v: json.aggregator.bufferActiveMB }].slice(-HISTORY_MAX));
      if (json.aggregator.memoryMB != null) {
        setMemoryHistory(prev => [...prev, { t: ts, v: json.aggregator.memoryMB! }].slice(-HISTORY_MAX));
      }
      setInsertHistory(prev => [...prev, { t: ts, v: json.throughput.insertPerMin ?? 0 }].slice(-HISTORY_MAX));
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

  if (err && !data) return <BootScreen status="ERROR" message={`TELEMETRY LINK FAILED — ${err}`} />;
  if (!data) return <BootScreen status="BOOT" message="ESTABLISHING TELEMETRY LINK..." />;

  const status = STATUS[data.health];
  const bufferPercent = data.config.vectorToApi.bufferMaxMB
    ? Math.round((data.aggregator.bufferActiveMB / data.config.vectorToApi.bufferMaxMB) * 100)
    : 0;

  const kpis = [
    { label: 'Vector Unsent', value: data.aggregator.unsentEvents.toLocaleString(), unit: 'evt', status: (data.aggregator.unsentEvents > 1000 ? 'critical' : data.aggregator.unsentEvents > 0 ? 'warn' : 'ok') as 'ok' | 'warn' | 'critical', sub: 'received − sent' },
    { label: 'DB Insert / Min', value: data.throughput.insertPerMin ?? '—', unit: '/min', accent: '#67e8f9', sub: `recent err ${data.recentErrors}` },
    { label: 'Active Buffer', value: data.aggregator.bufferActiveMB.toFixed(1), unit: 'MB', status: (data.aggregator.bufferActiveMB > 200 ? 'warn' : 'ok') as 'ok' | 'warn', sub: data.config.vectorToApi.bufferMaxMB ? `${bufferPercent}% of ${data.config.vectorToApi.bufferMaxMB}MB` : 'no max' },
    { label: 'Backend Uptime', value: formatUptime(data.backend.uptimeSec), accent: '#a78bfa', sub: `heap ${data.backend.heapMB} / rss ${data.backend.rssMB}MB` },
    { label: 'Equipments Online', value: `${data.equipments.online}/${data.equipments.total}`, status: (data.equipments.offline > 0 ? 'warn' : 'ok') as 'ok' | 'warn', sub: `offline ${data.equipments.offline}` },
    { label: 'Vector Memory', value: data.aggregator.memoryMB?.toFixed(0) ?? '—', unit: 'MB', accent: '#f0abfc', sub: data.aggregator.running ? `pid ${data.aggregator.pid}` : '✗ stopped' },
  ];

  return (
    <div className={`font-mono min-h-screen bg-[#0a0e14] text-[#c5d0db] relative`}>
      {/* CRT scanlines */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(255,255,255,0.9) 2px, rgba(255,255,255,0.9) 3px)',
      }} />
      {/* grid pattern */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]" style={{
        backgroundImage: 'linear-gradient(rgba(127,153,178,1) 1px, transparent 1px), linear-gradient(90deg, rgba(127,153,178,1) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }} />
      {/* corner glows */}
      <div className="pointer-events-none fixed -top-40 -left-40 w-[28rem] h-[28rem] rounded-full blur-3xl" style={{ background: `${status.glow}20` }} />
      <div className="pointer-events-none fixed -bottom-40 -right-40 w-[28rem] h-[28rem] bg-cyan-500/5 rounded-full blur-3xl" />

      <div className="relative z-10 p-3 lg:p-5 space-y-3 max-w-[1800px] mx-auto">
        {/* HEADER */}
        <header className="border border-[rgba(127,153,178,0.15)] bg-[#11161f]/80 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between px-4 py-2.5 gap-3 border-b border-[rgba(127,153,178,0.1)]">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs">◆</span>
                <span className="text-base font-bold tracking-[0.25em] text-emerald-300" style={{ textShadow: '0 0 8px #34d39960' }}>VECTOR.OPS</span>
              </div>
              <span className="text-[10px] text-[#5a6b7d] uppercase tracking-wider hidden sm:inline">// pipeline diagnostics</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#6b7d8f]">
              <span className="tabular-nums">RTT <span className="text-[#c5d0db]">{data.diagnoseElapsedMs}</span>ms</span>
              <span className="hidden md:inline tabular-nums">{new Date(data.timestamp).toLocaleString('ko-KR')}</span>
              <button
                onClick={fetchHealth}
                className={`px-2.5 py-1 border border-[rgba(127,153,178,0.3)] hover:border-emerald-400/60 hover:text-emerald-300 transition tracking-wider ${loading ? 'animate-pulse text-emerald-400 border-emerald-400/50' : ''}`}>
                {loading ? '◌ SCAN' : '▶ REFRESH'}
              </button>
            </div>
          </div>
          <div className={`flex items-start gap-4 px-4 py-3 border-l-2 ${status.panel}`} style={{ borderLeftColor: status.glow }}>
            <div className={`mt-1.5 w-3 h-3 rounded-full ${status.dot} ${data.health !== 'ok' ? 'animate-pulse' : ''}`} style={{ boxShadow: `0 0 12px ${status.glow}, 0 0 24px ${status.glow}80` }} />
            <div className="flex-1">
              <div className="flex items-baseline gap-3">
                <span className={`text-xl font-light tracking-[0.2em] ${status.text}`} style={{ textShadow: `0 0 8px ${status.glow}60` }}>{status.label}</span>
                <span className="text-[10px] text-[#5a6b7d] uppercase tracking-wider">{data.reasons.length} indicator{data.reasons.length !== 1 && 's'}</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-[#a0b0c0]">
                {data.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="text-[#5a6b7d]">›</span><span>{r}</span></li>)}
              </ul>
            </div>
          </div>
        </header>

        {/* KPI GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {kpis.map((k, i) => <Kpi key={i} {...k} />)}
        </div>

        {/* CHARTS */}
        <Section title="History · 10 min @ 5s" meta={`${bufferHistory.length}/${HISTORY_MAX} samples`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
            <Sparkline
              data={bufferHistory} color="#fbbf24" label="Active Buffer" unit="MB"
              max={data.config.vectorToApi.bufferMaxMB ?? undefined}
              threshold={{ warn: 200, critical: data.config.vectorToApi.bufferMaxMB ? data.config.vectorToApi.bufferMaxMB * 0.8 : undefined }}
            />
            <Sparkline data={memoryHistory} color="#67e8f9" label="Vector Memory" unit="MB" threshold={{ warn: 500, critical: 1500 }} />
            <Sparkline data={insertHistory} color="#34d399" label="DB Insert" unit="/min" />
          </div>
        </Section>

        {/* BUFFER + DATAFLOW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Section title="Buffer Composition" meta={`${data.aggregator.bufferSegments.length} seg · ${data.aggregator.bufferTotalMB}MB`}>
            <div className="p-3 space-y-2">
              <div className="flex gap-3 text-[10px] uppercase tracking-wider">
                <Legend color="#34d399" label="Active" />
                <Legend color="#94a3b8" label="Rotation Wait" />
                <Legend color="#fb7185" label="Orphan" />
              </div>
              <div className="space-y-1">
                {data.aggregator.bufferSegments.map(s => {
                  const ageMs = Date.now() - new Date(s.mtime).getTime();
                  const isOrphan = ageMs > 7 * 24 * 60 * 60 * 1000;
                  const isWaiting = !isOrphan && ageMs > 60 * 60 * 1000;
                  const color = isOrphan ? '#fb7185' : isWaiting ? '#94a3b8' : '#34d399';
                  const tag = isOrphan ? 'ORPHAN' : isWaiting ? 'WAIT' : 'ACTIVE';
                  return (
                    <div key={s.name} className="flex items-center gap-2 text-[11px] border border-[rgba(127,153,178,0.1)] bg-[#0a0e14]/50 px-2 py-1.5">
                      <div className="w-1 h-1 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                      <span className="text-[9px] uppercase tracking-wider w-12" style={{ color }}>{tag}</span>
                      <span className="font-mono flex-1 truncate text-[#c5d0db]">{s.name}</span>
                      <span className="tabular-nums text-[#a0b0c0]">{s.sizeMB.toFixed(2)}MB</span>
                      <span className="text-[#5a6b7d] tabular-nums">{new Date(s.mtime).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-[#5a6b7d] pt-1 border-t border-[rgba(127,153,178,0.1)]">
                ▸ Vector disk_v2: ACK된 이벤트도 segment rotation 전까지 파일에 남음 — 적체 아님
              </div>
            </div>
          </Section>

          <Section title="Dataflow" meta="vector graphql api">
            <div className="p-3 space-y-3">
              {data.aggregator.vectorMetrics.sources.length > 0 && (
                <FlowGroup label="Sources · received" items={data.aggregator.vectorMetrics.sources.map(s => ({ id: s.id, n: s.received ?? null }))} color="#67e8f9" />
              )}
              {data.aggregator.vectorMetrics.sinks.length > 0 && (
                <FlowGroup label="Sinks · sent" items={data.aggregator.vectorMetrics.sinks.map(s => ({ id: s.id, n: s.sent ?? null }))} color="#34d399" />
              )}
              <div className="pt-2 border-t border-[rgba(127,153,178,0.1)] grid grid-cols-2 gap-2 text-[10px]">
                <Stat label="Port 6000 conn" value={data.port6000Connections.length} sub={data.port6000Connections.slice(0, 3).join(', ')} />
                <Stat label="Oracle pool" value={`${data.oracle.poolMin}/${data.oracle.poolMax}`} sub={data.oracle.connected ? '◉ linked' : '◯ down'} />
                <Stat label="Top table" value={data.throughput.perTable[0]?.table ?? '—'} sub={data.throughput.perTable[0] ? `${data.throughput.perTable[0].cnt}/min` : ''} />
                <Stat label="Lag" value={data.lag.hours != null ? `${data.lag.hours}h` : '—'} sub="start vs created" />
              </div>
            </div>
          </Section>
        </div>

        {/* EQUIPMENT MATRIX */}
        <Section title={`Equipment Matrix · ${data.equipments.online}/${data.equipments.total}`} meta={`${data.equipments.offline} offline`}>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 p-3">
            {data.equipments.list.map(eq => (
              <div key={eq.equipment_id}
                className={`relative border px-2 py-1.5 text-[10px] ${eq.online ? 'border-emerald-400/30 bg-emerald-950/20' : 'border-[rgba(127,153,178,0.15)] bg-[#0a0e14]/40'}`}>
                <div className="absolute right-1 top-1 w-1 h-1 rounded-full" style={{ background: eq.online ? '#34d399' : '#5a6b7d', boxShadow: eq.online ? '0 0 4px #34d399' : 'none' }} />
                <div className={`font-medium tabular-nums ${eq.online ? 'text-emerald-300' : 'text-[#6b7d8f]'}`}>{eq.equipment_id}</div>
                <div className="text-[9px] text-[#5a6b7d] tracking-wide truncate">{eq.equipment_type}{eq.ip ? ` · ${eq.ip}` : ''}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* CONFIG */}
        <Section title="System Config">
          <dl className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-[11px]">
            <ConfigItem label="max_memory_restart" value={data.config.maxMemoryRestart ?? '—'} />
            <ConfigItem label="oracle_pool" value={`${data.config.oraclePool.min} / ${data.config.oraclePool.max}`} />
            <ConfigItem label="to_api.batch" value={`${data.config.vectorToApi.batchMaxEvents ?? '—'} · c${data.config.vectorToApi.concurrency ?? 'auto'}`} />
            <ConfigItem label="buffer.max" value={`${data.config.vectorToApi.bufferMaxMB ?? '—'} MB`} />
            <ConfigItem label="raw_log_path" value={data.config.rawLogBasePath} mono />
          </dl>
        </Section>

        <footer className="text-[9px] text-[#3a4a5c] text-center pt-1 tracking-[0.3em] uppercase">
          ◆ VECTOR.OPS · auto-poll {POLL_INTERVAL}ms · {bufferHistory.length} samples buffered
        </footer>
      </div>
    </div>
  );
}

// ─── Tiny Helpers ───────────────────────────────────────────────────────
function BootScreen({ status, message }: { status: string; message: string }) {
  return (
    <div className={`font-mono min-h-screen bg-[#0a0e14] text-emerald-400 flex items-center justify-center p-8`}>
      <div className="text-center space-y-2">
        <div className="text-xs tracking-[0.3em] text-[#5a6b7d]">VECTOR.OPS</div>
        <div className="text-lg tracking-wider animate-pulse" style={{ textShadow: '0 0 12px #34d39960' }}>◌ {status}</div>
        <div className="text-[10px] text-[#a0b0c0] mt-4">{message}</div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[#a0b0c0]">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
      <span>{label}</span>
    </div>
  );
}

function FlowGroup({ label, items, color }: { label: string; items: { id: string; n: number | null }[]; color: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#6b7d8f] mb-1.5">{label}</div>
      <div className="space-y-0.5">
        {items.map(it => (
          <div key={it.id} className="flex items-center justify-between text-[11px] border-l-2 pl-2 py-0.5" style={{ borderLeftColor: `${color}40` }}>
            <span className="text-[#c5d0db] font-mono">{it.id}</span>
            <span className="tabular-nums font-medium" style={{ color }}>{it.n != null ? it.n.toLocaleString() : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border-l-2 border-[rgba(127,153,178,0.2)] pl-2">
      <div className="text-[9px] uppercase tracking-[0.18em] text-[#6b7d8f]">{label}</div>
      <div className="text-[#c5d0db] tabular-nums">{value}</div>
      {sub && <div className="text-[9px] text-[#5a6b7d] truncate">{sub}</div>}
    </div>
  );
}

function ConfigItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.18em] text-[#6b7d8f] mb-0.5">{label}</dt>
      <dd className={`text-[#c5d0db] ${mono ? 'font-mono text-[10px] break-all' : ''}`}>{value}</dd>
    </div>
  );
}
