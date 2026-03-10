/**
 * @file RemoteLogsTab.tsx — 원격 장비 감시 로그 파일 탭
 * @description agent-monitor의 /api/logs/recent를 프록시로 조회하여 파일 목록 표시.
 *   초보자 가이드: 원격 장비에서 Vector가 감시 중인 로그 파일의 이름/크기/수정일을 보여줍니다.
 */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface FileEntry {
  name: string;
  dir: string;
  modifiedAt: string;
  sizeBytes: number;
}

interface LogsData {
  reachable: boolean;
  files?: FileEntry[];
  watchPaths?: string[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RemoteLogsTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/logs`);
      setData(await res.json());
    } catch {
      setData({ reachable: false });
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.reachable) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        <Icon name="cloud_off" size="lg" className="text-destructive mb-2 mx-auto block" />
        {t('remote.status.unreachable')}
      </div>
    );
  }

  const files = data.files || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{t('remote.logs.title')}</span>
        <button onClick={load} className="p-1 hover:bg-surface dark:hover:bg-surface-dark rounded transition-colors">
          <Icon name="refresh" size="xs" />
        </button>
      </div>

      {data.watchPaths && data.watchPaths.length > 0 && (
        <div className="text-[10px] text-muted-foreground/60 font-mono">
          {t('remote.logs.watchPaths')}: {data.watchPaths.join(', ')}
        </div>
      )}

      {files.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground/50">{t('remote.logs.noFiles')}</div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted-foreground/60 border-b border-border/30 dark:border-border-dark/30">
                <th className="text-left py-1 pr-2">{t('remote.logs.fileName')}</th>
                <th className="text-right py-1 pr-2">{t('remote.logs.size')}</th>
                <th className="text-right py-1">{t('remote.logs.modified')}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i} className="border-b border-border/10 dark:border-border-dark/10 last:border-0">
                  <td className="py-1 pr-2 truncate max-w-[200px]" title={`${f.dir}\\${f.name}`}>{f.name}</td>
                  <td className="py-1 pr-2 text-right text-muted-foreground">{formatBytes(f.sizeBytes)}</td>
                  <td className="py-1 text-right text-muted-foreground whitespace-nowrap">
                    {new Date(f.modifiedAt).toLocaleString('ko-KR', {
                      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
