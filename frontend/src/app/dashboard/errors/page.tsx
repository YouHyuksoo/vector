/**
 * @file src/app/dashboard/errors/page.tsx
 * @description 처리 현황 페이지 — 상태/단계/테이블/장비/시간 범위 필터 + 파일 기반 조회
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 정상 처리(SUCCESS) + 오류(ERROR) 통합 로그 조회
 * 2. **필터**: 상태(Status), 단계(Stage), 테이블, 장비, 시간 범위, 조회 건수
 * 3. **전용 API**: GET /api/monitor/errors (파일 기반, DB 불필요)
 * 4. **자동 폴링**: 5초마다 자동 갱신 (필터 조건 유지)
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ErrorTable } from '../components/ErrorTable';
import { Icon, Button, Modal, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import type { ProcessLogResponse } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

const POLL_INTERVAL = 5000;

export default function ErrorsPage() {
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

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

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

  return (
    <>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="error" className="text-error" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-error to-warning">
            {t('errors.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">/ {t('errors.subtitle')}</span>
        </h1>
        <div className="flex items-center gap-3">
          {deleteResult && (
            <span className={`text-sm font-medium ${deleteResult.ok ? 'text-success' : 'text-error'}`}>
              {deleteResult.msg}
            </span>
          )}
          <Button
            variant="ghost"
            leftIcon="delete"
            onClick={() => { setDeleteResult(null); setShowDeleteModal(true); }}
            disabled={!hasLogs}
            className="!text-error hover:!bg-error/10"
          >
            {t('errors.delete')}
          </Button>
        </div>
      </div>

      {/* 필터 바 */}
      <Card>
        <div className="flex items-end gap-3 overflow-x-auto">
          {/* 상태 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.status')}</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
            >
              <option value="ALL">{t('errors.statusAll')}</option>
              <option value="SUCCESS">{t('errors.statusSuccess')}</option>
              <option value="ERROR">{t('errors.statusError')}</option>
            </select>
          </div>

          {/* 단계 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.stage')}</label>
            <select
              value={stage}
              onChange={e => setStage(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
            >
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

          {/* 테이블 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.sourceTable')}</label>
            <select
              value={sourceTable}
              onChange={e => setSourceTable(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
            >
              <option value="ALL">{t('errors.all')}</option>
              {(data?.sourceTables ?? []).map(tbl => (
                <option key={tbl} value={tbl}>{tbl}</option>
              ))}
            </select>
          </div>

          {/* 장비 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.equipment')}</label>
            <select
              value={equipmentId}
              onChange={e => setEquipmentId(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
            >
              <option value="ALL">{t('errors.all')}</option>
              {(data?.equipmentIds ?? []).map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>

          {/* 시간 범위 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.startDate')}</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.endDate')}</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-9 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
            />
          </div>

          {/* 조회 건수 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('errors.limit')}</label>
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={e => setLimit(Number(e.target.value) || 100)}
              className="h-9 w-20 px-2 rounded border border-border dark:border-border-dark bg-white dark:bg-background-dark text-sm"
            />
          </div>

          {/* 조회 버튼 */}
          <Button variant="primary" leftIcon="search" onClick={handleSearch} disabled={loading}>
            {loading ? '...' : t('errors.search')}
          </Button>
        </div>
      </Card>

      {/* 로딩 */}
      {!data && (
        <div className="flex items-center justify-center h-64">
          <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
        </div>
      )}

      {/* 테이블 */}
      {data && <ErrorTable logs={data.logs} />}

      {/* 카운트 */}
      {data && (
        <p className="text-sm text-muted-foreground text-right">
          {t('errors.totalCount')
            .replace('{total}', String(data.total))
            .replace('{count}', String(data.logs.length))}
        </p>
      )}

      {/* 에러 메시지 */}
      {fetchError && <p className="text-sm text-error mt-2">{fetchError}</p>}

      {/* 삭제 모달 */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title={t('errors.delete')} size="sm">
        <p className="text-base text-text dark:text-white mb-6">
          {t('errors.deleteConfirm')}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            {t('settings.cancel')}
          </Button>
          <Button
            variant="primary"
            leftIcon="delete"
            onClick={handleDelete}
            disabled={deleting}
            className="!bg-error hover:!bg-error/80"
          >
            {deleting ? t('errors.deleting') : t('errors.delete')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
