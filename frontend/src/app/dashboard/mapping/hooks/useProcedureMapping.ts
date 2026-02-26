/**
 * @file hooks/useProcedureMapping.ts
 * @description PROCEDURE 모드 상태 관리 훅 — 프로시져 선택, 파라미터 로드, 매핑 관리
 *
 * 초보자 가이드:
 * 1. **oracleProcs**: Oracle 프로시져 목록 (초기 로드)
 * 2. **loadProcedure**: 프로시져 선택 시 파라미터 + 저장된 매핑 로드
 * 3. **saveProcedureMapping**: 매핑 결과를 서버에 저장
 * 4. **deleteProcedure**: 저장된 프로시져 매핑 삭제
 * 5. **callMode**: NAMED(이름 기반) / ARRAY(배열 순서) 호출 모드
 */
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { OracleProc, ProcedureParam, ProcedureConfig, ProcedureCallMode, LogType } from '../types';

interface Options {
  logType: LogType | null;
  setLoading: (v: boolean) => void;
  setSaving: (v: boolean) => void;
  setSaveMsg: (v: string) => void;
  setLogType: (v: null) => void;
  t: (key: string) => string;
}

export function useProcedureMapping({ logType, setLoading, setSaving, setSaveMsg, setLogType, t }: Options) {
  const [oracleProcs, setOracleProcs] = useState<OracleProc[]>([]);
  const [selectedProc, setSelectedProc] = useState('');
  const [procName, setProcName] = useState('');
  const [procParams, setProcParams] = useState<ProcedureParam[]>([]);
  const [procFilter, setProcFilter] = useState('');
  const [callMode, setCallMode] = useState<ProcedureCallMode>('NAMED');
  const [arrayTypeName, setArrayTypeName] = useState('');

  const filteredProcs = procFilter
    ? oracleProcs.filter(p => p.DISPLAY_NAME.toUpperCase().includes(procFilter.toUpperCase()))
    : oracleProcs;

  useEffect(() => {
    apiFetch<{ procedures: OracleProc[] }>('/api/monitor/procedures/oracle/all')
      .then(d => setOracleProcs((d.procedures || []).map((p: any) => ({
        DISPLAY_NAME: p.DISPLAY_NAME || p[0], OBJECT_NAME: p.OBJECT_NAME || p[1],
        PACKAGE_NAME: p.PACKAGE_NAME || p[2] || null, OBJECT_TYPE: p.OBJECT_TYPE || p[3], ARG_COUNT: 0,
      }))))
      .catch(() => {});
  }, []);

  const loadProcedure = async (proc: OracleProc) => {
    const displayName = proc.DISPLAY_NAME;
    setSelectedProc(displayName);
    setProcName(displayName);
    setLoading(true);
    setSaveMsg('');
    setLogType(null);
    try {
      const saved = await apiFetch<ProcedureConfig>(`/api/monitor/procedures/${encodeURIComponent(displayName)}`).catch(() => null);
      setCallMode(saved?.callMode || 'NAMED');
      setArrayTypeName(saved?.arrayTypeName || '');
      const pkgParam = proc.PACKAGE_NAME ? `?package=${encodeURIComponent(proc.PACKAGE_NAME)}` : '';
      const argRes = await apiFetch<{ arguments: Array<{ ARGUMENT_NAME: string; POSITION: number; DATA_TYPE: string; IN_OUT: string }> }>(
        `/api/monitor/procedures/oracle/${encodeURIComponent(proc.OBJECT_NAME)}/arguments${pkgParam}`,
      );
      const oracleArgs = (argRes.arguments || []).map((a: any) => ({
        ARGUMENT_NAME: a.ARGUMENT_NAME || a[0], POSITION: a.POSITION ?? a[1],
        DATA_TYPE: a.DATA_TYPE || a[2], IN_OUT: a.IN_OUT || a[3],
      }));
      setProcParams(oracleArgs.map(arg => {
        const sp = saved?.params.find(p => p.ARGUMENT_NAME === arg.ARGUMENT_NAME);
        return {
          PARAM_ORDER: arg.POSITION, ARGUMENT_NAME: arg.ARGUMENT_NAME,
          DATA_TYPE: arg.DATA_TYPE, IN_OUT: arg.IN_OUT,
          SOURCE_FIELD: sp?.SOURCE_FIELD || '', IS_REQUIRED: sp?.IS_REQUIRED || 'N',
        };
      }));
    } catch { setProcParams([]); }
    setLoading(false);
  };

  const saveProcedureMapping = async () => {
    if (!selectedProc) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await apiFetch<{ success: boolean; tomlSync?: { success: boolean } }>('/api/monitor/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selectedProc, procedureName: procName, callMode,
          arrayTypeName: callMode === 'ARRAY' ? arrayTypeName : undefined,
          equipmentType: logType || undefined,
          params: procParams,
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

  const refreshProcs = async () => {
    try {
      const d = await apiFetch<{ procedures: OracleProc[] }>('/api/monitor/procedures/oracle/all');
      setOracleProcs((d.procedures || []).map((p: any) => ({
        DISPLAY_NAME: p.DISPLAY_NAME || p[0], OBJECT_NAME: p.OBJECT_NAME || p[1],
        PACKAGE_NAME: p.PACKAGE_NAME || p[2] || null, OBJECT_TYPE: p.OBJECT_TYPE || p[3], ARG_COUNT: 0,
      })));
    } catch { /* ignore */ }
  };

  const reset = () => {
    setSelectedProc(''); setProcName(''); setProcParams([]);
    setCallMode('NAMED'); setArrayTypeName('');
  };

  return {
    oracleProcs, selectedProc, procName, procParams, procFilter, callMode, arrayTypeName, filteredProcs,
    setProcFilter, setProcParams, setCallMode, setArrayTypeName,
    loadProcedure, saveProcedureMapping, deleteProcedure, reset, refreshProcs,
  };
}
