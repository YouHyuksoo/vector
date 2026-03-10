/**
 * @file src/app/dashboard/download/components/QuickGuide.tsx
 * @description 송신기 다운로드 페이지 빠른 도움말 컴포넌트
 *
 * 초보자 가이드:
 * - 페이지 접속 시 바로 보이는 4단계 설치 가이드 (다운로드 → 설치 → 설정 → 실행)
 * - 각 단계별 구체적인 명령어와 경로 예시 포함
 * - 서비스 등록 방법과 수동 실행 방법 모두 안내
 * - 접기/펼치기로 공간 절약 가능
 */
'use client';

import { useState } from 'react';
import { Icon, Card } from '@/components/ui';

interface Phase {
  icon: string;
  title: string;
  desc: string;
  details: { label: string; text: string }[];
  code?: string;
  pill: string;
  card: string;
  iconBox: string;
  iconColor: string;
  titleColor: string;
  dot: string;
}

const PHASES: Phase[] = [
  {
    icon: 'cloud_download',
    title: '1. 다운로드',
    desc: '2개 파일을 설비 PC에 내려받으세요',
    details: [
      { label: 'vector.zip', text: '아래 초록색 버튼으로 다운로드' },
      { label: '{설비명}.toml', text: '설비 목록에서 해당 설비 클릭하여 다운로드' },
    ],
    pill: 'bg-success/10 text-success',
    card: 'border-success/20',
    iconBox: 'bg-success/10',
    iconColor: 'text-success',
    titleColor: 'text-success',
    dot: 'bg-success',
  },
  {
    icon: 'folder_zip',
    title: '2. 설치',
    desc: '원하는 폴더에 풀어 놓기만 하면 완료',
    details: [
      { label: '압축 해제', text: 'vector.zip을 원하는 폴더에 압축 해제 (예: C:\\vector)' },
      { label: 'TOML 복사', text: '다운받은 {설비명}.toml을 같은 폴더에 넣기' },
    ],
    code: 'C:\\vector\\\n  ├── bin\\vector.exe\n  ├── install-service.bat\n  ├── start-vector.bat\n  └── SPI.toml   ← 다운받은 설정파일',
    pill: 'bg-accent/10 text-accent',
    card: 'border-accent/20',
    iconBox: 'bg-accent/10',
    iconColor: 'text-accent',
    titleColor: 'text-accent',
    dot: 'bg-accent',
  },
  {
    icon: 'tune',
    title: '3. 설정',
    desc: 'TOML 파일을 메모장으로 열어 2가지만 수정',
    details: [
      { label: '로그 경로', text: 'include 항목을 설비의 실제 로그 파일 위치로 변경' },
      { label: '서버 IP', text: 'address 항목을 수집 서버 IP로 변경 (현재: 20.10.30.231)' },
    ],
    code: '# 로그 경로 수정 예시\ninclude = ["C:\\\\logs\\\\*.csv"]\n\n# 서버 IP는 이미 설정됨\naddress = "20.10.30.231:6000"',
    pill: 'bg-primary/10 text-primary',
    card: 'border-primary/20',
    iconBox: 'bg-primary/10',
    iconColor: 'text-primary',
    titleColor: 'text-primary',
    dot: 'bg-primary',
  },
  {
    icon: 'play_circle',
    title: '4. 실행',
    desc: '서비스 등록 또는 수동 실행 선택',
    details: [
      { label: '서비스 등록', text: 'install-service.bat 우클릭 → 관리자 권한으로 실행' },
      { label: '수동 실행', text: 'start-vector.bat 더블클릭 (테스트용)' },
    ],
    pill: 'bg-warning/10 text-warning',
    card: 'border-warning/20',
    iconBox: 'bg-warning/10',
    iconColor: 'text-warning',
    titleColor: 'text-warning',
    dot: 'bg-warning',
  },
];

