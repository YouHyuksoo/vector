/**
 * @file frontend/src/app/dashboard/diagnose/components/Sparkline.tsx
 * @description 미션 컨트롤 스타일 SVG 라인 차트 — 의존성 없이 시계열 시각화.
 *
 * 초보자 가이드:
 * - data: HistoryPoint[] 시계열 데이터 (t: 타임스탬프, v: 값)
 * - threshold: warn/critical 점선 표시
 * - max: y축 상한 (없으면 데이터 최대치의 1.1배)
 */

export interface HistoryPoint { t: number; v: number; }

interface SparklineProps {
  data: HistoryPoint[];
  width?: number;
  height?: number;
  color?: string;
  max?: number;
  label?: string;
  unit?: string;
  threshold?: { warn?: number; critical?: number };
}

export function Sparkline({
  data, width = 320, height = 96, color = '#34d399',
  max, label, unit = '', threshold,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <div className="flex flex-col gap-2">
        {label && <SparkHeader label={label} value="—" unit={unit} />}
        <div style={{ height }} className="flex items-center justify-center text-[10px] text-[#5a6b7d] border border-[rgba(127,153,178,0.15)] bg-[#0a0e14]/60">
          AWAITING TELEMETRY...
        </div>
      </div>
    );
  }

  const ys = data.map(p => p.v);
  const lastV = ys[ys.length - 1];
  const maxY = max ?? Math.max(...ys, 1) * 1.15;
  const minY = 0;
  const W = width, H = height;
  const PAD_L = 36, PAD_R = 10, PAD_T = 8, PAD_B = 20;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const xs = data.map((_, i) => i);
  const xScale = (i: number) => PAD_L + (i / (xs.length - 1)) * plotW;
  const yScale = (v: number) => PAD_T + plotH - ((v - minY) / (maxY - minY)) * plotH;
  const pathD = xs.map((i, idx) => `${idx === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(ys[i])}`).join(' ');
  const areaD = `${pathD} L ${xScale(xs[xs.length - 1])} ${PAD_T + plotH} L ${xScale(xs[0])} ${PAD_T + plotH} Z`;
  const firstT = new Date(data[0].t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const lastT = new Date(data[data.length - 1].t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const warnY = threshold?.warn != null ? yScale(threshold.warn) : null;
  const critY = threshold?.critical != null ? yScale(threshold.critical) : null;

  const peak = Math.max(...ys);
  const trend = ys[ys.length - 1] - ys[Math.max(0, ys.length - 12)];

  return (
    <div className="flex flex-col gap-1.5">
      {label && <SparkHeader label={label} value={lastV.toLocaleString()} unit={unit} trend={trend} />}
      <div className="relative border border-[rgba(127,153,178,0.15)] bg-[#0a0e14]/60">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full block" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* y축 격자 */}
          {[0, 0.5, 1].map(p => {
            const y = PAD_T + plotH * (1 - p);
            const v = (minY + (maxY - minY) * p).toFixed(0);
            return (
              <g key={p}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#3a4a5c" strokeOpacity={0.4} strokeDasharray="2 4" />
                <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#5a6b7d" fontFamily="monospace">{v}</text>
              </g>
            );
          })}
          {/* 임계선 */}
          {warnY != null && warnY > PAD_T && warnY < H - PAD_B && (
            <line x1={PAD_L} x2={W - PAD_R} y1={warnY} y2={warnY} stroke="#fbbf24" strokeDasharray="4 2" strokeOpacity={0.5} />
          )}
          {critY != null && critY > PAD_T && critY < H - PAD_B && (
            <line x1={PAD_L} x2={W - PAD_R} y1={critY} y2={critY} stroke="#fb7185" strokeDasharray="4 2" strokeOpacity={0.5} />
          )}
          {/* 영역 + 라인 */}
          <path d={areaD} fill={`url(#grad-${color.replace('#','')})`} />
          <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} style={{ filter: `drop-shadow(0 0 4px ${color}80)` }} />
          {/* 마지막 점 — 펄스 */}
          <circle cx={xScale(xs[xs.length - 1])} cy={yScale(lastV)} r={3} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <circle cx={xScale(xs[xs.length - 1])} cy={yScale(lastV)} r={6} fill="none" stroke={color} strokeOpacity={0.5}>
            <animate attributeName="r" from="3" to="10" dur="2s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
          </circle>
          {/* x축 시각 */}
          <text x={PAD_L} y={H - 5} fontSize="9" fill="#5a6b7d" fontFamily="monospace">{firstT}</text>
          <text x={W - PAD_R} y={H - 5} textAnchor="end" fontSize="9" fill="#5a6b7d" fontFamily="monospace">{lastT}</text>
          {/* peak 마커 */}
          <text x={W - PAD_R - 2} y={PAD_T + 8} textAnchor="end" fontSize="8" fill="#6b7d8f" fontFamily="monospace">
            PK {peak.toFixed(0)}
          </text>
        </svg>
      </div>
    </div>
  );
}

function SparkHeader({ label, value, unit, trend }: { label: string; value: string; unit: string; trend?: number }) {
  const trendChar = trend == null ? '' : trend > 0 ? '▲' : trend < 0 ? '▼' : '◆';
  const trendColor = trend == null ? '' : trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-cyan-400' : 'text-[#6b7d8f]';
  return (
    <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.18em]">
      <span className="text-[#6b7d8f]">{label}</span>
      <span className="font-medium text-[#c5d0db]">
        {value}<span className="text-[#6b7d8f] ml-0.5">{unit}</span>
        {trendChar && <span className={`ml-2 ${trendColor}`}>{trendChar}</span>}
      </span>
    </div>
  );
}
