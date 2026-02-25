/**
 * @file src/app/dashboard/receiver/components/TargetRoutingSection.tsx
 * @description 설비별 타겟 라우팅 설정 섹션 (TABLE/PROCEDURE 분기)
 *
 * 초보자 가이드:
 * 1. VRL 코드에서 설비 유형을 동적 추출하여 데이터 저장 방식 설정 UI 표시
 * 2. 설비 목록은 하드코딩이 아닌 TOML VRL 코드 기반 (설비 추가/제거 시 자동 반영)
 * 3. 변경 시 VRL 코드를 직접 업데이트하여 부모에게 전달
 */
'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import {
  parseEquipmentTargets,
  updateEquipmentTarget,
  type EquipmentTarget,
} from '../utils/vrl-target-parser';

interface Props {
  content: string;
  onChange: (content: string) => void;
}

export function TargetRoutingSection({ content, onChange }: Props) {
  const { t } = useI18n();

  const targets = useMemo<EquipmentTarget[]>(
    () => parseEquipmentTargets(content),
    [content],
  );

  const handleTypeChange = (equipType: string, newType: 'TABLE' | 'PROCEDURE') => {
    const current = targets.find((tg) => tg.equipmentType === equipType);
    const table = current?.targetTable || '';
    onChange(updateEquipmentTarget(content, equipType, newType, table));
  };

  const handleTableChange = (equipType: string, newTable: string) => {
    const current = targets.find((tg) => tg.equipmentType === equipType);
    const type = current?.targetType || 'TABLE';
    onChange(updateEquipmentTarget(content, equipType, type, newTable));
  };

  if (targets.length === 0) return null;

  return (
    <div className="p-3 rounded-xl bg-surface/50 dark:bg-surface-dark/50 border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="route" size="md" className="text-success" />
        <div>
          <span className="text-base font-bold text-text dark:text-white">
            {t('receiver.form.targetRouting')}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            {t('receiver.form.targetRoutingDesc')}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/50">
              <th className="py-1.5 px-2 font-medium w-28">{t('mapping.logType')}</th>
              <th className="py-1.5 px-2 font-medium w-40">{t('mapping.targetType')}</th>
              <th className="py-1.5 px-2 font-medium">{t('receiver.form.targetName')}</th>
            </tr>
          </thead>
          <tbody>
            {targets.map(({ equipmentType, targetType, targetTable }) => (
              <tr key={equipmentType} className="border-b border-border/30 last:border-0">
                <td className="py-1.5 px-2">
                  <span className="font-mono text-xs font-semibold">{equipmentType}</span>
                </td>
                <td className="py-1.5 px-2">
                  <select
                    value={targetType}
                    onChange={(e) =>
                      handleTypeChange(equipmentType, e.target.value as 'TABLE' | 'PROCEDURE')
                    }
                    className="w-full px-2 py-1 text-xs border rounded-md
                      bg-white dark:bg-slate-800 border-border"
                  >
                    <option value="TABLE">{t('receiver.form.modeTable')}</option>
                    <option value="PROCEDURE">{t('receiver.form.modeProcedure')}</option>
                  </select>
                </td>
                <td className="py-1.5 px-2">
                  {targetType === 'TABLE' ? (
                    <span className="text-xs text-muted-foreground italic">
                      {t('receiver.form.autoDefault')}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={targetTable}
                      onChange={(e) => handleTableChange(equipmentType, e.target.value)}
                      placeholder="PKG_BATCH.P_INSERT"
                      className="w-full px-2 py-1 text-xs font-mono border rounded-md
                        bg-white dark:bg-slate-800 border-border"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