export function QuickGuide() {
  const [open, setOpen] = useState(true);

  return (
    <Card className="border-primary/30 dark:border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.03]">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="rocket_launch" className="text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-text dark:text-white">빠른 시작 가이드</p>
            <p className="text-xs text-muted-foreground">4단계로 설비 PC에 송신기를 설치하세요</p>
          </div>
        </div>
        <Icon
          name={open ? 'expand_less' : 'expand_more'}
          className="text-muted-foreground"
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* 흐름 요약 바 */}
          <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
            {PHASES.map((p, i) => (
              <div key={p.title} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${p.pill}`}>
                  <Icon name={p.icon} size="xs" />
                  {p.title}
                </div>
                {i < PHASES.length - 1 && (
                  <Icon name="arrow_forward" size="xs" className="text-muted-foreground" />
                )}
              </div>
            ))}
          </div>

          {/* 단계별 상세 */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {PHASES.map(phase => (
              <div
                key={phase.title}
                className={`rounded-xl border bg-white dark:bg-surface-dark p-4 space-y-3 ${phase.card}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`size-7 rounded-lg flex items-center justify-center ${phase.iconBox}`}>
                    <Icon name={phase.icon} size="sm" className={phase.iconColor} />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${phase.titleColor}`}>{phase.title}</p>
                    <p className="text-xs text-muted-foreground">{phase.desc}</p>
                  </div>
                </div>

                <ul className="space-y-2">
                  {phase.details.map(d => (
                    <li key={d.label} className="flex gap-2 text-xs">
                      <span className={`flex-shrink-0 mt-0.5 size-1.5 rounded-full ${phase.dot}`} />
                      <span className="text-text dark:text-white">
                        <span className="font-bold">{d.label}</span>
                        <span className="text-muted-foreground"> — {d.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {phase.code && (
                  <pre className="text-[11px] leading-relaxed bg-slate-50 dark:bg-slate-800/50
                    rounded-lg px-3 py-2 text-muted-foreground font-mono overflow-x-auto">
                    {phase.code}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {/* Agent Manager 권장 안내 */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl
            bg-primary/5 dark:bg-primary/10 border border-primary/20">
            <Icon name="settings_suggest" className="text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-primary mb-1">Agent Manager 사용 (권장)</p>
              <p className="text-xs text-muted-foreground mb-1.5">
                위 과정을 <span className="font-bold">agent-manager.exe</span> 하나로 대체할 수 있습니다.
                설비 PC에서 실행하면 웹 UI로 Vector 설치/설정/시작/서비스 등록을 모두 처리합니다.
              </p>
              <p className="text-[10px] text-muted-foreground">
                agent-manager.exe 실행 → http://localhost:9090 접속 → 관리 탭에서 설치 → 설정 탭에서 설비 정보 입력 → 관리 탭에서 시작
              </p>
            </div>
          </div>

          {/* 서비스 vs 수동 실행 비교 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl
              bg-warning/5 dark:bg-warning/10 border border-warning/20">
              <Icon name="shield" className="text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-warning mb-1">서비스 등록 (권장)</p>
                <p className="text-xs text-muted-foreground mb-1.5">PC 재부팅 시 자동 시작, 실패 시 자동 재시작</p>
                <code className="text-[11px] font-mono text-text dark:text-white block">
                  install-service.bat
                </code>
                <p className="text-[10px] text-muted-foreground mt-1">
                  우클릭 → 관리자 권한으로 실행, 또는 Agent Manager에서 서비스 등록
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl
              bg-slate-50 dark:bg-slate-800/30 border border-border dark:border-border-dark">
              <Icon name="terminal" className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-text dark:text-white mb-1">수동 실행 (테스트용)</p>
                <p className="text-xs text-muted-foreground mb-1.5">터미널에서 직접 실행, 로그 실시간 확인 가능</p>
                <code className="text-[11px] font-mono text-text dark:text-white block">
                  start-vector.bat
                </code>
                <p className="text-[10px] text-muted-foreground mt-1">
                  더블클릭으로 실행 (창 닫으면 중지)
                </p>
              </div>
            </div>
          </div>

          {/* zip 포함 파일 안내 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/30">
            <Icon name="inventory_2" size="sm" className="text-muted-foreground flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              <span className="font-bold">vector.zip 포함 도구:</span>{' '}
              install-service.bat (서비스 등록) · uninstall-service.bat (서비스 제거) · start-vector.bat (수동 시작) · stop-vector.bat (수동 중지)
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
