/**
 * @file components/AutoCreateModal.tsx
 * @description Oracle 테이블/프로시져 자동 생성 모달 — TABLE/PROCEDURE 공용
 *
 * 초보자 가이드:
 * 1. **설비 유형 선택**: AOI, SPI 등 파싱 필드가 있는 설비 유형 선택
 * 2. **이름 입력**: 비워두면 LOG_{설비유형} 또는 SP_INSERT_{설비유형} 기본값
 * 3. **미리보기**: 생성될 컬럼/파라미터 목록 + DDL 확인
 * 4. **생성**: Oracle DDL 실행 + registry 자동 매핑
 */
'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Modal, Icon, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import type { TargetType, ParseField, PreviewColumnDef } from '../types';
import {
  generateDefaultTableName, generateDefaultProcName,
  buildPreviewColumns, getLogTypesFromRules, getEquipmentIcon,
} from '../mapping-utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetType: TargetType;
  parseRules: Record<string, ParseField[]>;
  onCreated: (name: string, logType: string) => void;
  /** 상위에서 이미 선택된 설비 유형 — 전달되면 선택 UI를 건너뜀 */
  initialLogType?: string;
  /** 강제 재생성 모드 — DROP 후 재생성 */
  forceRecreate?: boolean;
}

export default function AutoCreateModal({ isOpen, onClose, targetType, parseRules, onCreated, initialLogType, forceRecreate = false }: Props) {
  const { t } = useI18n();
  const [logType, setLogType] = useState('');
  const [name, setName] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [showDDL, setShowDDL] = useState(false);
  const [ddlText, setDdlText] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  /** initialLogType이 전달되면 모달 열릴 때 자동 설정 */
  const prevOpen = useRef(false);
  if (isOpen && !prevOpen.current && initialLogType) {
    setLogType(initialLogType);
  }
  prevOpen.current = isOpen;

  const logTypes = useMemo(() => {
    const all = getLogTypesFromRules(parseRules);
    return all.filter(lt => (parseRules[lt] || []).length > 0);
  }, [parseRules]);

  const defaultName = useMemo(() => {
    if (!logType) return '';
    return targetType === 'TABLE' ? generateDefaultTableName(logType) : generateDefaultProcName(logType);
  }, [logType, targetType]);

  const defaultTableName = useMemo(() => {
    if (!logType) return '';
    return generateDefaultTableName(logType);
  }, [logType]);

  const effectiveName = name.trim() || defaultName;
  const effectiveTable = targetTable.trim() || defaultTableName;

  const preview = useMemo((): PreviewColumnDef[] => {
    if (!logType) return [];
    return buildPreviewColumns(logType, parseRules);
  }, [logType, parseRules]);

  const fields = useMemo(() => {
    if (!logType) return [];
    return (parseRules[logType] || []).map(f => ({
      fieldName: f.fieldName,
      fieldLabel: f.fieldLabel || f.fieldName,
    }));
  }, [logType, parseRules]);

  const nameValid = useMemo(() => {
    const n = effectiveName;
    return /^[A-Z_][A-Z0-9_]*$/i.test(n) && n.length <= 30;
  }, [effectiveName]);

  const handleShowDDL = useCallback(async () => {
    if (showDDL) { setShowDDL(false); return; }
    if (!logType || !nameValid) return;
    try {
      const url = targetType === 'TABLE'
        ? '/api/monitor/tables/oracle/create'
        : '/api/monitor/procedures/oracle/create';
      const payload = targetType === 'TABLE'
        ? { tableName: effectiveName, logType, fields, preview: true }
        : { procedureName: effectiveName, tableName: effectiveTable, logType, fields, preview: true };
      const res = await apiFetch<{ ddl: string }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setDdlText(res.ddl);
      setShowDDL(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [showDDL, logType, nameValid, targetType, effectiveName, effectiveTable, fields]);

  const doCreate = useCallback(async () => {
    if (!logType || !nameValid || creating) return;
    setCreating(true);
    setError('');
    try {
      const url = targetType === 'TABLE'
        ? '/api/monitor/tables/oracle/create'
        : '/api/monitor/procedures/oracle/create';
      const payload = targetType === 'TABLE'
        ? { tableName: effectiveName, logType, fields, preview: false, forceRecreate }
        : { procedureName: effectiveName, tableName: effectiveTable, logType, fields, preview: false, forceRecreate };
      const res = await apiFetch<{ success: boolean; error?: string; alreadyExisted?: boolean; tableCreated?: boolean }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.success) {
        onCreated(effectiveName, logType);
        onClose();
        resetState();
      } else {
        const errKey = res.error || 'Unknown';
        const mapped = t(`mapping.${errKey}`);
        setError(mapped !== `mapping.${errKey}` ? mapped : errKey);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const mapped = t(`mapping.${msg}`);
      setError(mapped !== `mapping.${msg}` ? mapped : msg);
    }
    setCreating(false);
  }, [logType, nameValid, creating, targetType, effectiveName, effectiveTable, fields, onCreated, onClose, t]);

  const handleCreate = useCallback(() => doCreate(), [doCreate]);

  const resetState = () => {
    setLogType('');
    setName('');
    setTargetTable('');
    setShowDDL(false);
    setDdlText('');
    setError('');
  };

  const title = targetType === 'TABLE' ? t('mapping.autoCreateTableTitle') : t('mapping.autoCreateProcTitle');

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); resetState(); }} title={title} size="lg">
      <div className="space-y-4">
        {/* 설비 유형 선택 — initialLogType이 있으면 선택된 상태만 표시 */}
        <div>
          <label className="block text-sm font-bold text-muted-foreground mb-2">{t('mapping.logType')}</label>
          {initialLogType && logType ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-primary text-white">
                <Icon name={getEquipmentIcon(logType)} size="xs" />
                {logType}
              </span>
              <button onClick={() => { setLogType(''); }}
                className="text-xs text-muted-foreground hover:text-text dark:hover:text-white transition-colors underline">
                {t('mapping.changeLogType')}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {logTypes.map(lt => (
                <button key={lt} onClick={() => { setLogType(lt); setShowDDL(false); setDdlText(''); setError(''); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all
                    ${logType === lt
                      ? 'bg-primary text-white'
                      : 'bg-surface dark:bg-surface-dark text-muted-foreground hover:text-text dark:hover:text-white border border-border dark:border-border-dark'}`}>
                  <Icon name={getEquipmentIcon(lt)} size="xs" />
                  {lt}
                </button>
              ))}
            </div>
          )}
          {logTypes.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">{t('mapping.noFields')}</p>
          )}
        </div>

        {logType && (
          <>
            {/* 이름 입력 */}
            <div>
              <label className="block text-sm font-bold text-muted-foreground mb-1">
                {targetType === 'TABLE' ? t('mapping.tableNameLabel') : t('mapping.procNameLabel')}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.toUpperCase())}
                placeholder={defaultName}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono
                  bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                  text-text dark:text-white placeholder:text-muted-foreground/50
                  focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {targetType === 'TABLE' ? t('mapping.tableNameDefault') : t('mapping.procNameDefault')}
              </p>
            </div>

            {/* PROCEDURE: INSERT 대상 테이블 */}
            {targetType === 'PROCEDURE' && (
              <div>
                <label className="block text-sm font-bold text-muted-foreground mb-1">
                  {t('mapping.targetTableLabel')}
                </label>
                <input
                  type="text"
                  value={targetTable}
                  onChange={e => setTargetTable(e.target.value.toUpperCase())}
                  placeholder={defaultTableName}
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono
                    bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
                    text-text dark:text-white placeholder:text-muted-foreground/50
                    focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('mapping.targetTableDefault')}</p>
              </div>
            )}

            {/* 컬럼 미리보기 */}
            <div>
              <h3 className="text-sm font-bold text-muted-foreground mb-2">
                {targetType === 'TABLE' ? t('mapping.previewColumns') : t('mapping.previewParams')}
              </h3>
              <div className="border border-border dark:border-border-dark rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface dark:bg-surface-dark text-muted-foreground">
                      <th className="px-3 py-2 text-left font-bold w-8">#</th>
                      <th className="px-3 py-2 text-left font-bold">{t('mapping.column')}</th>
                      <th className="px-3 py-2 text-left font-bold">{t('mapping.type')}</th>
                      <th className="px-3 py-2 text-left font-bold">{t('mapping.sourceField')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((col, i) => (
                      <tr key={col.columnName}
                        className={`border-t border-border dark:border-border-dark ${col.isSystem ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 font-mono font-bold">
                          {col.columnName}
                          {col.isSystem && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-text dark:text-white">
                              {t('mapping.systemCol')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">{col.dataType}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                          {col.sourceField || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DDL 토글 */}
            <div>
              <button onClick={handleShowDDL}
                className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors">
                <Icon name={showDDL ? 'expand_less' : 'expand_more'} size="xs" />
                {showDDL ? t('mapping.hideDDL') : t('mapping.showDDL')}
              </button>
              {showDDL && ddlText && (
                <pre className="mt-2 p-3 rounded-lg bg-surface dark:bg-background-dark border border-border dark:border-border-dark
                  text-xs font-mono text-text dark:text-white overflow-x-auto whitespace-pre-wrap">
                  {ddlText}
                </pre>
              )}
            </div>

            {/* 에러 메시지 */}
            {error && (
              <div className="p-3 rounded-lg bg-error/10 text-error text-sm font-medium">
                {error}
              </div>
            )}

            {/* 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border dark:border-border-dark">
              <Button variant="outline" size="sm" onClick={() => { onClose(); resetState(); }}>
                {t('settings.cancel')}
              </Button>
              <Button variant="primary" size="sm" leftIcon="add_circle"
                onClick={handleCreate} disabled={creating || !nameValid || fields.length === 0}>
                {creating ? t('mapping.creating') : (targetType === 'TABLE' ? t('mapping.createTableBtn') : t('mapping.createProcBtn'))}
              </Button>
            </div>
          </>
        )}

        {!logType && logTypes.length > 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">{t('mapping.selectLogTypeFirst')}</p>
        )}
      </div>
    </Modal>
  );
}
