/**
 * @file src/app/dashboard/sender/components/AgentGuide.tsx
 * @description 송신기 설정 가이드 모달 내부 콘텐츠
 */

import { Icon } from '@/components/ui';

export function AgentGuide() {
  return (
    <div className="flex flex-col gap-4">
      {/* 설비 설정 */}
      <div>
        <p className="text-sm font-bold text-text dark:text-white mb-2">설비 설정</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-accent/5 dark:bg-accent/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">line_code</span>
            <p className="text-muted-foreground text-xs mt-0.5">라인 코드 (예: LINE-01, ASSY-1)</p>
          </div>
          <div className="bg-accent/5 dark:bg-accent/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">equipment_id</span>
            <p className="text-muted-foreground text-xs mt-0.5">설비 코드 (예: EQ-001, PRESS-01)</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          <code className="bg-muted/50 dark:bg-muted/30 px-1.5 py-0.5 rounded">[transforms.add_metadata]</code> 섹션에서 값을 직접 수정하세요
        </p>
      </div>

      {/* 전송 모드 A/B */}
      <div>
        <p className="text-sm font-bold text-text dark:text-white mb-2">전송 모드 선택</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-success/10 dark:bg-success/5 rounded-lg px-3 py-2.5 border border-success/20">
            <div className="flex items-center gap-1.5">
              <Icon name="description" className="text-success" />
              <span className="text-sm font-bold text-success">모드 A — 파일 단위</span>
            </div>
            <span className="text-xs text-success font-medium">(현재 활성)</span>
            <p className="text-sm text-muted-foreground mt-1">새 파일이 생성되면 파일 전체 내용을 처음부터 읽어 전송</p>
            <code className="text-xs bg-success/10 px-1.5 py-0.5 rounded mt-1 inline-block">read_from = &quot;beginning&quot;</code>
          </div>
          <div className="bg-muted/30 dark:bg-muted/20 rounded-lg px-3 py-2.5 border border-border">
            <div className="flex items-center gap-1.5">
              <Icon name="dynamic_feed" className="text-muted-foreground" />
              <span className="text-sm font-bold text-muted-foreground">모드 B — 실시간 추가분</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">(주석 처리됨)</span>
            <p className="text-sm text-muted-foreground mt-1">기존 파일에 새로 추가된 줄만 감지하여 전송 (tail -f 방식)</p>
            <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded mt-1 inline-block">read_from = &quot;end&quot;</code>
          </div>
        </div>
      </div>

      {/* 하위 폴더 포함 */}
      <div>
        <p className="text-sm font-bold text-text dark:text-white mb-2">하위 폴더 포함 여부</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/20 dark:bg-muted/10 rounded-lg px-3 py-2">
            <code className="text-xs bg-muted/50 dark:bg-muted/30 px-1.5 py-0.5 rounded">C:\logs\*.txt</code>
            <p className="text-sm text-muted-foreground mt-1">지정 폴더만 감시 (기본값)</p>
          </div>
          <div className="bg-muted/20 dark:bg-muted/10 rounded-lg px-3 py-2">
            <code className="text-xs bg-muted/50 dark:bg-muted/30 px-1.5 py-0.5 rounded">C:\logs\**\*.txt</code>
            <p className="text-sm text-muted-foreground mt-1">하위 폴더까지 전부 감시</p>
          </div>
        </div>
      </div>
    </div>
  );
}
