/**
 * @file src/app/dashboard/mapping/page.tsx
 * @description 타겟 매핑 관리 페이지 — 테이블 또는 프로시져로 데이터 매핑
 *
 * 초보자 가이드:
 * 1. **타겟 유형 선택**: TABLE(테이블 직접 삽입) 또는 PROCEDURE(프로시져 배열 전송)
 * 2. **TABLE 모드**: Oracle 테이블 선택 → 컬럼별 소스 필드 매핑
 * 3. **PROCEDURE 모드**: 프로시져명 입력 → 배열 순서대로 소스 필드 매핑
 * 4. **로그 유형 선택**: SP / AOI / REFLOW 등 설비 유형 선택
 * 5. **자동 매핑**: 컬럼명과 소스 필드를 자동으로 매칭 (TABLE 모드)
 * 6. **파싱 룰**: DB에서 설비별 data.* 필드를 런타임 로드
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import type { LogType, ParseField, TargetType } from './types';
import { getLogTypesFromRules } from './mapping-utils';
import { useTableMapping } from './hooks/useTableMapping';
import { useProcedureMapping } from './hooks/useProcedureMapping';
import SelectionPanel from './components/SelectionPanel';
import MappingTable from './components/MappingTable';
import ProcedureMapping from './components/ProcedureMapping';
import AutoCreateModal from './components/AutoCreateModal';
import PipelineStatus from './components/PipelineStatus';

interface TargetMapEntry { targetTable: string; targetType: string; }

export default function MappingPage() {
  const [targetType, setTargetType] = useState<TargetType>('TABLE');
  const [logType, setLogType] = useState<LogType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [parseRules, setParseRules] = useState<Record<string, ParseField[]>>({});
  const [autoCreateOpen, setAutoCreateOpen] = useState(false);
  const [forceRecreate, setForceRecreate] = useState(false);
  const [pipelineKey, setPipelineKey] = useState(0);
  const [targetMap, setTargetMap] = useState<Record<string, TargetMapEntry>>({});
  const autoSelecting = useRef(false);
  const { t } = useI18n();

  /** 자동 선택 중 loadTable/loadProcedure 내부 setLogType(null) 차단 */
  const guardedSetLogType = useCallback((v: LogType | null) => {
    if (autoSelecting.current && v === null) return;
    setLogType(v);
  }, []);

  const sharedOpts = { setLoading, setSaving, setSaveMsg, setLogType: guardedSetLogType, t };
  const tbl = useTableMapping({ logType, parseRules, ...sharedOpts });
  const proc = useProcedureMapping({ logType, ...sharedOpts });

  const loadParseRules = useCallback(async () => {
    try {
      const res = await apiFetch<{ rules: Record<string, ParseField[]> }>('/api/monitor/parse-rules');
      const rules = res.rules;
      if (!rules || Object.keys(rules).length === 0) {
        const syncRes = await apiFetch<{ synced: Record<string, number> }>('/api/monitor/parse-rules/sync', { method: 'POST' });
        if (syncRes.synced && Object.keys(syncRes.synced).length > 0) {
          const refreshed = await apiFetch<{ rules: Record<string, ParseField[]> }>('/api/monitor/parse-rules');
          setParseRules(refreshed.rules);
          return;
        }
      }
      setParseRules(rules);
    } catch { /* 테이블 미생성 시 무시 */ }
  }, []);

  useEffect(() => { loadParseRules(); }, [loadParseRules]);

  /** VRL 설정에서 설비유형 → target_table/target_type 매핑 로드 */
  useEffect(() => {
    apiFetch<{ map: Record<string, TargetMapEntry> }>('/api/monitor/vrl/target-map')
      .then(d => setTargetMap(d.map || {}))
      .catch(() => {});
  }, [pipelineKey]);

  const logTypes = getLogTypesFromRules(parseRules);
  const rawSave = targetType === 'TABLE' ? tbl.saveTableMapping : proc.saveProcedureMapping;
  const handleSave = useCallback(async () => { await rawSave(); setPipelineKey(k => k + 1); }, [rawSave]);
  const hasSelection = targetType === 'TABLE' ? !!tbl.selected : !!proc.selectedProc;
  const mappedCount = targetType === 'TABLE'
    ? tbl.registry.filter(r => r.SOURCE_FIELD).length
    : proc.procParams.filter(p => p.SOURCE_FIELD).length;

  /** 설비 유형 선택 시 targetMap 기반 테이블/프로시져 자동 선택 */
  useEffect(() => {
    if (!logType || autoSelecting.current) return;
    const entry = targetMap[logType];
    if (!entry) return;
    const isProc = entry.targetType === 'PROCEDURE';
    if (isProc && proc.oracleProcs.length === 0) return;

    autoSelecting.current = true;
    const run = async () => {
      try {
        if (isProc) {
          if (targetType !== 'PROCEDURE') { setTargetType('PROCEDURE'); tbl.reset(); }
          const found = proc.oracleProcs.find(p =>
            p.DISPLAY_NAME === entry.targetTable || p.OBJECT_NAME === entry.targetTable,
          ) ?? {
            DISPLAY_NAME: entry.targetTable, OBJECT_NAME: entry.targetTable,
            PACKAGE_NAME: null, OBJECT_TYPE: 'PROCEDURE', ARG_COUNT: 0,
          };
          await proc.loadProcedure(found);
        } else {
          if (targetType !== 'TABLE') { setTargetType('TABLE'); proc.reset(); }
          await tbl.loadTable(entry.targetTable);
        }
      } finally { autoSelecting.current = false; }
    };
    run();
  }, [logType, targetMap, proc.oracleProcs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoCreated = useCallback(async (name: string, createdLogType: string) => {
    setSaveMsg(t('mapping.createSuccess'));
    setPipelineKey(k => k + 1);
    if (targetType === 'TABLE') {
      await tbl.refreshTables();
      await tbl.loadTable(name);
      setLogType(createdLogType);
      setTimeout(() => tbl.handleAutoMap(), 300);
    } else {
      const freshProcs = await proc.refreshProcs();
      const found = freshProcs.find(p => p.DISPLAY_NAME === name || p.OBJECT_NAME === name)
        ?? { DISPLAY_NAME: name, OBJECT_NAME: name, PACKAGE_NAME: null, OBJECT_TYPE: 'PROCEDURE', ARG_COUNT: 0 };
      await proc.loadProcedure(found);
      setLogType(createdLogType);
    }
  }, [targetType, tbl, proc, t]);

  const switchTargetType = (type: TargetType) => {
    setTargetType(type);
    tbl.reset();
    proc.reset();
    setSaveMsg('');
    setLogType(null);
  };

  return (
    <>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="swap_horiz" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            {t('mapping.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">/ {t('mapping.subtitle')}</span>
        </h1>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-sm font-medium ${saveMsg.startsWith(t('mapping.error')) ? 'text-error' : 'text-success'}`}>
              {saveMsg}
            </span>
          )}
          {hasSelection && (
            <Button variant="primary" size="sm" leftIcon="save" onClick={handleSave} disabled={saving}>
              {saving ? t('mapping.saving') : t('mapping.save')}
            </Button>
          )}
        </div>
      </div>

      <PipelineStatus refreshKey={pipelineKey} onEquipmentSelect={setLogType} />

      {/* 타겟 유형 토글 + 강제 재생성 옵션 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            {t('mapping.targetType')}
          </span>
          <div className="flex rounded-lg border border-border dark:border-border-dark overflow-hidden">
            <button onClick={() => switchTargetType('TABLE')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all
                ${targetType === 'TABLE'
                  ? 'bg-primary text-white'
                  : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}>
              <Icon name="table_chart" size="xs" />
              {t('mapping.targetTable')}
            </button>
            <button onClick={() => switchTargetType('PROCEDURE')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all border-l border-border dark:border-border-dark
                ${targetType === 'PROCEDURE'
                  ? 'bg-primary text-white'
                  : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}>
              <Icon name="terminal" size="xs" />
              {t('mapping.targetProcedure')}
            </button>
          </div>
        </div>
        <label className={`flex items-center gap-1.5 cursor-pointer select-none
          ${forceRecreate ? 'text-error' : 'text-muted-foreground'}`}>
          <input type="checkbox" checked={forceRecreate} onChange={e => setForceRecreate(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-border accent-error cursor-pointer" />
          <Icon name="warning" size="xs" className={forceRecreate ? 'text-error' : 'text-muted-foreground/50'} />
          <span className="text-xs font-bold">
            {targetType === 'TABLE' ? t('mapping.forceRecreateTable') : t('mapping.forceRecreateProc')}
          </span>
        </label>
      </div>

      {/* 메인 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <SelectionPanel
          targetType={targetType}
          tables={tbl.tables} filteredTables={tbl.filteredTables} selected={tbl.selected}
          tableFilter={tbl.tableFilter} onTableFilterChange={tbl.setTableFilter} onSelectTable={tbl.loadTable}
          oracleProcs={proc.oracleProcs} filteredProcs={proc.filteredProcs} selectedProc={proc.selectedProc}
          procFilter={proc.procFilter} onProcFilterChange={proc.setProcFilter} onSelectProcedure={proc.loadProcedure}
          onAutoCreate={() => setAutoCreateOpen(true)}
        />
        <div className="lg:col-span-3 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
            </div>
          ) : !hasSelection ? (
            <Card className="text-center py-16">
              <Icon name="touch_app" size="xl" className="text-muted-foreground opacity-30 mx-auto mb-3" />
              <p className="text-base text-muted-foreground">{t('mapping.selectPrompt')}</p>
            </Card>
          ) : (
            <>
              <Card noPadding>
                {targetType === 'TABLE' ? (
                  <>
                    <div className="px-4 py-3 border-b border-border dark:border-border-dark flex items-center gap-3">
                      <Icon name="table_chart" size="xs" className="text-muted-foreground" />
                      <span className="font-mono text-base font-bold text-primary">{tbl.selected}</span>
                      <span className="text-sm text-muted-foreground">{tbl.columns.length} {t('mapping.columns')}</span>
                      {logType && <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-primary/10 text-primary">{logType}</span>}
                      {mappedCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success/10 text-success">
                          {mappedCount} {t('mapping.mapped')}
                        </span>
                      )}
                    </div>
                    <MappingTable
                      columns={tbl.columns} registry={tbl.registry}
                      logType={logType} parseRules={parseRules} onUpdate={tbl.updateRegistry}
                    />
                  </>
                ) : (
                  <ProcedureMapping
                    procedureName={proc.procName} params={proc.procParams}
                    logType={logType} parseRules={parseRules} onParamsChange={proc.setProcParams}
                    callMode={proc.callMode} onCallModeChange={proc.setCallMode}
                    arrayTypeName={proc.arrayTypeName} onArrayTypeNameChange={proc.setArrayTypeName}
                  />
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <AutoCreateModal
        isOpen={autoCreateOpen} onClose={() => setAutoCreateOpen(false)}
        targetType={targetType} parseRules={parseRules} onCreated={handleAutoCreated}
        initialLogType={logType ?? undefined} forceRecreate={forceRecreate}
      />
    </>
  );
}
