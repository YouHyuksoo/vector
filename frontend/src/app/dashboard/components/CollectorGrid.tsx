/** @file CollectorGrid.tsx — 설비 수집기 상태 그리드 (라이트/다크 대응)
 * 하트비트 기반 설비 카드 + 로그 성공/실패 통계 표시 */
'use client';
import { useMemo } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

function elapsed(iso: string) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) return 'now';
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const ICONS: Record<string, string> = {
  AOI: 'visibility', SPI: 'layers', MAOI: 'center_focus_strong',
  MOUNTER: 'precision_manufacturing', REFLOW: 'local_fire_department',
  ICT: 'developer_board', FCT: 'fact_check', BURNIN: 'thermostat',
  HIPOT: 'bolt', EOL: 'verified', SP: 'print',
  METALMASK: 'grid_on', VISCOSITY: 'water_drop',
};

interface Equipment { equipment_id: string; online: boolean; last_seen: string; metadata: Record<string, string> }
interface Props { equipments: Equipment[]; logs?: Array<{ EQUIPMENT_ID: string; STATUS: string }> }

const SKIP = new Set([
  'equipment_id', 'equipment_type', 'line_code', 'log_type',
  'description', 'last_seen', 'source',
]);

export function CollectorGrid({ equipments, logs = [] }: Props) {
  const up = equipments.filter(e => e.online).length;
  const dn = equipments.length - up;
  const { t } = useI18n();

  const stats = useMemo(() => {
    const m: Record<string, { ok: number; err: number }> = {};
    for (const log of logs) {
      if (!log.EQUIPMENT_ID) continue;
      if (!m[log.EQUIPMENT_ID]) m[log.EQUIPMENT_ID] = { ok: 0, err: 0 };
      log.STATUS === 'SUCCESS' ? m[log.EQUIPMENT_ID].ok++ : m[log.EQUIPMENT_ID].err++;
    }
    return m;
  }, [logs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
          {t('collector.title')}
        </span>
        <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums select-none">
          <span className="text-muted-foreground">{equipments.length} {t('collector.total')}</span>
          <span className="text-emerald-600 dark:text-emerald-400">{up} {t('collector.online')}</span>
          {dn > 0 && <span className="text-red-500 dark:text-red-400">{dn} {t('collector.offline')}</span>}
        </div>
      </div>

      {!equipments.length ? (
        <div className="flex flex-col items-center justify-center py-24 select-none">
          <Icon name="sensors_off" size="xl" className="text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground/50">{t('collector.empty')}</p>
          <p className="text-xs text-muted-foreground/30 mt-1">{t('collector.emptyDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {equipments.map(eq => {
            const m = eq.metadata ?? {};
            const type = m.equipment_type || '';
            const line = m.line_code || '';
            const log = m.log_type || '';
            const desc = m.description || '';
            const ok = eq.online;
            const s = stats[eq.equipment_id] || { ok: 0, err: 0 };
            const total = s.ok + s.err;
            const rate = total > 0 ? Math.round(s.ok / total * 100) : -1;
            const extra = Object.entries(m).filter(([k]) => !SKIP.has(k));

            return (
              <div key={eq.equipment_id}
                className={`rounded-xl overflow-hidden border transition-all
                  bg-white dark:bg-[#0f172a]
                  hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-black/30
                  ${ok ? 'border-emerald-100 dark:border-emerald-900/30 hover:border-emerald-200 dark:hover:border-emerald-700/40'
                       : 'border-red-100 dark:border-red-900/30 hover:border-red-200 dark:hover:border-red-700/40'}`}>
                <div className={`h-[2px] ${ok
                  ? 'bg-gradient-to-r from-emerald-500 dark:from-emerald-400 to-emerald-500/0 dark:to-emerald-400/0'
                  : 'bg-gradient-to-r from-red-500 dark:from-red-400 to-red-500/0 dark:to-red-400/0'}`} />

                <div className="p-4 space-y-3">
                  {/* ID + Status */}
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 size-10 rounded-xl flex items-center justify-center border
                      ${ok ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                           : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-500 dark:text-red-400'}`}>
                      <Icon name={ICONS[type] || 'memory'} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[15px] font-bold text-slate-800 dark:text-white truncate">
                          {eq.equipment_id}
                        </span>
                        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5
                          rounded-full text-[10px] font-bold border
                          ${ok ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                               : 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border-red-200 dark:border-red-500/25'}`}>
                          <span className={`size-1.5 rounded-full
                            ${ok ? 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                                 : 'bg-red-500 dark:bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]'}`} />
                          {ok ? t('collector.online') : t('collector.offline')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {type && <span className="text-[10px] text-slate-500 dark:text-slate-400">{type}</span>}
                        {type && log && <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>}
                        {log && <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono">{log}</span>}
                      </div>
                    </div>
                  </div>
                  {desc && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate" title={desc}>{desc}</p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="bg-slate-50 dark:bg-white/[0.03] rounded-lg px-2 py-2 text-center">
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        {t('collector.success')}</div>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums font-mono leading-none">
                        {s.ok}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/[0.03] rounded-lg px-2 py-2 text-center">
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        {t('collector.fail')}</div>
                      <div className={`text-lg font-bold tabular-nums font-mono leading-none
                        ${s.err > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-300 dark:text-slate-700'}`}>
                        {s.err}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/[0.03] rounded-lg px-2 py-2 text-center">
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        {t('collector.rate')}</div>
                      <div className={`text-lg font-bold tabular-nums font-mono leading-none
                        ${rate < 0 ? 'text-slate-300 dark:text-slate-700'
                          : rate >= 90 ? 'text-cyan-600 dark:text-cyan-400'
                          : rate >= 50 ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
                        {rate < 0 ? '—' : `${rate}%`}</div>
                      {rate >= 0 && (
                        <div className="h-[2px] rounded-full bg-slate-200 dark:bg-slate-800 mt-1.5 mx-1">
                          <div className={`h-full rounded-full transition-all
                            ${rate >= 90 ? 'bg-cyan-500 dark:bg-cyan-400'
                              : rate >= 50 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-red-500 dark:bg-red-400'}`}
                            style={{ width: `${rate}%` }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2
                    border-t border-slate-100 dark:border-slate-800 text-[10px]
                    text-slate-400 dark:text-slate-500 font-mono">
                    <span className="flex items-center gap-1">
                      {line && <><Icon name="conversion_path" size="xs"
                        className="text-slate-300 dark:text-slate-600" />{line}</>}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="schedule" size="xs" className="text-slate-300 dark:text-slate-600" />
                      {elapsed(eq.last_seen)}
                    </span>
                  </div>
                  {extra.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {extra.map(([k, v]) => (
                        <span key={k} className="text-[9px] font-mono px-1.5 py-px rounded
                          bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">{k}:{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
