/**
 * @file src/app/dashboard/simulator/page.tsx
 * @description VRL 시뮬레이터 전용 페이지 — AI 생성 / 수동 작성 / 시뮬레이션 / TOML 반영
 *
 * 초보자 가이드:
 * 1. **역할**: 샘플 로그로 VRL 파싱 코드를 테스트하고 TOML에 반영
 * 2. **AI 생성**: 파싱 규칙을 설명하면 AI가 VRL 코드를 자동 생성
 * 3. **시뮬레이션**: vector.exe vrl 명령으로 실제 실행하여 결과 확인
 * 4. **TOML 반영**: 검증된 VRL 코드를 aggregator TOML에 삽입
 */
'use client';

import { useState } from 'react';
import { Icon, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { VrlSimulator } from '../receiver/components/VrlSimulator';

export default function SimulatorPage() {
  const [showRestart, setShowRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<{ ok: boolean; msg: string } | null>(null);
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

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="science" className="text-info" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-info to-primary">
            {t('vrlSim.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">
            / {t('vrlSim.desc')}
          </span>
        </h1>
        {restartResult && (
          <span className={`text-xs font-medium ${restartResult.ok ? 'text-success' : 'text-error'}`}>
            {restartResult.msg}
          </span>
        )}
      </div>

      <VrlSimulator
        onApplied={() => setShowRestart(true)}
      />

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
