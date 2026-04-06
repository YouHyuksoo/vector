/**
 * @file components/ErrorLogPanel.tsx
 * @description 처리 현황 패널 — 상태/단계/테이블/장비/시간 범위 필터 + 파일 기반 조회
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 정상 처리(SUCCESS) + 오류(ERROR) 통합 로그 조회
 * 2. **필터**: 상태(Status), 단계(Stage), 테이블, 장비, 시간 범위, 조회 건수
 * 3. **전용 API**: GET /api/monitor/errors (파일 기반, DB 불필요)
 * 4. **자동 폴링**: 5초마다 자동 갱신 (필터 조건 유지)
 */
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ErrorTable } from './ErrorTable';
import { Icon, Button, Modal, Card, Pagination } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import type { ProcessLogResponse } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

const POLL_INTERVAL = 5000;
const PAGE_SIZE = 25;

export function ErrorLogPanel() {
  const { t } = useI18n();

  const [status, setStatus] = useState('ALL');
  const [stage, setStage] = useState('ALL');
  const [sourceTable, setSourceTable] = useState('ALL');
  const [equipmentId, setEquipmentId] = useState('ALL');
  const today = new Date().toISOString().substring(0, 10);
  const [startDate, setStartDate] = useState(`${today}T00:00`);
  const [endDate, setEndDate] = useState(`${today}T23:59`);
  const [limit, setLimit] = useState(100);

  const [data, setData] = useState<ProcessLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (stage !== 'ALL') params.set('stage', stage);
      if (sourceTable !== 'ALL') params.set('sourceTable', sourceTable);
      if (equipmentId !== 'ALL') params.set('equipmentId', equipmentId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('limit', String(limit));

      const qs = params.toString();
      const res = await apiFetch<ProcessLogResponse>(`/api/monitor/errors${qs ? `?${qs}` : ''}`);
      setData(res);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Fetch failed');
    }
  }, [status, stage, sourceTable, equipmentId, startDate, endDate, limit]);

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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch<{ success: boolean; deleted: number }>(
        '/api/monitor/errors',
        { method: 'DELETE' },
      );
      setDeleteResult({ ok: true, msg: t('errors.deleted').replace('{count}', String(res.deleted)) });
      setShowDeleteModal(false);
      fetchLogs();
    } catch (err) {
      setDeleteResult({ ok: false, msg: err instanceof Error ? err.message : 'Delete failed' });
      setShowDeleteModal(false);
    }
    setDeleting(false);
  };

  const hasLogs = (data?.logs.length ?? 0) > 0;
  const totalPages = Math.max(1, Math.ceil((data?.logs.length ?? 0) / PAGE_SIZE));
  const pageData = useMemo(
    () => (data?.logs ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [data, page],
  );

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 필터 + 삭제 */}
      <Card>
        <div className="flex items-end gap-3 overflow-x-auto flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.status')}</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm">
              <option value="ALL">{t('errors.statusAll')}</option>
              <option value="SUCCESS">{t('errors.statusSuccess')}</option>
              <option value="ERROR">{t('errors.statusError')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.stage')}</label>
            <select value={stage} onChange={e => setStage(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm">
              <option value="ALL">{t('errors.stageAll')}</option>
              <option value="FILE_RECEIVE">{t('errors.stageFileReceive')}</option>
              <option value="HTTP_RECEIVE">{t('errors.stageHttpReceive')}</option>
              <option value="TABLE_INSERT">{t('errors.stageTableInsert')}</option>
              <option value="PROCEDURE_CALL">{t('errors.stageProcedureCall')}</option>
              <option value="FILE_WRITE">{t('errors.stageFileWrite')}</option>
              <option value="VECTOR_CONTROL">{t('errors.stageVectorControl')}</option>
              <option value="UNKNOWN">{t('errors.stageUnknown')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.sourceTable')}</label>
            <select value={sourceTable} onChange={e => setSourceTable(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm">
              <option value="ALL">{t('errors.all')}</option>
              {(data?.sourceTables ?? []).map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.equipment')}</label>
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
          <Button variant="ghost" leftIcon="delete" onClick={() => { setDeleteResult(null); setShowDeleteModal(true); }}
            disabled={!hasLogs} className="!text-error hover:!bg-error/10">
            {t('errors.delete')}
          </Button>
        </div>
        {deleteResult && (
          <p className={`text-sm font-medium mt-2 ${deleteResult.ok ? 'text-success' : 'text-error'}`}>{deleteResult.msg}</p>
        )}
      </Card>

      {!data ? (
        <div className="flex-1 flex items-center justify-center">
          <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <ErrorTable logs={pageData} />
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data.logs.length}
            showing={pageData.length}
            onPageChange={setPage}
          />
        </div>
      )}

      {fetchError && <p className="text-sm text-error flex-shrink-0">{fetchError}</p>}

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title={t('errors.delete')} size="sm">
        <p className="text-base text-text dark:text-white mb-6">{t('errors.deleteConfirm')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>{t('settings.cancel')}</Button>
          <Button variant="primary" leftIcon="delete" onClick={handleDelete} disabled={deleting}
            className="!bg-error hover:!bg-error/80">
            {deleting ? t('errors.deleting') : t('errors.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
