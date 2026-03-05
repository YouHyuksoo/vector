/**
 * @file CollectorGrid.tsx — 설비 수집기 상태 그리드
 * @description 하트비트 기반 설비 카드를 컴팩트하게 표시. 성공/실패/성공률 통계 포함.
 *   초보자 가이드: 장비 대시보드에서 각 설비의 온/오프라인 상태와 로그 처리 현황을 보여줍니다.
 */
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
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
          {t('collector.title')}
        </span>
        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums select-none">
          <span className="text-muted-foreground">{equipments.length} {t('collector.total')}</span>
          <span className="text-primary">{up} {t('collector.online')}</span>
          {dn > 0 && <span className="text-destructive">{dn} {t('collector.offline')}</span>}
        </div>
      </div>

      {!equipments.length ? (
        <div className="flex flex-col items-center justify-center py-16 select-none">
          <Icon name="sensors_off" size="xl" className="text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground/50">{t('collector.empty')}</p>
          <p className="text-xs text-muted-foreground/30 mt-1">{t('collector.emptyDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {equipments.map(eq => {
            const m = eq.metadata ?? {};
            const type = m.equipment_type || '';
            const line = m.line_code || '';
            const log = m.log_type || '';
            const ok = eq.online;
            const s = stats[eq.equipment_id] || { ok: 0, err: 0 };
            const total = s.ok + s.err;
            const rate = total > 0 ? Math.round(s.ok / total * 100) : -1;
            const extra = Object.entries(m).filter(([k]) => !SKIP.has(k));

            return (
              <div key={eq.equipment_id}
                className={`rounded-lg border bg-white dark:bg-background-dark p-3 transition-all
                  hover:shadow-md
                  ${ok ? 'border-border dark:border-border-dark' : 'border-destructive/30 dark:border-destructive/30'}`}>

                {/* 헤더: ID + 상태 */}
                <div className="flex items-center gap-2 mb-2">
                  <Icon name={ICONS[type] || 'memory'} size="xs"
                    className={ok ? 'text-primary' : 'text-destructive'} />
                  <span className="font-mono text-sm font-bold text-foreground dark:text-white truncate flex-1">
                    {eq.equipment_id}
                  </span>
                  <span className={`size-2 rounded-full shrink-0 ${
                    ok ? 'bg-primary shadow-[0_0_4px_var(--primary)]' : 'bg-destructive'
                  }`} />
                </div>

                {/* 타입 + 로그 */}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                  {type && <span>{type}</span>}
                  {type && log && <span>·</span>}
                  {log && <span className="font-mono">{log}</span>}
                </div>

                {/* 통계: 한 줄 */}
                <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums mb-2">
                  <span className="text-primary">{s.ok}<span className="text-muted-foreground/60 ml-0.5 text-[9px]">{t('collector.success')}</span></span>
                  <span className={s.err > 0 ? 'text-destructive' : 'text-muted-foreground/30'}>
                    {s.err}<span className="text-muted-foreground/60 ml-0.5 text-[9px]">{t('collector.fail')}</span>
                  </span>
                  <span className={rate < 0 ? 'text-muted-foreground/30' : 'text-foreground dark:text-white'}>
                    {rate < 0 ? '—' : `${rate}%`}
                  </span>
                </div>

                {/* 푸터: 라인 + 경과시간 */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 font-mono
                  pt-1.5 border-t border-border/50 dark:border-border-dark/50">
                  <span>{line || '—'}</span>
                  <span className="flex items-center gap-0.5">
                    <Icon name="schedule" size="xs" className="text-muted-foreground/40" />
                    {elapsed(eq.last_seen)}
                  </span>
                </div>

                {extra.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {extra.map(([k, v]) => (
                      <span key={k} className="text-[9px] font-mono px-1.5 py-px rounded
                        bg-secondary text-muted-foreground">{k}:{v}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
