/**
 * @file BatchIngestModal.tsx
 * @description 여러 로그 파일을 순차로 DB에 재투입하는 모달
 *
 * 동작:
 * 1. 선택된 파일 경로 목록을 받음 (RAW_LOG_BASE 기준 상대경로)
 * 2. 설비 유형/ID 확인 (첫 파일 경로에서 자동 추출)
 * 3. 시작 시 파일마다 read → manual-ingest 를 순차 호출하며 진행률 갱신
 * 4. 중단 가능, 완료 후 성공/실패 집계 표시
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  filePaths: string[];
  vrlTargetMap: Record<string, { targetTable: string }>;
}

interface FailItem { path: string; error: string }

function extractEquipInfo(filePath: string) {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return { equipmentType: parts[0] || '', equipmentId: parts[1] || '' };
}

export default function BatchIngestModal({ isOpen, onClose, filePaths, vrlTargetMap }: Props) {
  const { t } = useI18n();

  const [equipType, setEquipType] = useState('');
  const [equipId, setEquipId] = useState('');
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [current, setCurrent] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [okCount, setOkCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [rowsAccepted, setRowsAccepted] = useState(0);
  const [fails, setFails] = useState<FailItem[]>([]);

  const cancelRef = useRef(false);

  const vrlEquipTypes = useMemo(() => Object.keys(vrlTargetMap).sort(), [vrlTargetMap]);
  const total = filePaths.length;
  const progressPct = total > 0 ? Math.round((current / total) * 100) : 0;

  // 모달 열릴 때 상태 초기화 + 설비 정보 자동 추출
  useEffect(() => {
    if (!isOpen) return;
    const first = filePaths[0];
    if (first) {
      const info = extractEquipInfo(first);
      setEquipType(info.equipmentType);
      setEquipId(info.equipmentId);
    } else {
      setEquipType('');
      setEquipId('');
    }
    setRunning(false);
    setFinished(false);
    setCurrent(0);
    setCurrentFile('');
    setOkCount(0);
    setFailCount(0);
    setRowsAccepted(0);
    setFails([]);
    cancelRef.current = false;
  }, [isOpen, filePaths]);

  const handleStart = async () => {
    if (!equipType || !equipId || filePaths.length === 0) return;
    setRunning(true);
    setFinished(false);
    cancelRef.current = false;

    for (let i = 0; i < filePaths.length; i++) {
      if (cancelRef.current) break;
      const path = filePaths[i];
      setCurrent(i);
      setCurrentFile(path.split('/').pop() || path);

      try {
        // 1) 파일 내용 읽기
        const read = await apiFetch<{ content: string }>(
          `/api/monitor/log-files/read?path=${encodeURIComponent(path)}`,
        );

        // 2) VRL → DB INSERT
        const res = await apiFetch<{ success: boolean; accepted: number; failed: number; error?: string }>(
          '/api/monitor/vrl/manual-ingest',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipmentType: equipType, equipmentId: equipId, logContent: read.content }),
          },
        );

        if (res.success) {
          setOkCount(v => v + 1);
          setRowsAccepted(v => v + (res.accepted || 0));
        } else {
          setFailCount(v => v + 1);
          setFails(list => [...list, { path, error: res.error || 'Unknown' }]);
        }
      } catch (err) {
        setFailCount(v => v + 1);
        setFails(list => [...list, { path, error: err instanceof Error ? err.message : 'Failed' }]);
      }
    }

    setCurrent(filePaths.length);
    setCurrentFile('');
    setRunning(false);
    setFinished(true);
  };

  const handleCancel = () => {
    if (running) {
      cancelRef.current = true;
    } else {
      onClose();
    }
  };

  const canStart = !running && !finished
    && equipType !== '' && equipId !== ''
    && !!vrlTargetMap[equipType]
    && filePaths.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={running ? () => { } : onClose} title={t('logFiles.batchIngestTitle')} size="md">
      <div className="space-y-4">
        {/* 설비 유형 */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">
            {t('logFiles.equipmentType')}
          </label>
          <select
            value={equipType}
            onChange={e => setEquipType(e.target.value)}
            disabled={running || finished}
            className="w-full h-9 px-2 rounded border border-border dark:border-border-dark
              bg-white dark:bg-background-dark text-sm text-text dark:text-white disabled:opacity-60"
          >
            <option value="">{t('logFiles.selectEquipType')}</option>
            {vrlEquipTypes.map(eq => (
              <option key={eq} value={eq}>{eq}</option>
            ))}
          </select>
          {equipType && !vrlTargetMap[equipType] && (
            <p className="text-[10px] text-error mt-0.5">{t('logFiles.noVrlRegistered')}</p>
          )}
          {equipType && vrlTargetMap[equipType] && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              → {vrlTargetMap[equipType].targetTable}
            </p>
          )}
        </div>

        {/* 설비 ID */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">
            {t('logFiles.equipmentId')}
          </label>
          <input
            type="text"
            value={equipId}
            onChange={e => setEquipId(e.target.value)}
            disabled={running || finished}
            placeholder="MOUNTER-001"
            className="w-full h-9 px-2 rounded border border-border dark:border-border-dark
              bg-white dark:bg-background-dark text-sm font-mono text-text dark:text-white disabled:opacity-60"
          />
        </div>

        {/* 대상 파일 요약 */}
        <div className="p-2 rounded bg-surface/50 dark:bg-surface-dark/50 border border-border/50 dark:border-border-dark/50">
          <p className="text-[10px] text-muted-foreground">
            {t('logFiles.batchTarget').replace('{count}', String(total))}
          </p>
          <div className="mt-1 max-h-24 overflow-auto text-[11px] font-mono text-muted-foreground">
            {filePaths.slice(0, 5).map(p => (
              <div key={p} className="truncate" title={p}>{p}</div>
            ))}
            {filePaths.length > 5 && (
              <div className="italic">… +{filePaths.length - 5}</div>
            )}
          </div>
        </div>

        {/* 진행 상태 */}
        {(running || finished) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono truncate">
                {currentFile || (finished ? t('logFiles.batchComplete') : '')}
              </span>
              <span className="text-text dark:text-white font-bold shrink-0 ml-2">
                {current}/{total} ({progressPct}%)
              </span>
            </div>
            <div className="h-2 rounded overflow-hidden bg-surface dark:bg-surface-dark border border-border/50 dark:border-border-dark/50">
              <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-success">✓ {okCount}</span>
              <span className="text-error">✗ {failCount}</span>
              <span className="text-muted-foreground">{t('logFiles.batchRows').replace('{count}', String(rowsAccepted))}</span>
            </div>
          </div>
        )}

        {/* 실패 목록 */}
        {fails.length > 0 && (
          <div className="p-2 rounded bg-error/5 border border-error/30 max-h-32 overflow-auto">
            <p className="text-[10px] font-bold text-error mb-1">
              {t('logFiles.batchFailures')} ({fails.length})
            </p>
            {fails.slice(0, 10).map((f, i) => (
              <div key={i} className="text-[10px] font-mono text-error/90 truncate" title={`${f.path}\n${f.error}`}>
                {f.path.split('/').pop()}: {f.error}
              </div>
            ))}
            {fails.length > 10 && (
              <div className="text-[10px] italic text-error/70">… +{fails.length - 10}</div>
            )}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border dark:border-border-dark">
          {finished ? (
            <Button variant="primary" leftIcon="check" onClick={onClose}>
              {t('settings.close')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={handleCancel}>
                {running ? t('logFiles.batchCancel') : t('logFiles.cancel')}
              </Button>
              {!running && (
                <Button variant="primary" leftIcon="play_arrow"
                  onClick={handleStart} disabled={!canStart}>
                  {t('logFiles.batchStart')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
