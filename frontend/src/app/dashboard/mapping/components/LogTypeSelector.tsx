/**
 * @file components/LogTypeSelector.tsx
 * @description 로그 유형(설비) 선택 카드 — 파싱 완료된 설비만 선택 가능
 *
 * 초보자 가이드:
 * 1. **logTypes**: DB parseRules 키에서 추출된 설비 유형 목록
 * 2. **parsed**: DB에 data.* 필드가 있으면 선택 가능 (초록 아이콘)
 * 3. **not parsed**: 파싱 미완료 설비는 비활성 + 점선 테두리
 */
'use client';

import { Icon, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { LogType, ParseField } from '../types';
import { getEquipmentIcon, isTypeParsed } from '../mapping-utils';

interface Props {
  logTypes: string[];
  logType: LogType | null;
  parseRules: Record<string, ParseField[]>;
  onSelect: (lt: LogType | null) => void;
}

export default function LogTypeSelector({ logTypes, logType, parseRules, onSelect }: Props) {
  const { t } = useI18n();

  return (
    <Card noPadding className="px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{t('mapping.logType')}</span>
        <span className="flex items-center gap-1 text-xs text-success"><Icon name="check_circle" size="xs" />{t('mapping.parsed')}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground/60 border-b border-dashed border-muted-foreground/40">{t('mapping.notParsed')}</span>
        {logTypes.map(lt => {
          const icon = getEquipmentIcon(lt);
          const active = logType === lt;
          const parsed = isTypeParsed(lt, parseRules);
          return (
            <button key={lt} onClick={() => parsed && onSelect(active ? null : lt)} disabled={!parsed}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all
                ${active
                  ? 'bg-primary text-white shadow-md'
                  : parsed
                    ? 'bg-surface dark:bg-surface-dark text-text dark:text-white hover:text-primary border border-primary/30 dark:border-primary/30 cursor-pointer'
                    : 'bg-surface dark:bg-surface-dark text-muted-foreground/30 border border-border dark:border-border-dark border-dashed cursor-not-allowed'}`}>
              <Icon name={parsed ? 'check_circle' : icon} size="xs" className={parsed && !active ? 'text-success' : ''} />
              {lt}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
