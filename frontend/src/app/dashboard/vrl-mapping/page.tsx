/**
 * @file src/app/dashboard/vrl-mapping/page.tsx
 * @description VRL & 매핑 통합 페이지 — 좌측 설비 사이드패널 + 우측 VRL/매핑 탭 전환
 *
 * 초보자 가이드:
 * 1. **설비 선택**: 좌측 패널에서 설비(equipmentType) 선택
 * 2. **VRL 탭**: AI 생성 → VRL 코드 편집 → 시뮬레이션 → 적용
 * 3. **매핑 탭**: TABLE/PROCEDURE 선택 → 컬럼 매핑 → 저장
 * 4. VRL 적용 시 재시작 모달 → 확인하면 Vector 재시작 + 매핑 탭 이동
 * 5. 설비 변경 시 기존 VRL 코드 자동 로드, 매핑은 targetMap 기반 자동 선택
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Icon, Card, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { usePipelineStatus } from '@/hooks/usePipelineStatus';
import type { LogType, ParseField, TargetType } from '../mapping/types';
import { getLogTypesFromRules } from '../mapping/mapping-utils';
import { useTableMapping } from '../mapping/hooks/useTableMapping';
import { useProcedureMapping } from '../mapping/hooks/useProcedureMapping';
import SelectionPanel from '../mapping/components/SelectionPanel';
import MappingTable from '../mapping/components/MappingTable';
import ProcedureMapping from '../mapping/components/ProcedureMapping';
import AutoCreateModal from '../mapping/components/AutoCreateModal';
import EquipmentSidePanel from './components/EquipmentSidePanel';
import AiVrlGenerator from './components/AiVrlGenerator';
import VrlEditor from './components/VrlEditor';
import VrlResultPanel from './components/VrlResultPanel';
import type { SimResult } from './components/VrlEditor';

type ActiveTab = 'vrl' | 'mapping';

interface TargetMapEntry { targetTable: string; targetType: string; }

export default function VrlMappingPage() {
  const { t } = useI18n();

  // 공통 상태
  const [selectedEquip, setSelectedEquip] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('vrl');
  const [pipelineKey, setPipelineKey] = useState(0);

  // VRL 탭 상태
  const [sampleLog, setSampleLog] = useState('');
  const [vrlCode, setVrlCode] = useState('');
  const [codeFromServer, setCodeFromServer] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [restartModalOpen, setRestartModalOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // AI VRL 생성기 옵션 상태
  const [logStructure, setLogStructure] = useState<'SINGLE' | 'MULTI_ROW' | 'KEY_VALUE' | 'MULTI_SECTION'>('SINGLE');
  const [multiRowMode, setMultiRowMode] = useState<'BATCH' | 'ACCUMULATE'>('BATCH');
  const [hasHeader, setHasHeader] = useState(false);
  const [headerLines, setHeaderLines] = useState('1');
  const [startRow, setStartRow] = useState('');
  const [kvDelimiter, setKvDelimiter] = useState(':');
  const [sectionMarkers, setSectionMarkers] = useState('');

  // 매핑 탭 상태
  const [targetType, setTargetType] = useState<TargetType>('TABLE');
  const [logType, setLogType] = useState<LogType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [parseRules, setParseRules] = useState<Record<string, ParseField[]>>({});
  const [autoCreateOpen, setAutoCreateOpen] = useState(false);
  const [forceRecreate, setForceRecreate] = useState(false);
  const [targetMap, setTargetMap] = useState<Record<string, TargetMapEntry>>({});
  const autoSelecting = useRef(false);
  const userSwitched = useRef(false);

  const { agents } = usePipelineStatus(pipelineKey);

  /** 자동 선택 중 loadTable/loadProcedure 내부 setLogType(null) 차단 */
  const guardedSetLogType = useCallback((v: LogType | null) => {
    if (autoSelecting.current && v === null) return;
    setLogType(v);
  }, []);

  const sharedOpts = { setLoading, setSaving, setSaveMsg, setLogType: guardedSetLogType, t };
  const tbl = useTableMapping({ logType, parseRules, ...sharedOpts });
  const proc = useProcedureMapping({ logType, ...sharedOpts });

  /** 파싱 룰 로드 */
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

  /** target-map 로드 (pipelineKey 변경 시 갱신) */
  useEffect(() => {
    apiFetch<{ map: Record<string, TargetMapEntry> }>('/api/monitor/vrl/target-map')
      .then(d => setTargetMap(d.map || {}))
      .catch(() => {});
  }, [pipelineKey]);

  /** 설비 선택 시 VRL 코드 로드 + 상태 리셋 */
  const handleEquipSelect = useCallback(async (equipType: string) => {
    setSelectedEquip(equipType);
    setLogType(equipType as LogType);
    setSimResult(null);
    setVrlCode('');
    setCodeFromServer(false);
    try {
      const res = await apiFetch<{ code: string }>(`/api/monitor/vrl/code/${equipType}`);
      if (res.code) {
        setVrlCode(res.code);
        setCodeFromServer(true);
      }
    } catch { /* 코드 없을 수 있음 */ }
  }, []);

  /** VRL 적용 후 호출 — 재시작 모달 오픈 + 파싱 룰 리로드 */
  const handleVrlApplied = useCallback(() => {
    setRestartModalOpen(true);
    loadParseRules();
  }, [loadParseRules]);

  /** 재시작 확인 — Vector 재시작 → 매핑 탭 이동 + pipeline 갱신 */
  const handleRestartConfirm = useCallback(async () => {
    setRestarting(true);
    try {
      await apiFetch('/api/monitor/restart', { method: 'POST' });
    } catch { /* ignore */ }
    setRestarting(false);
    setRestartModalOpen(false);
    setPipelineKey(k => k + 1);
    setActiveTab('mapping');
  }, []);

  /** 나중에 — 재시작 없이 매핑 탭으로 이동 */
  const handleRestartLater = useCallback(() => {
    setRestartModalOpen(false);
    setActiveTab('mapping');
  }, []);

  /** 매핑 저장 핸들러 */
  const rawSave = targetType === 'TABLE' ? tbl.saveTableMapping : proc.saveProcedureMapping;
  const handleSave = useCallback(async () => {
    await rawSave();
    setPipelineKey(k => k + 1);
  }, [rawSave]);

  const hasSelection = targetType === 'TABLE' ? !!tbl.selected : !!proc.selectedProc;
  const mappedCount = targetType === 'TABLE'
    ? tbl.registry.filter(r => r.SOURCE_FIELD).length
    : proc.procParams.filter(p => p.SOURCE_FIELD).length;

  /** targetMap 기반 테이블/프로시져 자동 선택 */
  useEffect(() => {
    if (!logType || autoSelecting.current) return;
    if (userSwitched.current) { userSwitched.current = false; return; }
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
    if (type === targetType) return;
    userSwitched.current = true;
    setTargetType(type);
    tbl.reset();
    proc.reset();
    setSaveMsg('');
  };

  const logTypes = getLogTypesFromRules(parseRules);
  void logTypes; // 현재 미사용 (SelectionPanel 내부에서 사용)

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="code" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            VRL &amp; 매핑
          </span>
        </h1>
      </div>

      {/* 메인 레이아웃: 좌측 설비 패널 + 우측 탭 콘텐츠 */}
      <div className="border border-border dark:border-border-dark rounded-xl min-h-[600px] flex overflow-hidden">
        {/* 좌측 설비 사이드패널 */}
        <EquipmentSidePanel
          agents={agents}
          selected={selectedEquip}
          onSelect={handleEquipSelect}
        />

        {/* 우측 콘텐츠 영역 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* 탭 헤더 */}
          <div className="flex items-center border-b border-border dark:border-border-dark px-4 gap-1 bg-surface dark:bg-surface-dark">
            <button
              onClick={() => setActiveTab('vrl')}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors
                ${activeTab === 'vrl'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-text dark:hover:text-white'}`}
            >
              <Icon name="code" size="xs" />
              VRL
            </button>
            <button
              onClick={() => setActiveTab('mapping')}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors
                ${activeTab === 'mapping'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-text dark:hover:text-white'}`}
            >
              <Icon name="swap_horiz" size="xs" />
              매핑
            </button>

            {/* 매핑 탭 저장 버튼 (탭 헤더 우측) */}
            {activeTab === 'mapping' && hasSelection && (
              <div className="ml-auto flex items-center gap-3">
                {saveMsg && (
                  <span className={`text-sm font-medium ${saveMsg.startsWith(t('mapping.error')) ? 'text-error' : 'text-success'}`}>
                    {saveMsg}
                  </span>
                )}
                <Button variant="primary" size="sm" leftIcon="save" onClick={handleSave} disabled={saving}>
                  {saving ? t('mapping.saving') : t('mapping.save')}
                </Button>
              </div>
            )}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="flex-1 p-4 overflow-auto">
            {!selectedEquip ? (
              /* 설비 미선택 안내 */
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3">
                <Icon name="touch_app" size="xl" className="text-muted-foreground opacity-30" />
                <p className="text-base text-muted-foreground">왼쪽에서 설비를 선택하세요</p>
              </div>
            ) : activeTab === 'vrl' ? (
              /* VRL 탭 */
              <div className="space-y-3">
                <AiVrlGenerator
                  equipmentType={selectedEquip}
                  sampleLog={sampleLog}
                  onGenerated={setVrlCode}
                  logStructure={logStructure}
                  onLogStructureChange={setLogStructure}
                  multiRowMode={multiRowMode}
                  onMultiRowModeChange={setMultiRowMode}
                  hasHeader={hasHeader}
                  onHasHeaderChange={setHasHeader}
                  headerLines={headerLines}
                  onHeaderLinesChange={setHeaderLines}
                  startRow={startRow}
                  onStartRowChange={setStartRow}
                  kvDelimiter={kvDelimiter}
                  onKvDelimiterChange={setKvDelimiter}
                  sectionMarkers={sectionMarkers}
                  onSectionMarkersChange={setSectionMarkers}
                />
                <VrlEditor
                  equipmentType={selectedEquip}
                  sampleLog={sampleLog}
                  onSampleLogChange={setSampleLog}
                  vrlCode={vrlCode}
                  onVrlCodeChange={setVrlCode}
                  onResult={setSimResult}
                  onApplied={handleVrlApplied}
                  codeFromServer={codeFromServer}
                  onCodeFromServerChange={setCodeFromServer}
                  result={simResult}
                />
                {simResult && <VrlResultPanel result={simResult} />}
              </div>
            ) : (
              /* 매핑 탭 */
              <div className="space-y-4">
                {/* 타겟 유형 토글 + 강제 재생성 */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                      {t('mapping.targetType')}
                    </span>
                    <div className="flex rounded-lg border border-border dark:border-border-dark overflow-hidden">
                      <button
                        onClick={() => switchTargetType('TABLE')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all
                          ${targetType === 'TABLE'
                            ? 'bg-primary text-white'
                            : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}
                      >
                        <Icon name="table_chart" size="xs" />
                        {t('mapping.targetTable')}
                      </button>
                      <button
                        onClick={() => switchTargetType('PROCEDURE')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all border-l border-border dark:border-border-dark
                          ${targetType === 'PROCEDURE'
                            ? 'bg-primary text-white'
                            : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white'}`}
                      >
                        <Icon name="terminal" size="xs" />
                        {t('mapping.targetProcedure')}
                      </button>
                    </div>
                  </div>
                  <label className={`flex items-center gap-1.5 cursor-pointer select-none
                    ${forceRecreate ? 'text-error' : 'text-muted-foreground'}`}>
                    <input
                      type="checkbox" checked={forceRecreate}
                      onChange={e => setForceRecreate(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-border accent-error cursor-pointer"
                    />
                    <Icon name="warning" size="xs" className={forceRecreate ? 'text-error' : 'text-muted-foreground/50'} />
                    <span className="text-xs font-bold">
                      {targetType === 'TABLE' ? t('mapping.forceRecreateTable') : t('mapping.forceRecreateProc')}
                    </span>
                  </label>
                </div>

                {/* 매핑 메인 레이아웃 */}
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
                      <Card noPadding>
                        {targetType === 'TABLE' ? (
                          <>
                            <div className="px-4 py-3 border-b border-border dark:border-border-dark flex items-center gap-3">
                              <Icon name="table_chart" size="xs" className="text-muted-foreground" />
                              <span className="font-mono text-base font-bold text-primary">{tbl.selected}</span>
                              <span className="text-sm text-muted-foreground">{tbl.columns.length} {t('mapping.columns')}</span>
                              {logType && <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-primary/10 text-text dark:text-white">{logType}</span>}
                              {mappedCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success/10 text-text dark:text-white">
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
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 자동 생성 모달 */}
      <AutoCreateModal
        isOpen={autoCreateOpen} onClose={() => setAutoCreateOpen(false)}
        targetType={targetType} parseRules={parseRules} onCreated={handleAutoCreated}
        initialLogType={logType ?? undefined} forceRecreate={forceRecreate}
      />

      {/* Vector 재시작 확인 모달 */}
      <Modal
        isOpen={restartModalOpen}
        onClose={handleRestartLater}
        title="VRL 적용 완료"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            VRL 코드가 적용되었습니다. Vector를 재시작해야 변경 사항이 반영됩니다.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleRestartLater}>
              나중에
            </Button>
            <Button variant="primary" size="sm" leftIcon="restart_alt" onClick={handleRestartConfirm} disabled={restarting}>
              {restarting ? '재시작 중...' : '지금 재시작'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
