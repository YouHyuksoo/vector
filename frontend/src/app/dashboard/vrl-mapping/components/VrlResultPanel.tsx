/**
 * @file components/VrlResultPanel.tsx
 * @description VRL 시뮬레이션 결과 표시 — 성공 시 필드 목록, 실패 시 에러 메시지
 *
 * 초보자 가이드:
 * 1. result가 null이면 아무것도 표시하지 않음 (공간 절약)
 * 2. 성공: 파싱된 필드명 + 값 목록
 * 3. 실패: 에러 메시지 (pre 태그로 줄바꿈 유지)
 */
'use client';

import { Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import type { SimResult } from './VrlEditor';

interface Props {
  result: SimResult | null;
}

export default function VrlResultPanel({ result }: Props) {
  const { t } = useI18n();

  if (!result) return null;

  if (result.success) {
    return (
      <Card noPadding>
        <div className="p-3 overflow-auto max-h-[400px]">
          <p className="text-[10px] text-success font-medium mb-2">
            {t('vrlSim.fieldCount').replace('{count}', String(result.fields?.length ?? 0))}
          </p>
          <div className="space-y-1">
            {result.fields?.map((f, i) => (
              <div key={i} className="flex gap-2 text-xs font-mono">
                <span className="text-info font-medium whitespace-nowrap">{f.name}</span>
                <span className="text-muted-foreground">:</span>
                <span className="text-text dark:text-white break-all">
                  {typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="border border-error/30 rounded-xl p-3 overflow-auto max-h-[400px] bg-error/5">
      <p className="text-xs font-medium text-error mb-1">{t('vrlSim.error')}</p>
      <pre className="text-xs text-error/80 whitespace-pre-wrap font-mono">{result.error}</pre>
    </div>
  );
}
