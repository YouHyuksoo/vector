'use client';
import { Card, Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface ErrorRow {
  ERROR_ID: number;
  SOURCE_TABLE: string;
  EQUIPMENT_ID: string;
  ERROR_MESSAGE: string;
  CREATED_AT: string;
}

export function ErrorTable({ errors }: { errors: ErrorRow[] }) {
  const { t } = useI18n();

  return (
    <div>
      <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">{t('error.title')}</p>
      <Card noPadding>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-36">{t('error.time')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-28">{t('error.table')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-24">{t('error.equipment')}</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('error.message')}</th>
              </tr>
            </thead>
            <tbody>
              {!errors.length ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">
                  <Icon name="check_circle" size="md" className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('error.empty')}</p>
                </td></tr>
              ) : errors.map(e => (
                <tr key={e.ERROR_ID} className="border-b border-border/50 dark:border-border-dark/50 hover:bg-surface/50 dark:hover:bg-background-dark/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-sm text-muted-foreground whitespace-nowrap">{e.CREATED_AT}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono bg-primary/10 text-primary">{e.SOURCE_TABLE}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono bg-info/10 text-info">{e.EQUIPMENT_ID}</span>
                  </td>
                  <td className="px-4 py-2.5 text-error text-sm max-w-xs truncate" title={e.ERROR_MESSAGE}>{e.ERROR_MESSAGE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
