/**
 * @file src/app/dashboard/errors/page.tsx
 * @description 시스템 오류 현황 페이지 (삭제 기능 포함)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: LOG_ERROR 테이블의 오류 목록 조회/삭제
 * 2. **폴링**: useMonitor 훅으로 5초마다 데이터 갱신
 * 3. **삭제**: 전체 오류 로그 삭제 (확인 모달 포함)
 */
'use client';

import { useState } from 'react';
import { useMonitor } from '@/hooks/useMonitor';
import { ErrorTable } from '../components/ErrorTable';
import { Icon, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

export default function ErrorsPage() {
  const { data, error, refresh } = useMonitor(5000);
  const { t } = useI18n();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch<{ success: boolean; deleted: number }>(
        '/api/monitor/errors',
        { method: 'DELETE' },
      );
      setDeleteResult({ ok: true, msg: t('errors.deleted').replace('{count}', String(res.deleted)) });
      setShowDeleteModal(false);
      refresh();
    } catch (err) {
      setDeleteResult({ ok: false, msg: err instanceof Error ? err.message : 'Delete failed' });
      setShowDeleteModal(false);
    }
    setDeleting(false);
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </div>
    );
  }

  const hasErrors = data.recentErrors.length > 0;

  return (
    <>
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
            disabled={!hasErrors}
            className="!text-error hover:!bg-error/10"
          >
            {t('errors.delete')}
          </Button>
        </div>
      </div>

      <ErrorTable errors={data.recentErrors} />

      {error && (
        <p className="text-sm text-error mt-2">{error}</p>
      )}

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
