/**
 * @file hooks/useTableMapping.ts
 * @description TABLE 모드 상태 관리 훅 — 테이블 선택, 컬럼 로드, 매핑 관리
 *
 * 초보자 가이드:
 * 1. **tables**: Oracle 테이블 목록 (초기 로드)
 * 2. **loadTable**: 테이블 선택 시 컬럼 + 기존 매핑(registry) 로드
 * 3. **updateRegistry**: 개별 컬럼의 SOURCE_FIELD / IS_REQUIRED 수정
 * 4. **handleAutoMap**: 컬럼명 기반 자동 매핑
 * 5. **saveTableMapping**: 매핑 결과를 서버에 저장
 */
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { ColumnMeta, RegistryRow, LogType, ParseField } from '../types';
import { getMergedFields, autoMatchField } from '../mapping-utils';

interface Options {
  logType: LogType | null;
  parseRules: Record<string, ParseField[]>;
  setLoading: (v: boolean) => void;
  setSaving: (v: boolean) => void;
  setSaveMsg: (v: string) => void;
  setLogType: (v: LogType | null) => void;
  t: (key: string) => string;
}

export function useTableMapping({ logType, parseRules, setLoading, setSaving, setSaveMsg, setLogType, t }: Options) {
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [registry, setRegistry] = useState<RegistryRow[]>([]);
  const [tableFilter, setTableFilter] = useState('');

  const filteredTables = tableFilter
    ? tables.filter(tbl => tbl.toUpperCase().includes(tableFilter.toUpperCase()))
    : tables;

  useEffect(() => {
    apiFetch<{ tables: string[] }>('/api/monitor/registry-keys')
      .then(d => setTables(d.tables))
      .catch(() => {});
  }, []);

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
        COLUMN_NAME: c.COLUMN_NAME || c[0], DATA_TYPE: c.DATA_TYPE || c[1],
        NULLABLE: c.NULLABLE || c[2], DATA_LENGTH: c.DATA_LENGTH || c[3], COLUMN_ID: c.COLUMN_ID || c[4],
      })));
      setRegistry(regRes.rows.map((r: any) => ({
        TABLE_NAME: r.TABLE_NAME || r[0], COLUMN_NAME: r.COLUMN_NAME || r[1], DATA_TYPE: r.DATA_TYPE || r[2],
        SOURCE_FIELD: r.SOURCE_FIELD || r[3] || '', IS_REQUIRED: r.IS_REQUIRED || r[4] || 'N', COLUMN_ORDER: r.COLUMN_ORDER || r[5] || 0,
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
        if (idx >= 0) updated[idx] = { ...updated[idx], SOURCE_FIELD: matched };
        else updated.push({
          TABLE_NAME: selected, COLUMN_NAME: col.COLUMN_NAME, DATA_TYPE: col.DATA_TYPE,
          SOURCE_FIELD: matched, IS_REQUIRED: 'N', COLUMN_ORDER: col.COLUMN_ID,
        });
      });
      return updated;
    });
    setSaveMsg(t('mapping.autoMapDone').replace('{count}', String(count)));
  };

  const saveTableMapping = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await apiFetch<{ success: boolean; tomlSync?: { success: boolean } }>('/api/monitor/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selected,
          equipmentType: logType || undefined,
          columns: registry.filter(r => r.SOURCE_FIELD).map((r, i) => ({ ...r, COLUMN_ORDER: i + 1 })),
        }),
      });
      const msg = res.tomlSync?.success
        ? `${t('mapping.savedMsg')} ${t('mapping.tomlSynced')}`
        : t('mapping.savedMsg');
      setSaveMsg(msg);
    } catch (err) {
      setSaveMsg(`${t('mapping.error')}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setSaving(false);
  };

  const refreshTables = async () => {
    try {
      const d = await apiFetch<{ tables: string[] }>('/api/monitor/registry-keys');
      setTables(d.tables);
    } catch { /* ignore */ }
  };

  const reset = () => { setSelected(''); setColumns([]); setRegistry([]); };

  return {
    tables, selected, columns, registry, tableFilter, filteredTables,
    setTableFilter, loadTable, updateRegistry, handleAutoMap, saveTableMapping, reset, refreshTables,
  };
}
