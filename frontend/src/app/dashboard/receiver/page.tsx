/**
 * @file src/app/dashboard/receiver/page.tsx
 * @description 수신기(Aggregator) TOML 설정 편집 + 백업 이력 페이지
 *
 * 초보자 가이드:
 * 1. **좌측**: Aggregator 폼 설정 + 변경 이력(백업)
 * 2. **우측**: TOML 직접 편집 에디터
 * 3. **저장 후**: Vector 재시작 여부를 선택할 수 있음
 */
'use client';

import { useState } from 'react';
import { Icon, Card, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { AggregatorConfigPanel } from './components/AggregatorConfigPanel';
import { BackupHistory } from './components/BackupHistory';

export default function ReceiverPage() {
  const [content, setContent] = useState('');
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
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="download" className="text-success" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-success to-primary">
            {t('receiver.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">
            / {t('receiver.subtitle')}
          </span>
        </h1>
        {restartResult && (
          <span className={`text-xs font-medium ${restartResult.ok ? 'text-success' : 'text-error'}`}>
            {restartResult.msg}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <AggregatorConfigPanel
          content={content}
          onChange={setContent}
          onSaved={handleSaved}
          refreshKey={configRefreshKey}
        />

        {/* 변경이력 + TOML 직접편집 좌우 배치 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <BackupHistory
            refreshKey={backupRefreshKey}
            onRestored={handleRestored}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon name="code" size="sm" className="text-info" />
              <h3 className="text-base font-bold">{t('sender.form.rawToml')}</h3>
            </div>
            <Card noPadding className="flex-1">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                spellCheck={false}
                className="w-full h-full min-h-[360px] p-3 font-mono text-xs leading-relaxed resize-y
                  bg-background-white dark:bg-background-dark text-text dark:text-white
                  border-0 outline-none focus:ring-0 rounded-lg"
              />
            </Card>
          </div>
        </div>
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
