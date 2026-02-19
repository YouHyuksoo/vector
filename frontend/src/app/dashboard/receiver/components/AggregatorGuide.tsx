/**
 * @file src/app/dashboard/receiver/components/AggregatorGuide.tsx
 * @description 수신기(Aggregator) 설정 가이드 모달 내부 콘텐츠
 */

import { Icon } from '@/components/ui';

export function AggregatorGuide() {
  return (
    <div className="flex flex-col gap-4">
      {/* 수신 포트 */}
      <div>
        <p className="text-sm font-bold text-text dark:text-white mb-2">Agent 수신 설정</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-success/5 dark:bg-success/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">수신 IP</span>
            <p className="text-muted-foreground text-xs mt-0.5">0.0.0.0 = 모든 네트워크 허용</p>
          </div>
          <div className="bg-success/5 dark:bg-success/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">수신 포트</span>
            <p className="text-muted-foreground text-xs mt-0.5">Agent의 서버 포트와 반드시 일치</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          <Icon name="warning" size="xs" className="text-warning inline mr-1" />
          Agent의 <code className="bg-muted/50 dark:bg-muted/30 px-1.5 py-0.5 rounded">address</code> 포트와
          Aggregator의 수신 포트가 동일해야 합니다
        </p>
      </div>

      {/* API 전송 */}
      <div>
        <p className="text-sm font-bold text-text dark:text-white mb-2">API 서버 전송</p>
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-accent/5 dark:bg-accent/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">URI</span>
            <p className="text-muted-foreground text-xs mt-0.5">
              Node.js API 서버의 로그 수신 엔드포인트 (기본: http://127.0.0.1:3100/api/logs)
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
          <div className="bg-muted/20 dark:bg-muted/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">배치 크기</span>
            <p className="text-muted-foreground text-xs mt-0.5">N개 이벤트마다 한번에 전송</p>
          </div>
          <div className="bg-muted/20 dark:bg-muted/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">배치 타임아웃</span>
            <p className="text-muted-foreground text-xs mt-0.5">N초마다 전송 (배치 미달이어도)</p>
          </div>
        </div>
      </div>

      {/* 버퍼 & 재시도 */}
      <div>
        <p className="text-sm font-bold text-text dark:text-white mb-2">버퍼 & 재시도</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-muted/20 dark:bg-muted/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">디스크 버퍼</span>
            <p className="text-muted-foreground text-xs mt-0.5">API 서버 다운 시 데이터를 디스크에 보관</p>
          </div>
          <div className="bg-muted/20 dark:bg-muted/10 rounded-lg px-3 py-2">
            <span className="font-bold text-text dark:text-white">재시도</span>
            <p className="text-muted-foreground text-xs mt-0.5">전송 실패 시 지수 백오프로 재시도</p>
          </div>
        </div>
      </div>

      {/* VRL 파싱 */}
      <div>
        <p className="text-sm font-bold text-text dark:text-white mb-2">VRL 파싱 로직</p>
        <div className="bg-primary/5 dark:bg-primary/10 rounded-lg px-3 py-2.5 border border-primary/20">
          <div className="flex items-center gap-1.5">
            <Icon name="code" className="text-primary" />
            <span className="text-sm font-bold text-primary">VRL 시뮬레이터 사용</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            설비별 파싱 로직은 복잡하므로 &quot;VRL 시뮬레이터&quot; 페이지에서 편집하세요.
            또는 하단의 &quot;TOML 직접 편집&quot;을 열어 직접 수정할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
