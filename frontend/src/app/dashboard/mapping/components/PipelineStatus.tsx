/**
 * @file components/PipelineStatus.tsx
 * @description 송신기(설비)별 파이프라인 설정 상태 5단계 스텝 바
 *
 * 초보자 가이드:
 * 1. **송신기 선택**: 상단 칩에 진행률 표시, 클릭하면 해당 설비 기준 파이프라인 표시
 * 2. **5단계 판정**: 수신기 → 이 송신기 → VRL 파싱(설비유형) → 테이블 → 매핑
 * 3. **클릭 이동**: 각 단계 클릭 시 해당 설정 페이지로 이동
 * 4. **칩 색상**: 초록=전체완료, 노랑=일부완료, 회색=미완료
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface StepState { done: boolean; detail: string }

interface BaseData {
  aggOk: boolean;
  agentNames: string[];
  parseRules: Record<string, Array<{ fieldName: string }>>;
  registryTables: string[];
  registryProcs: string[];
  registryRows: Array<{ TABLE_NAME: string; SOURCE_FIELD?: string | null }>;
}

const ICONS = ['cell_tower', 'router', 'code', 'table_chart', 'check_circle'] as const;
const LINKS = ['/dashboard/receiver', '/dashboard/sender', '/dashboard/simulator', '/dashboard/mapping', '/dashboard/mapping'] as const;

const getEquipType = (toml: string) =>
  toml.match(/\.equipment_type\s*=\s*"([^"]*)"/)?.[1] ?? '';

const matchesType = (name: string, type: string) => {
  if (!type) return false;
  return new RegExp(`(^|[_.])${type}([_.]|$)`, 'i').test(name);
};

interface Props {
  refreshKey?: number;
  onEquipmentSelect?: (equipType: string | null) => void;
}

export default function PipelineStatus({ refreshKey = 0, onEquipmentSelect }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [base, setBase] = useState<BaseData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [equipCache, setEquipCache] = useState<Record<string, string>>({});

  /* 기반 데이터 로드 */
  useEffect(() => {
    (async () => {
      const [agg, agent, rules, keys, reg] = await Promise.allSettled([
        apiFetch<{ content: string }>('/api/monitor/aggregator/config'),
        apiFetch<{ names: string[] }>('/api/monitor/agent/configs'),
        apiFetch<{ rules: Record<string, Array<{ fieldName: string }>> }>('/api/monitor/parse-rules'),
        apiFetch<{ tables: string[]; procedures: string[] }>('/api/monitor/registry-keys'),
        apiFetch<{ rows: Array<{ TABLE_NAME: string; SOURCE_FIELD?: string | null }> }>('/api/monitor/registry'),
      ]);
      const data: BaseData = {
        aggOk: agg.status === 'fulfilled' && (agg.value.content?.length ?? 0) > 0,
        agentNames: agent.status === 'fulfilled' ? agent.value.names : [],
        parseRules: rules.status === 'fulfilled' ? rules.value.rules : {},
        registryTables: keys.status === 'fulfilled' ? keys.value.tables : [],
        registryProcs: keys.status === 'fulfilled' ? keys.value.procedures : [],
        registryRows: reg.status === 'fulfilled' ? reg.value.rows : [],
      };
      setBase(data);
    })();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 전체 agent의 equipment_type 일괄 로드 */
  useEffect(() => {
    if (!base || base.agentNames.length === 0) return;
    Promise.all(
      base.agentNames.map(name =>
        apiFetch<{ content: string }>(`/api/monitor/agent/config/${name}`)
          .then(r => [name, getEquipType(r.content)] as const)
          .catch(() => [name, ''] as const),
      ),
    ).then(results => {
      const cache: Record<string, string> = {};
      results.forEach(([n, et]) => { cache[n] = et; });
      setEquipCache(cache);
    });
  }, [base]);

  if (!base || base.agentNames.length === 0) return null;

  const labels = [
    t('mapping.pipeline.receiver'), t('mapping.pipeline.sender'),
    t('mapping.pipeline.vrl'), t('mapping.pipeline.table'), t('mapping.pipeline.mapping'),
  ];

  /* agent 기준 완료 단계 수 계산 (0~5) */
  const countDone = (name: string): number => {
    const et = equipCache[name];
    if (et === undefined) return -1;
    let n = base.aggOk ? 1 : 0;
    n += 1; // 송신기 자체는 항상 존재
    if (et && (base.parseRules[et]?.length ?? 0) > 0) n++;
    const mT = base.registryTables.filter(t => matchesType(t, et));
    const mP = base.registryProcs.filter(p => matchesType(p, et));
    if (mT.length + mP.length > 0) n++;
    if (base.registryRows.some(r => r.SOURCE_FIELD && mT.includes(r.TABLE_NAME))) n++;
    return n;
  };

  /* 선택된 agent 기준 5단계 파이프라인 판정 */
  const deriveSteps = (): StepState[] | null => {
    const et = selected ? equipCache[selected] : undefined;
    if (et === undefined) return null;
    const fields = et ? base.parseRules[et] ?? [] : [];
    const mTbl = base.registryTables.filter(n => matchesType(n, et));
    const mProc = base.registryProcs.filter(n => matchesType(n, et));
    const mapped = new Set(
      base.registryRows.filter(r => r.SOURCE_FIELD && mTbl.includes(r.TABLE_NAME)).map(r => r.TABLE_NAME),
    );
    const fmt = (a: string[], max = 1) =>
      a.length <= max ? a.join(', ') : `${a[0]} +${a.length - 1}`;
    return [
      { done: base.aggOk, detail: base.aggOk ? t('mapping.pipeline.configured') : '-' },
      { done: true, detail: selected ?? '' },
      { done: fields.length > 0, detail: fields.length > 0 ? `${et} · ${fields.length}${t('mapping.pipeline.fieldsUnit')}` : et || '-' },
      { done: mTbl.length + mProc.length > 0, detail: mTbl.length + mProc.length > 0 ? fmt([...mTbl, ...mProc]) : '-' },
      { done: mapped.size > 0, detail: mapped.size > 0 ? `${mapped.size}${t('mapping.pipeline.targets')}` : '-' },
    ];
  };

  const steps = deriveSteps();

  /* 칩 색상: 5=초록, 2~4=노랑, 0~1=회색 */
  const chipColor = (name: string) => {
    const c = countDone(name);
    if (c < 0) return 'bg-muted-foreground/10 text-muted-foreground';
    if (c >= 5) return 'bg-success/10 text-success border border-success/30';
    if (c >= 3) return 'bg-warning/10 text-warning border border-warning/30';
    return 'bg-muted-foreground/10 text-muted-foreground border border-border dark:border-border-dark';
  };

  const dotColor = (name: string) => {
    const c = countDone(name);
    if (c < 0) return 'bg-muted-foreground/30';
    if (c >= 5) return 'bg-success';
    if (c >= 3) return 'bg-warning';
    return 'bg-muted-foreground/30';
  };

  return (
    <div className="rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark">
      {/* 송신기 선택 — 완료/미완료 섹션 분리 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border dark:border-border-dark flex-wrap">
        <Icon name="router" size="xs" className="text-muted-foreground shrink-0" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
          {t('mapping.pipeline.selectSender')}
        </span>
        {(() => {
          const done = base.agentNames.filter(n => countDone(n) >= 5);
          const prog = base.agentNames.filter(n => countDone(n) < 5);
          const handleChip = (name: string) => {
            const deselect = selected === name;
            setSelected(deselect ? null : name);
            if (onEquipmentSelect) {
              onEquipmentSelect(deselect ? null : (equipCache[name] || null));
            }
          };
          const renderChip = (name: string) => {
            const c = countDone(name);
            const isSel = selected === name;
            return (
              <button key={name} onClick={() => handleChip(name)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap
                  ${isSel ? 'bg-primary text-white' : chipColor(name)}`}>
                {!isSel && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor(name)}`} />}
                {name}
                {!isSel && c >= 0 && <span className="opacity-60">{c}/5</span>}
              </button>
            );
          };
          return (
            <>
              {done.length > 0 && (
                <>
                  <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded shrink-0">
                    {t('mapping.pipeline.complete')}
                  </span>
                  {done.map(renderChip)}
                </>
              )}
              {done.length > 0 && prog.length > 0 && (
                <div className="w-px h-5 bg-border dark:bg-border-dark shrink-0 mx-1" />
              )}
              {prog.length > 0 && (
                <>
                  <span className="text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded shrink-0">
                    {t('mapping.pipeline.incomplete')}
                  </span>
                  {prog.map(renderChip)}
                </>
              )}
            </>
          );
        })()}
      </div>

      {/* 파이프라인 스텝 */}
      {steps ? (
        <div className="flex items-start justify-between gap-1 px-4 py-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start flex-1 min-w-0">
              <button onClick={() => router.push(LINKS[i])}
                className="flex flex-col items-center gap-1 min-w-[72px] group cursor-pointer">
                <div className="relative">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
                    ${step.done
                      ? 'bg-success text-white shadow-sm shadow-success/30'
                      : 'border-2 border-dashed border-muted-foreground/30 text-muted-foreground/40 bg-transparent'}`}>
                    <Icon name={ICONS[i]} size="sm" />
                  </div>
                  {step.done && (
                    <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full
                      bg-white dark:bg-slate-900 flex items-center justify-center">
                      <Icon name="check_circle" className="text-success !text-[12px]" />
                    </div>
                  )}
                </div>
                <span className={`text-xs font-bold text-center leading-tight
                  group-hover:text-primary transition-colors
                  ${step.done ? 'text-text dark:text-white' : 'text-muted-foreground/40'}`}>
                  {labels[i]}
                </span>
                <span className={`text-[10px] text-center leading-tight truncate max-w-[88px] font-medium
                  ${step.done ? 'text-success' : 'text-muted-foreground/30'}`}
                  title={step.detail}>
                  {step.detail}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div className="flex-1 flex items-center pt-4 px-1 min-w-[16px]">
                  <div className={`w-full rounded
                    ${step.done && steps[i + 1].done
                      ? 'h-0.5 bg-success/50'
                      : 'h-0 border-t-2 border-dashed border-muted-foreground/15'}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground/50">
          <Icon name="touch_app" size="sm" />
          <span className="text-xs font-medium">{t('mapping.pipeline.selectSender')}</span>
        </div>
      )}
    </div>
  );
}
