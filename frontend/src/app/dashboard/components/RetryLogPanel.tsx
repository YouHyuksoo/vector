/**
 * @file components/RetryLogPanel.tsx
 * @description 재전송 패널 — ERROR 상태 로그를 선택하여 재전송
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 실패한 로그(ERROR)에 원본 데이터(RAW_DATA)가 있으면 재전송 가능
 * 2. **선택 재전송**: 체크박스로 선택한 항목만 POST /api/monitor/retry
 * 3. **전체 재전송**: ERROR + RAW_DATA 있는 전체 로그 POST /api/monitor/retry/all
 * 4. **자동 폴링**: 5초마다 자동 갱신 (필터 조건 유지)
 */
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon, Button, Modal, Card, Pagination } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import type { ProcessLogResponse, RetryResponse } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

const POLL_INTERVAL = 5000;
const PAGE_SIZE = 25;

export function RetryLogPanel() {
  const { t } = useI18n();

  const [sourceTable, setSourceTable] = useState('ALL');
  const [equipmentId, setEquipmentId] = useState('ALL');
  const today = new Date().toISOString().substring(0, 10);
  const [startDate, setStartDate] = useState(`${today}T00:00`);
  const [endDate, setEndDate] = useState(`${today}T23:59`);
  const [limit, setLimit] = useState(100);

  const [data, setData] = useState<ProcessLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showConfirmAll, setShowConfirmAll] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('status', 'ERROR');
      if (sourceTable !== 'ALL') params.set('sourceTable', sourceTable);
      if (equipmentId !== 'ALL') params.set('equipmentId', equipmentId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('limit', String(limit));

      const res = await apiFetch<ProcessLogResponse>(`/api/monitor/errors?${params.toString()}`);
      setData(res);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Fetch failed');
    }
  }, [sourceTable, equipmentId, startDate, endDate, limit]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    await fetchLogs();
    setLoading(false);
  }, [fetchLogs]);

  useEffect(() => { handleSearch(); }, [handleSearch]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchLogs, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchLogs]);

  const toggleSelect = (logId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId); else next.add(logId);
      return next;
    });
  };

  const allRows = data?.logs ?? [];
  const allSelected = allRows.length > 0 && allRows.every(r => selected.has(r.LOG_ID));
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const pageData = useMemo(
    () => allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [allRows, page],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allRows.map(r => r.LOG_ID)));
  };

  const handleRetrySelected = async () => {
    if (selected.size === 0) { setResult({ ok: false, msg: t('retry.noSelection') }); return; }
    setRetrying(true);
    setResult(null);
    try {
      const res = await apiFetch<RetryResponse>('/api/monitor/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logIds: [...selected] }),
      });
      const msgs: string[] = [];
      if (res.retried > 0) msgs.push(t('retry.retried').replace('{count}', String(res.retried)));
      if (res.failed > 0) msgs.push(t('retry.failed').replace('{count}', String(res.failed)));
      setResult({ ok: res.retried > 0, msg: msgs.join(', ') });
      setSelected(new Set());
      fetchLogs();
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Retry failed' });
    }
    setRetrying(false);
  };

  const handleDeleteSelected = async () => {
    setShowConfirmDelete(false);
    if (selected.size === 0) return;
    setDeleting(true);
    setResult(null);
    try {
      const res = await apiFetch<{ success: boolean; deleted: number }>('/api/monitor/errors/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logIds: [...selected] }),
      });
      setResult({ ok: true, msg: `${res.deleted}건 삭제 완료` });
      setSelected(new Set());
      fetchLogs();
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Delete failed' });
    }
    setDeleting(false);
  };

  const handleRetryAll = async () => {
    setShowConfirmAll(false);
    setRetrying(true);
    setResult(null);
    try {
      const res = await apiFetch<RetryResponse>('/api/monitor/retry/all', { method: 'POST' });
      const msgs: string[] = [];
      if (res.retried > 0) msgs.push(t('retry.retried').replace('{count}', String(res.retried)));
      if (res.failed > 0) msgs.push(t('retry.failed').replace('{count}', String(res.failed)));
      setResult({ ok: res.retried > 0, msg: msgs.join(', ') });
      setSelected(new Set());
      fetchLogs();
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Retry all failed' });
    }
    setRetrying(false);
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 필터 + 재전송 버튼 */}
      <Card>
        <div className="flex items-end gap-3 overflow-x-auto flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('retry.sourceTable')}</label>
            <select value={sourceTable} onChange={e => setSourceTable(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm">
              <option value="ALL">{t('errors.all')}</option>
              {(data?.sourceTables ?? []).map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('retry.equipment')}</label>
            <select value={equipmentId} onChange={e => setEquipmentId(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm">
              <option value="ALL">{t('errors.all')}</option>
              {(data?.equipmentIds ?? []).map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.startDate')}</label>
            <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.endDate')}</label>
            <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.limit')}</label>
            <input type="number" min={1} max={500} value={limit} onChange={e => setLimit(Number(e.target.value) || 100)}
              className="h-9 w-20 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm" />
          </div>
          <Button variant="primary" leftIcon="search" onClick={handleSearch} disabled={loading}>
            {loading ? '...' : t('errors.search')}
          </Button>
          <Button variant="primary" leftIcon="replay" onClick={handleRetrySelected} disabled={retrying || selected.size === 0}>
            {retrying ? t('retry.retrying') : t('retry.retrySelected')} {selected.size > 0 && `(${selected.size})`}
          </Button>
          <Button variant="ghost" leftIcon="delete" onClick={() => { setResult(null); setShowConfirmDelete(true); }}
            disabled={deleting || selected.size === 0}
            className="!text-destructive hover:!bg-destructive/10">
            선택 삭제 {selected.size > 0 && `(${selected.size})`}
          </Button>
          <Button variant="ghost" leftIcon="restart_alt" onClick={() => { setResult(null); setShowConfirmAll(true); }} disabled={retrying}>
            {t('retry.retryAll')}
          </Button>
        </div>
        {result && (
          <p className={`text-sm font-medium mt-2 ${result.ok ? 'text-success' : 'text-error'}`}>{result.msg}</p>
        )}
      </Card>

      {!data ? (
        <div className="flex-1 flex items-center justify-center">
          <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
        </div>
      ) : (
        <Card noPadding className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface dark:bg-background-dark z-10">
                <tr className="border-b border-border dark:border-border-dark text-left">
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-primary" />
                  </th>
                  <th className="p-3 font-bold text-muted-foreground">{t('retry.logId')}</th>
                  <th className="p-3 font-bold text-muted-foreground">{t('retry.sourceTable')}</th>
                  <th className="p-3 font-bold text-muted-foreground">{t('retry.equipment')}</th>
                  <th className="p-3 font-bold text-muted-foreground">{t('retry.message')}</th>
                  <th className="p-3 font-bold text-muted-foreground">{t('retry.time')}</th>
                  <th className="p-3 font-bold text-muted-foreground">{t('retry.hasRawData')}</th>
                </tr>
              </thead>
              <tbody>
                {allRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <Icon name="check_circle" className="text-success mr-2" />
                      {t('error.empty')}
                    </td>
                  </tr>
                )}
                {pageData.map(row => {
                  const hasRaw = !!row.RAW_DATA;
                  return (
                    <tr key={row.LOG_ID}
                      className={`border-b border-border/50 dark:border-border-dark/50 transition-colors
                        ${selected.has(row.LOG_ID) ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-surface dark:hover:bg-surface-dark'}`}>
                      <td className="p-3">
                        <input type="checkbox" checked={selected.has(row.LOG_ID)} onChange={() => toggleSelect(row.LOG_ID)} className="accent-primary" />
                      </td>
                      <td className="p-3 font-mono text-xs">{row.LOG_ID}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-info/10 text-text dark:text-white text-xs font-medium">{row.SOURCE_TABLE}</span>
                      </td>
                      <td className="p-3 text-xs">{row.EQUIPMENT_ID}</td>
                      <td className="p-3 text-xs max-w-xs truncate" title={row.MESSAGE}>{row.MESSAGE}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{row.CREATED_AT}</td>
                      <td className="p-3 text-xs">
                        {hasRaw
                          ? <span className="px-2 py-0.5 rounded bg-success/10 text-text dark:text-white font-medium">O</span>
                          : <span className="px-2 py-0.5 rounded bg-error/10 text-text dark:text-white font-medium" title={t('retry.noRawData')}>X</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={allRows.length}
            showing={pageData.length}
            onPageChange={setPage}
          />
        </Card>
      )}

      {fetchError && <p className="text-sm text-error flex-shrink-0">{fetchError}</p>}

      <Modal isOpen={showConfirmDelete} onClose={() => setShowConfirmDelete(false)} title="선택 항목 삭제" size="sm">
        <p className="text-base text-text dark:text-white mb-6">선택한 {selected.size}건의 에러 로그를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowConfirmDelete(false)}>{t('settings.cancel')}</Button>
          <Button variant="primary" leftIcon="delete" onClick={handleDeleteSelected} disabled={deleting}
            className="!bg-destructive hover:!bg-destructive/80">
            {deleting ? '삭제 중...' : '삭제'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showConfirmAll} onClose={() => setShowConfirmAll(false)} title={t('retry.retryAll')} size="sm">
        <p className="text-base text-text dark:text-white mb-6">{t('retry.confirmAll')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowConfirmAll(false)}>{t('settings.cancel')}</Button>
          <Button variant="primary" leftIcon="restart_alt" onClick={handleRetryAll} disabled={retrying}>
            {retrying ? t('retry.retrying') : t('retry.retryAll')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
