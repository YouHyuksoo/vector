/**
 * @file CollectorGrid.tsx — 설비 수집기 상태 그리드
 * @description 하트비트 기반 설비 카드를 컴팩트하게 표시. 성공/실패/성공률 통계 포함.
 *   카드 클릭 시 해당 장비의 최근 처리 내역을 인라인 패널로 표시.
 *   초보자 가이드: 장비 대시보드에서 각 설비의 온/오프라인 상태와 로그 처리 현황을 보여줍니다.
 */
'use client';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { RemoteTabPanel } from '../equipment/components/RemoteTabPanel';

function elapsed(iso: string, serverNow?: number) {
  if (!iso) return '—';
  const now = serverNow ?? Date.now();
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 0) return 'now';
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const ICONS: Record<string, string> = {
  AOI: 'visibility', SPI: 'layers', MAOI: 'center_focus_strong',
  MOUNTER: 'precision_manufacturing', REFLOW: 'local_fire_department',
  ICT: 'developer_board', FCT: 'fact_check', BURNIN: 'thermostat',
  HIPOT: 'bolt', EOL: 'verified', SP: 'print',
  METALMASK: 'grid_on', VISCOSITY: 'water_drop',
};

interface Equipment { equipment_id: string; online: boolean; last_seen: string; metadata: Record<string, string> }
interface LogEntry { LOG_ID?: number; SOURCE_TABLE?: string; EQUIPMENT_ID: string; MESSAGE?: string; STAGE?: string; STATUS: string; CREATED_AT?: string }
interface Props { equipments: Equipment[]; logs?: LogEntry[]; serverTimestamp?: string }

const SKIP = new Set([
  'equipment_id', 'equipment_type', 'line_code', 'log_type',
  'description', 'last_seen', 'source', 'ip',
]);

