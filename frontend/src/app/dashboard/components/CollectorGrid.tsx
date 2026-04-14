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
  return `${h}h ${m}m`;
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
  'excluded', 'registered_at',
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
                <span className={log.STATUS === 'SUCCESS' ? 'text-primary' : 'text-orange-400'}>
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

/** 섹션 헤더 — 그룹 라벨 + 카운트 뱃지 */
function SectionLabel({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className={`size-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground">
        {label}
      </span>
      <span className="text-xs font-mono tabular-nums px-1.5 py-px rounded
        bg-secondary dark:bg-[oklch(0.30_0.055_281)]
        text-muted-foreground dark:text-[oklch(0.62_0.018_270)]">
        {count}
      </span>
      <div className="flex-1 h-px bg-border/40 dark:bg-[oklch(0.36_0.070_281)]" />
    </div>
  );
}

export function CollectorGrid({ equipments, logs = [], serverTimestamp }: Props) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const serverNow = serverTimestamp ? new Date(serverTimestamp).getTime() : undefined;

  const handleToggleExclude = async (equipmentId: string, currentExcluded: boolean) => {
    try {
      await fetch(`/api/monitor/equipment-registry/${equipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded: !currentExcluded }),
      });
    } catch { /* 무시 */ }
  };

  const handleDelete = async (equipmentId: string) => {
    try {
      const res = await fetch(`/api/monitor/equipment-registry/${equipmentId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletedIds(prev => new Set([...prev, equipmentId]));
        setSelectedId(null);
      }
    } catch { /* 무시 */ } finally {
      setDeletingId(null);
    }
  };

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

  // 정렬 기준: line_code → equipment_id (삭제된 항목 제외)
  const sorted = useMemo(() => [...equipments]
    .filter(e => !deletedIds.has(e.equipment_id))
    .sort((a, b) => {
      const la = a.metadata?.line_code || '', lb = b.metadata?.line_code || '';
      return la !== lb ? la.localeCompare(lb) : a.equipment_id.localeCompare(b.equipment_id);
    }), [equipments, deletedIds]);

  // 3개 그룹 분리
  const groups = useMemo(() => ({
    online:  sorted.filter(e => e.online && e.metadata?.excluded !== 'true'),
    offline: sorted.filter(e => !e.online && e.metadata?.excluded !== 'true'),
    skipped: sorted.filter(e => e.metadata?.excluded === 'true'),
  }), [sorted]);

  // 카드 목록 렌더링 (3개 섹션 공통)
  const renderGrid = (eqs: Equipment[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
      {eqs.map(eq => {
            const m = eq.metadata ?? {};
            const type = m.equipment_type || '';
            const line = m.line_code || '';
            const log = m.log_type || '';
            const ip = m.ip || '';
            const ok = eq.online;
            const excluded = m.excluded === 'true';
            const s = stats[eq.equipment_id] || { ok: 0, err: 0 };
            const total = s.ok + s.err;
            const rate = total > 0 ? Math.round(s.ok / total * 100) : -1;
            const extra = Object.entries(m).filter(([k]) => !SKIP.has(k));
            const isSelected = selectedId === eq.equipment_id;

            const cardGlow = excluded
              ? 'dark:shadow-[0_0_0_1px_oklch(0.78_0.180_60/0.35),0_4px_20px_oklch(0_0_0/0.5)]'
              : ok
              ? 'dark:shadow-[0_0_0_1px_oklch(0.75_0.260_341/0.3),0_4px_20px_oklch(0_0_0/0.5)]'
              : 'dark:shadow-[0_0_0_1px_oklch(0.55_0.010_270/0.4),0_4px_20px_oklch(0_0_0/0.5)]';

            return (
              <div key={eq.equipment_id} className="flex flex-col">
                <div
                  onClick={() => setSelectedId(isSelected ? null : eq.equipment_id)}
                  className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200
                    bg-white dark:bg-[oklch(0.26_0.055_281)]
                    border border-border/60 dark:border-[oklch(0.42_0.080_281)]
                    shadow-sm ${cardGlow}
                    hover:dark:bg-[oklch(0.29_0.060_281)]
                    hover:scale-[1.01] hover:dark:shadow-[0_0_0_1px_oklch(0.75_0.260_341/0.5),0_6px_24px_oklch(0_0_0/0.6)]
                    ${isSelected ? 'ring-2 ring-primary dark:ring-primary/70 scale-[1.01]' : ''}`}>

                  {/* 상단 상태 바 */}
                  <div className={`h-[3px] w-full ${
                    excluded ? 'bg-warning' : ok ? 'bg-primary' : 'bg-muted-foreground/40'
                  }`} />

                  <div className="p-3">
                    {/* 헤더: 아이콘 + ID + 상태 닷 */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon name={ICONS[type] || 'memory'} size="xs"
                        className={`shrink-0 ${excluded ? 'text-warning' : ok ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      <div className="min-w-0 flex-1 flex items-baseline gap-1.5 truncate">
                        {line && (
                          <span className="text-[10px] font-mono font-semibold text-muted-foreground dark:text-[oklch(0.65_0.020_270)] shrink-0">
                            {line}
                          </span>
                        )}
                        <span className="font-mono text-sm font-bold text-foreground dark:text-white truncate">
                          {eq.equipment_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {excluded && (
                          <span className="text-[9px] font-mono font-bold px-1 py-px rounded
                            bg-warning/20 dark:bg-warning/15 text-warning border border-warning/40">
                            SKIP
                          </span>
                        )}
                        <span className={`size-2.5 rounded-full ${
                          excluded
                            ? 'bg-warning shadow-[0_0_6px_var(--warning)]'
                            : ok
                            ? 'bg-primary shadow-[0_0_8px_var(--primary)]'
                            : 'bg-muted-foreground/40'
                        }`} />
                      </div>
                    </div>

                    {/* 타입 뱃지 + 처리건수 한 줄 */}
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      {type && (
                        <span className="text-[11px] font-semibold px-1.5 py-px rounded
                          bg-secondary dark:bg-[oklch(0.33_0.065_281)]
                          text-text dark:text-[oklch(0.82_0.020_270)] shrink-0">
                          {type}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
                        <span className="text-primary font-semibold">{s.ok}<span className="text-muted-foreground/50 font-normal ml-px">✓</span></span>
                        <span className={s.err > 0 ? 'text-orange-400 font-semibold' : 'text-muted-foreground/30'}>{s.err}<span className="text-muted-foreground/50 font-normal ml-px">✗</span></span>
                        <span className={`font-bold ${rate < 0 ? 'text-muted-foreground/30' : 'text-foreground dark:text-white'}`}>
                          {rate < 0 ? '—' : `${rate}%`}
                        </span>
                      </div>
                    </div>

                    {/* 성공률 바 */}
                    <div className="h-1 rounded-full bg-border/50 dark:bg-[oklch(0.33_0.065_281)] overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          rate >= 90 ? 'bg-primary' : rate >= 70 ? 'bg-warning' : total > 0 ? 'bg-muted-foreground/50' : 'bg-transparent'
                        }`}
                        style={{ width: rate >= 0 ? `${rate}%` : '0%' }}
                      />
                    </div>

                    {/* 하단: IP + 경과시간 */}
                    <div className="flex items-center justify-between pt-1.5
                      border-t border-border/40 dark:border-[oklch(0.36_0.070_281)]">
                      <span className="text-[10px] font-mono text-muted-foreground dark:text-[oklch(0.58_0.018_270)] truncate">
                        {ip || '—'}
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] font-mono
                        text-muted-foreground dark:text-[oklch(0.58_0.018_270)] shrink-0">
                        <Icon name="schedule" size="xs" />
                        {elapsed(eq.last_seen, serverNow)}
                      </span>
                    </div>

                    {extra.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {extra.map(([k, v]) => (
                          <span key={k} className="text-[9px] font-mono px-1 py-px rounded
                            bg-secondary dark:bg-[oklch(0.31_0.062_281)]
                            text-muted-foreground dark:text-[oklch(0.62_0.018_270)]">
                            {k}:{v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 선택 시 원격 관리 탭 패널 */}
                {isSelected && (
                  <div className="flex items-center gap-3 px-4 py-3 mt-1 rounded-t-lg
                    border border-b-0 border-border dark:border-[oklch(0.42_0.080_281)]
                    bg-secondary/30 dark:bg-[oklch(0.22_0.045_281)]">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleExclude(eq.equipment_id, excluded); }}
                      className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border shadow-sm transition-all active:scale-95 ${
                        excluded
                          ? 'bg-warning/20 text-warning border-warning/40 hover:bg-warning/30'
                          : 'bg-white dark:bg-[oklch(0.32_0.065_281)] text-text dark:text-white border-border dark:border-[oklch(0.42_0.080_281)] hover:bg-surface dark:hover:bg-[oklch(0.36_0.070_281)]'
                      }`}
                    >
                      <Icon name={excluded ? 'play_arrow' : 'block'} size="sm" />
                      {excluded ? '파이프라인 활성화' : '파이프라인 배제'}
                    </button>

                    {/* 삭제 버튼 / 확인 단계 */}
                    {deletingId === eq.equipment_id ? (
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-sm text-error">정말 삭제하시겠습니까?</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(eq.equipment_id); }}
                          className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg
                            bg-error/20 text-error border border-error/40 hover:bg-error/30 transition-all active:scale-95"
                        >
                          <Icon name="check" size="sm" /> 삭제
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                          className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg
                            bg-secondary text-muted-foreground border border-border dark:border-[oklch(0.42_0.080_281)]
                            hover:bg-surface transition-all active:scale-95"
                        >
                          <Icon name="close" size="sm" /> 취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(eq.equipment_id); }}
                        className="ml-auto flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border shadow-sm
                          bg-white dark:bg-[oklch(0.32_0.065_281)] text-error border-error/30
                          hover:bg-error/10 transition-all active:scale-95"
                      >
                        <Icon name="delete" size="sm" />
                        삭제
                      </button>
                    )}

                    {excluded && deletingId !== eq.equipment_id && (
                      <span className="text-sm text-warning/80">파일 저장은 계속되며, DB INSERT만 스킵됩니다</span>
                    )}
                  </div>
                )}
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
  );

  const up = groups.online.length;
  const dn = groups.offline.length;
  const sk = groups.skipped.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
          {t('collector.title')}
        </span>
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums select-none">
          <span className="text-muted-foreground">{equipments.length} {t('collector.total')}</span>
          <span className="text-primary">{up} {t('collector.online')}</span>
          {dn > 0 && <span className="text-muted-foreground">{dn} {t('collector.offline')}</span>}
          {sk > 0 && <span className="text-warning">{sk} SKIP</span>}
        </div>
      </div>

      {!equipments.length ? (
        <div className="flex flex-col items-center justify-center py-16 select-none">
          <Icon name="sensors_off" size="xl" className="text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground/50">{t('collector.empty')}</p>
          <p className="text-xs text-muted-foreground/30 mt-1">{t('collector.emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 온라인 */}
          {up > 0 && (
            <div>
              <SectionLabel label={t('collector.online')} count={up} dot="bg-primary shadow-[0_0_6px_var(--primary)]" />
              {renderGrid(groups.online)}
            </div>
          )}

          {/* 오프라인 */}
          {dn > 0 && (
            <div>
              <SectionLabel label={t('collector.offline')} count={dn} dot="bg-muted-foreground/50" />
              {renderGrid(groups.offline)}
            </div>
          )}

          {/* 스킵 */}
          {sk > 0 && (
            <div>
              <SectionLabel label="SKIP" count={sk} dot="bg-warning shadow-[0_0_6px_var(--warning)]" />
              {renderGrid(groups.skipped)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
