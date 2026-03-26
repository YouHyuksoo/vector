/**
 * @file components/SelectionPanel.tsx
 * @description 좌측 패널 — Oracle 테이블/프로시져 목록 검색 및 선택
 *
 * 초보자 가이드:
 * 1. **검색 입력**: 테이블명/프로시져명 필터링
 * 2. **TABLE 모드**: Oracle 테이블 목록 표시 (선택 시 컬럼 로드)
 * 3. **PROCEDURE 모드**: Oracle 프로시져 목록 표시 (패키지 아이콘 구분)
 */
'use client';

import { Icon, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { TargetType, OracleProc } from '../types';

interface Props {
  targetType: TargetType;
  tables: string[];
  filteredTables: string[];
  selected: string;
  tableFilter: string;
  onTableFilterChange: (v: string) => void;
  onSelectTable: (table: string) => void;
  oracleProcs: OracleProc[];
  filteredProcs: OracleProc[];
  selectedProc: string;
  procFilter: string;
  onProcFilterChange: (v: string) => void;
  onSelectProcedure: (proc: OracleProc) => void;
  onAutoCreate?: () => void;
}

export default function SelectionPanel({
  targetType, tables, filteredTables, selected, tableFilter,
  onTableFilterChange, onSelectTable, oracleProcs, filteredProcs,
  selectedProc, procFilter, onProcFilterChange, onSelectProcedure,
  onAutoCreate,
}: Props) {
  const { t } = useI18n();
  const filterValue = targetType === 'TABLE' ? tableFilter : procFilter;
  const setFilter = targetType === 'TABLE' ? onTableFilterChange : onProcFilterChange;

  return (
    <Card noPadding className="p-4 lg:col-span-1">
      <p className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">
        {targetType === 'TABLE' ? t('mapping.oracleTables') : t('mapping.oracleProcedures')}
      </p>
      {onAutoCreate && (
        <button onClick={onAutoCreate}
          className="w-full mb-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold
            border border-primary/30 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors">
          <Icon name="add_circle" size="xs" />
          {t('mapping.autoCreate')}
        </button>
      )}
      <div className="relative mb-2">
        <Icon name="search" size="xs" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={filterValue}
          onChange={e => setFilter(e.target.value)}
          placeholder={t('mapping.filterPlaceholder')}
          className="w-full pl-8 pr-8 py-1.5 rounded-lg text-sm font-mono
            bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
            text-text dark:text-white placeholder:text-muted-foreground/50
            focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        {filterValue && (
          <button onClick={() => setFilter('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-text dark:hover:text-white">
            <Icon name="close" size="xs" />
          </button>
        )}
      </div>
      {targetType === 'TABLE' ? (
        <>
          {tables.length > 0 && (
            <p className="text-xs text-muted-foreground mb-1 px-1">{filteredTables.length} / {tables.length}</p>
          )}
          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {!tables.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noTables')}</p>
            ) : !filteredTables.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noFilterResult')}</p>
            ) : filteredTables.map(tbl => (
              <button key={tbl} onClick={() => onSelectTable(tbl)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors
                  ${selected === tbl
                    ? 'bg-primary/10 text-text dark:text-white border border-primary/20 font-bold'
                    : 'text-muted-foreground hover:bg-surface dark:hover:bg-surface-dark'}`}>
                {tbl}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {oracleProcs.length > 0 && (
            <p className="text-xs text-muted-foreground mb-1 px-1">{filteredProcs.length} / {oracleProcs.length}</p>
          )}
          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {!oracleProcs.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noProcedures')}</p>
            ) : !filteredProcs.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.noFilterResult')}</p>
            ) : filteredProcs.map(proc => (
              <button key={proc.DISPLAY_NAME} onClick={() => onSelectProcedure(proc)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors
                  ${selectedProc === proc.DISPLAY_NAME
                    ? 'bg-primary/10 text-text dark:text-white border border-primary/20 font-bold'
                    : 'text-muted-foreground hover:bg-surface dark:hover:bg-surface-dark'}`}>
                <div className="flex items-center gap-1.5">
                  <Icon name={proc.OBJECT_TYPE === 'PACKAGE' ? 'inventory_2' : 'terminal'} size="xs" className="shrink-0 opacity-50" />
                  <span className="truncate">{proc.DISPLAY_NAME}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
