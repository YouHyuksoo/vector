/**
 * @file src/app/dashboard/mapping/components/MappingTable.tsx
 * @description Oracle 컬럼 ↔ VRL 소스 필드 매핑 테이블
 *
 * 초보자 가이드:
 * 1. **로그 유형 선택 시**: SOURCE_FIELD가 드롭다운으로 표시 (자동 제안)
 * 2. **로그 유형 미선택 시**: SOURCE_FIELD가 텍스트 입력으로 표시 (수동 입력)
 * 3. **매핑된 행**: 초록색 체크 아이콘으로 표시
 * 4. 드롭다운 필드 목록은 공통 필드 + DB 파싱 룰 병합 결과
 */
'use client';

import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { ColumnMeta, RegistryRow, LogType, ParseField } from '../types';
import { getMergedFields } from '../mapping-utils';

interface Props {
  columns: ColumnMeta[];
  registry: RegistryRow[];
  logType: LogType | null;
  parseRules: Record<string, ParseField[]>;
  onUpdate: (colName: string, field: string, value: string) => void;
}

export default function MappingTable({ columns, registry, logType, parseRules, onUpdate }: Props) {
  const { t } = useI18n();
  const availableFields = logType ? getMergedFields(logType, parseRules) : [];

  const getReg = (colName: string) => registry.find(r => r.COLUMN_NAME === colName);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-base">
        <thead>
          <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
            <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-8" />
            <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('mapping.column')}</th>
            <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('mapping.type')}</th>
            <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('mapping.nullable')}</th>
            <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('mapping.sourceField')}</th>
            <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-24">{t('mapping.required')}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map(col => {
            const reg = getReg(col.COLUMN_NAME);
            const currentValue = reg?.SOURCE_FIELD || '';
            const isMapped = !!currentValue;
            const isCustom = isMapped && logType && !availableFields.some(f => f.value === currentValue);

            return (
              <tr key={col.COLUMN_NAME}
                className={`border-b border-border/50 dark:border-border-dark/50 transition-colors
                  ${isMapped ? 'bg-success/5 dark:bg-success/5' : 'hover:bg-surface/50 dark:hover:bg-background-dark/50'}`}>
                <td className="px-4 py-2 text-center">
                  {isMapped && <Icon name="check_circle" size="xs" className="text-success" />}
                </td>
                <td className="px-4 py-2">
                  <span className="font-mono text-sm font-bold">{col.COLUMN_NAME}</span>
                </td>
                <td className="px-4 py-2">
                  <span className="text-sm text-muted-foreground font-mono">{col.DATA_TYPE}({col.DATA_LENGTH})</span>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-sm font-medium ${col.NULLABLE === 'Y' ? 'text-success' : 'text-warning'}`}>
                    {col.NULLABLE === 'Y' ? t('mapping.yes') : t('mapping.no')}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {logType ? (
                    <select
                      value={isCustom ? '__custom__' : currentValue}
                      onChange={e => e.target.value !== '__custom__' && onUpdate(col.COLUMN_NAME, 'SOURCE_FIELD', e.target.value)}
                      className={`w-full px-2 py-1.5 rounded text-sm font-mono
                        bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                        text-text dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/50
                        ${isMapped ? 'border-success/30' : ''}`}
                    >
                      <option value="">{t('mapping.selectField')}</option>
                      {availableFields.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                      {isCustom && (
                        <option value="__custom__" disabled>{currentValue} ({t('mapping.customField')})</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={currentValue}
                      onChange={e => onUpdate(col.COLUMN_NAME, 'SOURCE_FIELD', e.target.value)}
                      placeholder={t('mapping.placeholder')}
                      className="w-full px-2 py-1.5 rounded text-sm font-mono
                        bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                        text-text dark:text-white placeholder:text-muted-foreground/50
                        focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  )}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={reg?.IS_REQUIRED || 'N'}
                    onChange={e => onUpdate(col.COLUMN_NAME, 'IS_REQUIRED', e.target.value)}
                    className="px-2 py-1.5 rounded text-sm
                      bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                      text-text dark:text-white"
                  >
                    <option value="N">{t('mapping.no')}</option>
                    <option value="Y">{t('mapping.yes')}</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