/** 카드 클릭 시 표시되는 최근 처리 내역 패널 */
function ActivityPanel({ logs, t }: { logs: LogEntry[]; t: (k: string) => string }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground/50">
        {t('collector.noActivity')}
      </div>
    );
  }
  return (
    <div className="max-h-48 overflow-y-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-muted-foreground/60 border-b border-border/30 dark:border-border-dark/30">
            <th className="text-left py-1 pr-2">{t('error.time')}</th>
            <th className="text-left py-1 pr-2">{t('error.table')}</th>
            <th className="text-left py-1 pr-2">{t('errors.status')}</th>
            <th className="text-left py-1">{t('error.message')}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <tr key={log.LOG_ID ?? i} className="border-b border-border/10 dark:border-border-dark/10 last:border-0">
              <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">
                {log.CREATED_AT ?? '—'}
              </td>
              <td className="py-1 pr-2 text-muted-foreground truncate max-w-[80px]">{log.SOURCE_TABLE || '—'}</td>
              <td className="py-1 pr-2">
                <span className={log.STATUS === 'SUCCESS' ? 'text-primary' : 'text-destructive'}>
                  {log.STATUS}
                </span>
              </td>
              <td className="py-1 text-muted-foreground truncate max-w-[150px]">{log.MESSAGE || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CollectorGrid({ equipments, logs = [], serverTimestamp }: Props) {
  const up = equipments.filter(e => e.online).length;
  const dn = equipments.length - up;
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const serverNow = serverTimestamp ? new Date(serverTimestamp).getTime() : undefined;

  const stats = useMemo(() => {
    const m: Record<string, { ok: number; err: number }> = {};
    for (const log of logs) {
      if (!log.EQUIPMENT_ID) continue;
      if (!m[log.EQUIPMENT_ID]) m[log.EQUIPMENT_ID] = { ok: 0, err: 0 };
      log.STATUS === 'SUCCESS' ? m[log.EQUIPMENT_ID].ok++ : m[log.EQUIPMENT_ID].err++;
    }
    return m;
  }, [logs]);

  const selectedLogs = useMemo(() => {
    if (!selectedId) return [];
    return logs.filter(l => l.EQUIPMENT_ID === selectedId);
  }, [logs, selectedId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
          {t('collector.title')}
        </span>
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums select-none">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
          {[...equipments].sort((a, b) => {
            const lineA = a.metadata?.line_code || '';
            const lineB = b.metadata?.line_code || '';
            if (lineA !== lineB) return lineA.localeCompare(lineB);
            return a.equipment_id.localeCompare(b.equipment_id);
          }).map(eq => {
            const m = eq.metadata ?? {};
            const type = m.equipment_type || '';
            const line = m.line_code || '';
            const log = m.log_type || '';
            const ip = m.ip || '';
            const ok = eq.online;
            const s = stats[eq.equipment_id] || { ok: 0, err: 0 };
            const total = s.ok + s.err;
            const rate = total > 0 ? Math.round(s.ok / total * 100) : -1;
            const extra = Object.entries(m).filter(([k]) => !SKIP.has(k));
            const isSelected = selectedId === eq.equipment_id;

            return (
              <div key={eq.equipment_id} className="flex flex-col">
                <div
                  onClick={() => setSelectedId(isSelected ? null : eq.equipment_id)}
                  className={`rounded-lg border bg-white dark:bg-background-dark p-3 transition-all
                    cursor-pointer hover:shadow-md
                    ${ok ? 'border-border dark:border-border-dark' : 'border-destructive/30 dark:border-destructive/30'}
                    ${isSelected ? 'ring-2 ring-primary/50' : ''}`}>

                  {/* 헤더: ID + 상태 */}
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={ICONS[type] || 'memory'} size="xs"
                      className={ok ? 'text-primary' : 'text-destructive'} />
                    <span className="font-mono text-base font-bold text-foreground dark:text-white truncate flex-1">
                      {eq.equipment_id}
                    </span>
                    <span className={`size-2 rounded-full shrink-0 ${
                      ok ? 'bg-primary shadow-[0_0_4px_var(--primary)]' : 'bg-destructive'
                    }`} />
                  </div>

                  {/* 타입 + 로그 */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    {type && <span>{type}</span>}
                    {type && log && <span>·</span>}
                    {log && <span className="font-mono">{log}</span>}
                  </div>

                  {/* 통계: 한 줄 */}
                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums mb-2">
                    <span className="text-primary">{s.ok}<span className="text-muted-foreground/60 ml-0.5 text-[11px]">{t('collector.success')}</span></span>
                    <span className={s.err > 0 ? 'text-destructive' : 'text-muted-foreground/30'}>
                      {s.err}<span className="text-muted-foreground/60 ml-0.5 text-[11px]">{t('collector.fail')}</span>
                    </span>
                    <span className={rate < 0 ? 'text-muted-foreground/30' : 'text-foreground dark:text-white'}>
                      {rate < 0 ? '—' : `${rate}%`}
                    </span>
                  </div>

                  {/* 푸터: 라인 + IP + 경과시간 */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground/60 font-mono
                    pt-1.5 border-t border-border/50 dark:border-border-dark/50">
                    <div className="flex items-center gap-1.5">
                      <span>{line || '—'}</span>
                      {ip && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <span className="text-muted-foreground/80">{ip}</span>
                        </>
                      )}
                    </div>
                    <span className="flex items-center gap-0.5">
                      <Icon name="schedule" size="xs" className="text-muted-foreground/40" />
                      {elapsed(eq.last_seen, serverNow)}
                    </span>
                  </div>

                  {extra.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {extra.map(([k, v]) => (
                        <span key={k} className="text-[11px] font-mono px-1.5 py-px rounded
                          bg-secondary text-muted-foreground">{k}:{v}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 선택 시 원격 관리 탭 패널 */}
                {isSelected && (
                  <RemoteTabPanel
                    equipmentId={eq.equipment_id}
                    activityPanel={
                      <div>
                        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-foreground dark:text-white">
                          <Icon name="history" size="xs" className="text-primary" />
                          {t('collector.recentActivity')}
                        </div>
                        <ActivityPanel logs={selectedLogs} t={t} />
                      </div>
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
