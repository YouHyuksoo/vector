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

import { useState, useEffect, useCallback } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import type { ColumnMeta, RegistryRow, LogType, ParseField, TargetType, ProcedureParam, ProcedureConfig, ProcedureCallMode, OracleProc } from './types';
import { getMergedFields, autoMatchField, getLogTypesFromRules, isTypeParsed, getLogTypeConfig, getEquipmentIcon } from './mapping-utils';
import MappingTable from './components/MappingTable';
import ProcedureMapping from './components/ProcedureMapping';
import ParseRuleEditor from './components/ParseRuleEditor';

export default function MappingPage() {
  /* ───── 공통 상태 ───── */
  const [targetType, setTargetType] = useState<TargetType>('TABLE');
  const [logType, setLogType] = useState<LogType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [parseRules, setParseRules] = useState<Record<string, ParseField[]>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const { t } = useI18n();

  /* ───── TABLE 모드 상태 ───── */
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [registry, setRegistry] = useState<RegistryRow[]>([]);
  const [tableFilter, setTableFilter] = useState('');

  /* ───── PROCEDURE 모드 상태 ───── */
  const [oracleProcs, setOracleProcs] = useState<OracleProc[]>([]);
  const [selectedProc, setSelectedProc] = useState('');
  const [procName, setProcName] = useState('');
  const [procParams, setProcParams] = useState<ProcedureParam[]>([]);
  const [procFilter, setProcFilter] = useState('');
  const [callMode, setCallMode] = useState<ProcedureCallMode>('NAMED');
  const [arrayTypeName, setArrayTypeName] = useState('');

  const filteredTables = tableFilter
    ? tables.filter(tbl => tbl.toUpperCase().includes(tableFilter.toUpperCase()))
    : tables;

  const filteredProcs = procFilter
    ? oracleProcs.filter(p => p.DISPLAY_NAME.toUpperCase().includes(procFilter.toUpperCase()))
    : oracleProcs;

  /* ───── 파싱 룰 로드 ───── */
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

  /* ───── 초기 데이터 로드 ───── */
  useEffect(() => {
    apiFetch<{ tables: Array<{ TABLE_NAME: string }> }>('/api/monitor/tables/oracle/all')
      .then(d => setTables(d.tables.map((tbl: any) => tbl.TABLE_NAME || tbl[0])))
      .catch(() => {});
    apiFetch<{ procedures: OracleProc[] }>('/api/monitor/procedures/oracle/all')
      .then(d => setOracleProcs((d.procedures || []).map((p: any) => ({
        DISPLAY_NAME: p.DISPLAY_NAME || p[0],
        OBJECT_NAME: p.OBJECT_NAME || p[1],
        PACKAGE_NAME: p.PACKAGE_NAME || p[2] || null,
        OBJECT_TYPE: p.OBJECT_TYPE || p[3],
        ARG_COUNT: 0,
      }))))
      .catch(() => {});
    loadParseRules();
  }, [loadParseRules]);

  /** parseRules 키에서 설비 유형 목록 도출 (하드코딩 아님) */
  const logTypes = getLogTypesFromRules(parseRules);

  /* ───── TABLE 모드 핸들러 ───── */
  const loadTable = async (table: string) => {
    if (!table) return;
    setSelected(table);
    setLoading(true);
    setSaveMsg('');
    setLogType(null);
    try {
      const [colRes, regRes] = await Promise.all([
        apiFetch<{ columns: ColumnMeta[] }>(`/api/monitor/tables/oracle/${table}/columns`),
        apiFetch<{ rows: RegistryRow[] }>(`/api/monitor/registry?table=${table}`),
      ]);
      setColumns(colRes.columns.map((c: any) => ({
        COLUMN_NAME: c.COLUMN_NAME || c[0],
        DATA_TYPE: c.DATA_TYPE || c[1],
        NULLABLE: c.NULLABLE || c[2],
        DATA_LENGTH: c.DATA_LENGTH || c[3],
        COLUMN_ID: c.COLUMN_ID || c[4],
      })));
      setRegistry(regRes.rows.map((r: any) => ({
        TABLE_NAME: r.TABLE_NAME || r[0],
        COLUMN_NAME: r.COLUMN_NAME || r[1],
        DATA_TYPE: r.DATA_TYPE || r[2],
        SOURCE_FIELD: r.SOURCE_FIELD || r[3] || '',
        IS_REQUIRED: r.IS_REQUIRED || r[4] || 'N',
        COLUMN_ORDER: r.COLUMN_ORDER || r[5] || 0,
      })));
    } catch {
      setColumns([]);
      setRegistry([]);
    }
    setLoading(false);
  };

  const updateRegistry = (colName: string, field: string, value: string) => {
    setRegistry(prev => {
      const exists = prev.find(r => r.COLUMN_NAME === colName);
      if (exists) return prev.map(r => r.COLUMN_NAME === colName ? { ...r, [field]: value } : r);
      return [...prev, {
        TABLE_NAME: selected, COLUMN_NAME: colName,
        DATA_TYPE: columns.find(c => c.COLUMN_NAME === colName)?.DATA_TYPE || '',
        SOURCE_FIELD: field === 'SOURCE_FIELD' ? value : '',
        IS_REQUIRED: field === 'IS_REQUIRED' ? value : 'N',
        COLUMN_ORDER: columns.findIndex(c => c.COLUMN_NAME === colName) + 1,
      }];
    });
  };

  const handleAutoMap = () => {
    if (!logType) return;
    const allFields = getMergedFields(logType, parseRules);
    let count = 0;
    columns.forEach(col => { if (autoMatchField(col.COLUMN_NAME, logType, allFields)) count++; });
    setRegistry(prev => {
      const updated = [...prev];
      columns.forEach(col => {
        const matched = autoMatchField(col.COLUMN_NAME, logType, allFields);
        if (!matched) return;
        const idx = updated.findIndex(r => r.COLUMN_NAME === col.COLUMN_NAME);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], SOURCE_FIELD: matched };
        } else {
          updated.push({
            TABLE_NAME: selected, COLUMN_NAME: col.COLUMN_NAME, DATA_TYPE: col.DATA_TYPE,
            SOURCE_FIELD: matched, IS_REQUIRED: 'N', COLUMN_ORDER: col.COLUMN_ID,
          });
        }
      });
      return updated;
    });
    setSaveMsg(t('mapping.autoMapDone').replace('{count}', String(count)));
  };

  const saveTableMapping = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await apiFetch('/api/monitor/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selected,
          columns: registry.filter(r => r.SOURCE_FIELD).map((r, i) => ({ ...r, COLUMN_ORDER: i + 1 })),
        }),
      });
      setSaveMsg(t('mapping.savedMsg'));
    } catch (err) {
      setSaveMsg(`${t('mapping.error')}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setSaving(false);
  };

  /* ───── PROCEDURE 모드 핸들러 ───── */
  const loadProcedure = async (proc: OracleProc) => {
    const displayName = proc.DISPLAY_NAME;
    setSelectedProc(displayName);
    setProcName(displayName);
    setLoading(true);
    setSaveMsg('');
    setLogType(null);
    try {
      // 1) 저장된 매핑이 있으면 로드 (callMode/arrayTypeName 포함)
      const saved = await apiFetch<ProcedureConfig>(`/api/monitor/procedures/${encodeURIComponent(displayName)}`).catch(() => null);
      setCallMode(saved?.callMode || 'NAMED');
      setArrayTypeName(saved?.arrayTypeName || '');

      // 2) Oracle에서 파라미터(인수) 목록 로드
      const pkgParam = proc.PACKAGE_NAME ? `?package=${encodeURIComponent(proc.PACKAGE_NAME)}` : '';
      const argRes = await apiFetch<{ arguments: Array<{ ARGUMENT_NAME: string; POSITION: number; DATA_TYPE: string; IN_OUT: string }> }>(
        `/api/monitor/procedures/oracle/${encodeURIComponent(proc.OBJECT_NAME)}/arguments${pkgParam}`,
      );
      const oracleArgs = (argRes.arguments || []).map((a: any) => ({
        ARGUMENT_NAME: a.ARGUMENT_NAME || a[0],
        POSITION: a.POSITION ?? a[1],
        DATA_TYPE: a.DATA_TYPE || a[2],
        IN_OUT: a.IN_OUT || a[3],
      }));

      // 3) Oracle 파라미터 기반으로 params 생성, 저장된 매핑 병합
      const params: ProcedureParam[] = oracleArgs.map(arg => {
        const savedParam = saved?.params.find(p => p.ARGUMENT_NAME === arg.ARGUMENT_NAME);
        return {
          PARAM_ORDER: arg.POSITION,
          ARGUMENT_NAME: arg.ARGUMENT_NAME,
          DATA_TYPE: arg.DATA_TYPE,
          IN_OUT: arg.IN_OUT,
          SOURCE_FIELD: savedParam?.SOURCE_FIELD || '',
          IS_REQUIRED: savedParam?.IS_REQUIRED || 'N',
        };
      });
      setProcParams(params);
    } catch {
      setProcParams([]);
    }
    setLoading(false);
  };

  const saveProcedureMapping = async () => {
    if (!selectedProc) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await apiFetch('/api/monitor/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selectedProc,
          procedureName: procName,
          callMode,
          arrayTypeName: callMode === 'ARRAY' ? arrayTypeName : undefined,
          params: procParams,
        }),
      });
      setSaveMsg(t('mapping.savedMsg'));
    } catch (err) {
      setSaveMsg(`${t('mapping.error')}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setSaving(false);
  };

  const deleteProcedure = async () => {
    if (!selectedProc || !confirm(t('mapping.deleteProcedureConfirm'))) return;
    try {
      await apiFetch(`/api/monitor/procedures/${encodeURIComponent(selectedProc)}`, { method: 'DELETE' });
      setProcParams(prev => prev.map(p => ({ ...p, SOURCE_FIELD: '', IS_REQUIRED: 'N' })));
      setSaveMsg('');
    } catch (err) {
      setSaveMsg(`${t('mapping.error')}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const handleSave = targetType === 'TABLE' ? saveTableMapping : saveProcedureMapping;

  /* ───── 타겟 유형 전환 시 선택 초기화 ───── */
  const switchTargetType = (type: TargetType) => {
    setTargetType(type);
    setSelected('');
    setSelectedProc('');
    setColumns([]);
    setRegistry([]);
    setProcName('');
    setProcParams([]);
    setCallMode('NAMED');
    setArrayTypeName('');
    setSaveMsg('');
    setLogType(null);
  };

  const hasSelection = targetType === 'TABLE' ? !!selected : !!selectedProc;
  const mappedCount = targetType === 'TABLE'
    ? registry.filter(r => r.SOURCE_FIELD).length
    : procParams.filter(p => p.SOURCE_FIELD).length;

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
          <Button variant="outline" size="sm" leftIcon="edit_note" onClick={() => setEditorOpen(true)}>
            {t('parseRule.edit')}
          </Button>
          {hasSelection && targetType === 'TABLE' && logType && (
            <Button variant="outline" size="sm" leftIcon="auto_fix_high" onClick={handleAutoMap}>
              {t('mapping.autoMap')}
            </Button>
          )}
          {hasSelection && (
            <Button variant="primary" size="sm" leftIcon="save" onClick={handleSave} disabled={saving}>
              {saving ? t('mapping.saving') : t('mapping.save')}
            </Button>
          )}
        </div>
      </div>

      {/* 타겟 유형 토글 */}
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

      {/* 메인 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ───── 좌측 패널 ───── */}
        <Card noPadding className="p-4 lg:col-span-1">
          <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">
            {targetType === 'TABLE' ? t('mapping.oracleTables') : t('mapping.oracleProcedures')}
          </p>

          {/* 검색 입력 */}
          <div className="relative mb-2">
            <Icon name="search" size="xs" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={targetType === 'TABLE' ? tableFilter : procFilter}
              onChange={e => targetType === 'TABLE' ? setTableFilter(e.target.value) : setProcFilter(e.target.value)}
              placeholder={t('mapping.filterPlaceholder')}
              className="w-full pl-8 pr-8 py-1.5 rounded-lg text-sm font-mono
                bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                text-text dark:text-white placeholder:text-muted-foreground/50
                focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {(targetType === 'TABLE' ? tableFilter : procFilter) && (
              <button onClick={() => targetType === 'TABLE' ? setTableFilter('') : setProcFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-text dark:hover:text-white">
                <Icon name="close" size="xs" />
              </button>
            )}
          </div>

          {/* TABLE 모드 목록 */}
          {targetType === 'TABLE' && (
            <>
              {tables.length > 0 && (
                <p className="text-xs text-muted-foreground mb-1 px-1">{filteredTables.length} / {tables.length}</p>
              )}
              <div className="space-y-1 max-h-[55vh] overflow-y-auto">
                {!tables.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noTables')}</p>
                ) : !filteredTables.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noFilterResult')}</p>
                ) : filteredTables.map(tbl => (
                  <button key={tbl} onClick={() => loadTable(tbl)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors
                      ${selected === tbl
                        ? 'bg-primary/10 text-primary border border-primary/20 font-bold'
                        : 'text-muted-foreground hover:bg-surface dark:hover:bg-surface-dark'}`}>
                    {tbl}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* PROCEDURE 모드 목록 */}
          {targetType === 'PROCEDURE' && (
            <>
              {oracleProcs.length > 0 && (
                <p className="text-xs text-muted-foreground mb-1 px-1">{filteredProcs.length} / {oracleProcs.length}</p>
              )}
              <div className="space-y-1 max-h-[55vh] overflow-y-auto">
                {!oracleProcs.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noProcedures')}</p>
                ) : !filteredProcs.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noFilterResult')}</p>
                ) : filteredProcs.map(proc => (
                  <button key={proc.DISPLAY_NAME} onClick={() => loadProcedure(proc)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors
                      ${selectedProc === proc.DISPLAY_NAME
                        ? 'bg-primary/10 text-primary border border-primary/20 font-bold'
                        : 'text-muted-foreground hover:bg-surface dark:hover:bg-surface-dark'}`}>
                    <div className="flex items-center gap-1.5">
                      <Icon name={proc.OBJECT_TYPE === 'PACKAGE' ? 'inventory_2' : 'terminal'} size="xs" className="shrink-0 opacity-50" />
                      <span className="truncate">{proc.DISPLAY_NAME}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* ───── 우측 패널 ───── */}
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
              {/* 로그 유형 선택 */}
              <Card noPadding className="px-4 py-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{t('mapping.logType')}</span>
                  <span className="flex items-center gap-1 text-xs text-success"><Icon name="check_circle" size="xs" />{t('mapping.parsed')}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground/60 border-b border-dashed border-muted-foreground/40">{t('mapping.notParsed')}</span>
                  {logTypes.map(lt => {
                    const icon = getEquipmentIcon(lt);
                    const active = logType === lt;
                    const parsed = isTypeParsed(lt, parseRules);
                    return (
                      <button key={lt} onClick={() => parsed && setLogType(active ? null : lt)} disabled={!parsed}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all
                          ${active
                            ? 'bg-primary text-white shadow-md'
                            : parsed
                              ? 'bg-surface dark:bg-surface-dark text-text dark:text-white hover:text-primary border border-primary/30 dark:border-primary/30 cursor-pointer'
                              : 'bg-surface dark:bg-surface-dark text-muted-foreground/30 border border-border dark:border-border-dark border-dashed cursor-not-allowed'}`}>
                        <Icon name={parsed ? 'check_circle' : icon} size="xs" className={parsed && !active ? 'text-success' : ''} />
                        {lt}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* 매핑 컨텐츠 */}
              <Card noPadding>
                {targetType === 'TABLE' ? (
                  <>
                    <div className="px-4 py-3 border-b border-border dark:border-border-dark flex items-center gap-3">
                      <Icon name="table_chart" size="xs" className="text-muted-foreground" />
                      <span className="font-mono text-base font-bold text-primary">{selected}</span>
                      <span className="text-sm text-muted-foreground">{columns.length} {t('mapping.columns')}</span>
                      {logType && <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-primary/10 text-primary">{logType}</span>}
                      {mappedCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-success/10 text-success">
                          {mappedCount} {t('mapping.mapped')}
                        </span>
                      )}
                    </div>
                    <MappingTable
                      columns={columns}
                      registry={registry}
                      logType={logType}
                      parseRules={parseRules}
                      onUpdate={updateRegistry}
                    />
                  </>
                ) : (
                  <ProcedureMapping
                    procedureName={procName}
                    params={procParams}
                    logType={logType}
                    parseRules={parseRules}
                    onParamsChange={setProcParams}
                    callMode={callMode}
                    onCallModeChange={setCallMode}
                    arrayTypeName={arrayTypeName}
                    onArrayTypeNameChange={setArrayTypeName}
                  />
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <ParseRuleEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        parseRules={parseRules}
        onSaved={loadParseRules}
        selectedType={logType}
      />
    </>
  );
}
