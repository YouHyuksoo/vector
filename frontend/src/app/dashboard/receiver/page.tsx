/**
 * @file src/app/dashboard/receiver/page.tsx
 * @description 수신기(Aggregator) TOML 설정 편집 + 백업 이력 페이지
 *
 * 초보자 가이드:
 * 1. **좌측**: Aggregator TOML 설정 — 폼 입력 + 접이식 원본 에디터
 * 2. **우측**: 변경 이력 — 과거 백업 조회/미리보기/복구
 * 3. **저장 후**: Vector 재시작 여부를 선택할 수 있음
 */
'use client';

import { useState } from 'react';
import { Icon, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { AggregatorConfigPanel } from './components/AggregatorConfigPanel';
import { BackupHistory } from './components/BackupHistory';

export default function ReceiverPage() {
  const [showRestart, setShowRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [configRefreshKey, setConfigRefreshKey] = useState(0);
  const [backupRefreshKey, setBackupRefreshKey] = useState(0);
  const { t } = useI18n();

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await apiFetch<{ success: boolean }>('/api/monitor/vector/stop', { method: 'POST' });
      await new Promise(r => setTimeout(r, 1500));
      await apiFetch<{ success: boolean }>('/api/monitor/vector/start', { method: 'POST' });
      setRestartResult({ ok: true, msg: t('aggregator.restarted') });
    } catch (err) {
      setRestartResult({ ok: false, msg: err instanceof Error ? err.message : 'Restart failed' });
    }
    setRestarting(false);
    setShowRestart(false);
  };

  const handleSaved = () => {
    setShowRestart(true);
    setBackupRefreshKey(prev => prev + 1);
  };

  const handleRestored = () => {
    setConfigRefreshKey(prev => prev + 1);
    setShowRestart(true);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Icon name="download" className="text-success" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-success to-primary">
            {t('receiver.title')}
          </span>
          <span className="text-muted-foreground text-xs font-normal ml-1">
            / {t('receiver.subtitle')}
          </span>
        </h1>
        {restartResult && (
          <span className={`text-xs font-medium ${restartResult.ok ? 'text-success' : 'text-error'}`}>
            {restartResult.msg}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
        <AggregatorConfigPanel
          onSaved={handleSaved}
          refreshKey={configRefreshKey}
        />

        <BackupHistory
          refreshKey={backupRefreshKey}
          onRestored={handleRestored}
        />
      </div>

      <Modal isOpen={showRestart} onClose={() => setShowRestart(false)} title={t('aggregator.restartPrompt')} size="sm">
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowRestart(false)}>
            {t('aggregator.later')}
          </Button>
          <Button variant="primary" leftIcon="restart_alt" onClick={handleRestart} disabled={restarting}>
            {restarting ? t('aggregator.restarting') : t('aggregator.restart')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
