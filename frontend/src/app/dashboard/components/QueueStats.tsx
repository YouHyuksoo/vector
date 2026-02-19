'use client';
import { Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

const ITEMS = [
  { key: 'waiting', labelKey: 'queue.wait', color: 'text-info' },
  { key: 'active', labelKey: 'queue.active', color: 'text-warning' },
  { key: 'completed', labelKey: 'queue.done', color: 'text-success' },
  { key: 'failed', labelKey: 'queue.fail', color: 'text-error' },
] as const;

interface Props { queue: { waiting: number; active: number; completed: number; failed: number } }

export function QueueStats({ queue }: Props) {
  const { t } = useI18n();

  return (
    <Card noPadding className="p-4">
      <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">{t('queue.title')}</p>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map(i => (
          <div key={i.key} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border dark:border-border-dark">
            <span className="text-xs uppercase font-semibold text-muted-foreground">{t(i.labelKey)}</span>
            <span className={`font-mono text-base font-bold tabular-nums ${i.color}`}>
              {(queue[i.key] ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
