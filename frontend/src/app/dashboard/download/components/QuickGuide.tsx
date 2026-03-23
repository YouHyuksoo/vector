/**
 * @file src/app/dashboard/download/components/QuickGuide.tsx
 * @description 송신기 설치 가이드 — 접기/펼치기 가능한 4단계 안내
 *
 * 초보자 가이드:
 * - Agent Manager 중심의 4단계 설치 가이드
 * - 접기/펼치기로 공간 절약 가능
 */
'use client';

import { useState } from 'react';
import { Icon, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

const STEPS = [
  {
    icon: 'download',
    title: '다운로드 + 실행',
    desc: 'Agent Manager exe를 설비 PC에 다운로드 후 실행',
    details: [
      '아래 카드에서 OS에 맞는 Agent Manager를 다운로드',
      '다운받은 exe를 더블클릭하면 트레이 아이콘이 표시됨',
      '브라우저에서 localhost:9090 으로 웹 UI 접속',
    ],
  },
  {
    icon: 'settings',
    title: '서버 주소 설정 + TOML 다운로드',
    desc: 'Agent Manager 웹 UI에서 서버 연결 설정',
    details: [
      '상단 배너에서 수집 서버 주소 입력 후 저장',
      '드롭다운에서 설비 TOML 선택 후 다운로드',
      '설비 정보(ID, IP, 로그 경로 등) 확인/수정 후 저장',
    ],
  },
  {
    icon: 'install_desktop',
    title: 'Vector 설치 + 시작',
    desc: 'Vector 바이너리 설치 후 로그 수집 시작',
    details: [
      'Vector 버전 선택 (64-bit Win10+ / 64-bit Win7 / 32-bit)',
      '설치 버튼 클릭 → 자동 다운로드 + 압축 해제',
      '시작 버튼으로 Vector 실행 → IN/OUT 카운터 확인',
    ],
  },
  {
    icon: 'build',
    title: '서비스 등록 (선택)',
    desc: 'PC 부팅 시 자동 시작 설정',
    details: [
      '트레이 메뉴에서 Service 클릭으로 등록/해제',
      '서비스 등록 시 관리자 권한으로 실행 필요',
      '서비스(HTTP 서버) + 트레이(리모컨) 분리 구조',
      '업데이트: 트레이에서 서비스 해제 → 끝내기 → exe 교체 → 재실행 → 서비스 등록',
    ],
  },
];

export function QuickGuide() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-base font-bold text-text dark:text-white">{t('download.guide.title')}</p>
        <Icon name={open ? 'expand_less' : 'expand_more'} size="md" className="text-muted-foreground" />
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-lg border border-border dark:border-border-dark p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">{i + 1}</span>
                <Icon name={step.icon} size="sm" className="text-primary" />
                <p className="text-base font-bold text-text dark:text-white">{step.title}</p>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{step.desc}</p>
              <ul className="space-y-1.5">
                {step.details.map((d, j) => (
                  <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
