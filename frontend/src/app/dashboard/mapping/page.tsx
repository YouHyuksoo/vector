/**
 * @file src/app/dashboard/mapping/page.tsx
 * @description Oracle 테이블 ↔ VRL 소스 필드 매핑 관리 페이지
 *
 * 초보자 가이드:
 * 1. **테이블 선택**: 좌측 패널에서 Oracle 테이블 선택
 * 2. **로그 유형 선택**: SP / AOI / REFLOW 등 설비 유형 선택
 * 3. **자동 매핑**: 컬럼명과 소스 필드를 자동으로 매칭
 * 4. **저장**: TABLE_COLUMN_REGISTRY에 매핑 정보 저장
 * 5. **파싱 룰**: DB에서 설비별 data.* 필드를 런타임 로드
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import type { ColumnMeta, RegistryRow, LogType, ParseField } from './types';
import { LOG_TYPES, LOG_TYPE_FIELDS, autoMatchField, isParsed, getMergedFields } from './types';
import MappingTable from './components/MappingTable';
import ParseRuleEditor from './components/ParseRuleEditor';

export default function MappingPage() {
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [registry, setRegistry] = useState<RegistryRow[]>([]);
  const [logType, setLogType] = useState<LogType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [parseRules, setParseRules] = useState<Record<string, ParseField[]>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const { t } = useI18n();

  const filteredTables = tableFilter
    ? tables.filter(tbl => tbl.toUpperCase().includes(tableFilter.toUpperCase()))
    : tables;

  const loadParseRules = useCallback(async () => {
    try {
      const res = await apiFetch<{ rules: Record<string, ParseField[]> }>('/api/monitor/parse-rules');
      const rules = res.rules;
      // parse-fields.json이 비어있으면 VRL에서 자동 동기화
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

  useEffect(() => {
    apiFetch<{ tables: Array<{ TABLE_NAME: string }> }>('/api/monitor/tables/oracle/all')
      .then(d => setTables(d.tables.map((tbl: any) => tbl.TABLE_NAME || tbl[0])))
      .catch(() => {});
    loadParseRules();
  }, [loadParseRules]);

  /** 설비 유형별 병합된 필드 목록 (공통 + DB 파싱 룰) */
  const getFieldsForType = (lt: LogType) => getMergedFields(lt, parseRules);

  /** 설비 유형별 파싱 완료 여부 (DB 파싱 필드가 있으면 true) */
  const isTypeParsed = (lt: LogType) => {
    const merged = getMergedFields(lt, parseRules);
    return merged.some(f => f.value.startsWith('data.'));
  };

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
    const allFields = getFieldsForType(logType);
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

  const saveMapping = async () => {
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

  const mappedCount = registry.filter(r => r.SOURCE_FIELD).length;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="table_chart" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">{t('mapping.title')}</span>
          <span className="text-muted-foreground text-sm font-normal ml-1">/ {t('mapping.subtitle')}</span>
        </h1>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-sm font-medium ${saveMsg.startsWith(t('mapping.error')) ? 'text-error' : 'text-success'}`}>{saveMsg}</span>
          )}
          <Button variant="outline" size="sm" leftIcon="edit_note" onClick={() => setEditorOpen(true)}>
            {t('parseRule.edit')}
          </Button>
          {selected && logType && (
            <Button variant="outline" size="sm" leftIcon="auto_fix_high" onClick={handleAutoMap}>
              {t('mapping.autoMap')}
            </Button>
          )}
          {selected && (
            <Button variant="primary" size="sm" leftIcon="save" onClick={saveMapping} disabled={saving}>
              {saving ? t('mapping.saving') : t('mapping.save')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card noPadding className="p-4 lg:col-span-1">
          <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">{t('mapping.oracleTables')}</p>
          <div className="relative mb-2">
            <Icon name="search" size="xs" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              placeholder={t('mapping.filterPlaceholder')}
              className="w-full pl-8 pr-8 py-1.5 rounded-lg text-sm font-mono
                bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                text-text dark:text-white placeholder:text-muted-foreground/50
                focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {tableFilter && (
              <button onClick={() => setTableFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-text dark:hover:text-white">
                <Icon name="close" size="xs" />
              </button>
            )}
          </div>
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
        </Card>

        <div className="lg:col-span-3 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
            </div>
          ) : !selected ? (
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
                  {LOG_TYPES.map(lt => {
                    const cfg = LOG_TYPE_FIELDS[lt];
                    const active = logType === lt;
                    const parsed = isTypeParsed(lt);
                    return (
                      <button key={lt} onClick={() => parsed && setLogType(active ? null : lt)} disabled={!parsed}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all
                          ${active
                            ? 'bg-primary text-white shadow-md'
                            : parsed
                              ? 'bg-surface dark:bg-surface-dark text-text dark:text-white hover:text-primary border border-primary/30 dark:border-primary/30 cursor-pointer'
                              : 'bg-surface dark:bg-surface-dark text-muted-foreground/30 border border-border dark:border-border-dark border-dashed cursor-not-allowed'}`}>
                        <Icon name={parsed ? 'check_circle' : cfg.icon} size="xs" className={parsed && !active ? 'text-success' : ''} />
                        {t(`mapping.logType_${lt}`)}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* 매핑 테이블 */}
              <Card noPadding>
                <div className="px-4 py-3 border-b border-border dark:border-border-dark flex items-center gap-3">
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
