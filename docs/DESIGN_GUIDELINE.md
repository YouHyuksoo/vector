---
sources:
  - frontend/src/app/globals.css
  - frontend/src/app/dashboard/layout.tsx
  - frontend/src/components/ui/
  - frontend/src/components/layout/
  - frontend/src/contexts/I18nContext.tsx
verifiedCommit: e736824
---

# Vector Dashboard 디자인 지침

최종 검증: 2026-07-18

이 문서는 Vector 운영 대시보드의 현재 공용 토큰과 컴포넌트를 기준으로 한 UI 규칙이다. 새 화면은 기존 `frontend/src/components/ui`와 dashboard layout을 우선 재사용한다.

## 1. 기술 기준

| 영역 | 기준 |
|---|---|
| Framework | Next.js 16, React 19 |
| CSS | Tailwind CSS 4 + CSS custom properties |
| Color | `oklch()` 기반 light/dark token |
| Font | 로컬 Pretendard, mono는 Fira Code 계열 |
| Icon | 로컬 Material Symbols Outlined variable font |
| 다국어 | `useI18n()` + `frontend/src/locales/{ko,en,es}.json` |

CDN 폰트나 페이지 전용 아이콘 라이브러리를 추가하지 않는다. 운영망 오프라인 동작을 유지한다.

## 2. 레이아웃

공통 dashboard shell:

```text
화면 전체: h-screen flex-col overflow-hidden
  Header
  본문: flex-1 overflow-hidden
    Sidebar: 256px, 접힘 64px, 모바일 overlay
    Main: flex-1 overflow-auto
      Content: p-6 space-y-6
```

- 페이지 파일은 제목, 주요 상태와 책임별 컴포넌트 조립에 집중한다.
- 화면 내부에서 별도 전체 높이 shell이나 중복 sidebar/header를 만들지 않는다.
- 좁은 화면은 `grid-cols-1`, 넓은 화면은 `lg:`/`xl:` 단계에서 확장한다.
- 긴 표·로그·원문은 페이지 전체가 아니라 해당 패널에 `overflow-auto`를 적용한다.

## 3. 색상 토큰

직접 HEX를 쓰기보다 `globals.css`의 의미 토큰을 사용한다.

| 의미 | 토큰/클래스 |
|---|---|
| 페이지 배경 | `bg-background dark:bg-background-dark` |
| 카드 | `bg-card`, `bg-background-white dark:bg-surface-dark` |
| 기본 텍스트 | `text-text dark:text-white` |
| 보조 텍스트 | `text-muted-foreground`, `text-text-secondary` |
| 테두리 | `border-border dark:border-border-dark` |
| 주요 액션 | `bg-primary text-primary-foreground` |
| 보조 강조 | `accent` |
| 성공 | `success` / `#22c55e` |
| 경고 | `warning` / `#f59e0b` |
| 오류·삭제 | `error` 또는 danger variant |
| 정보 | `info` / `#3b82f6` |

상태를 색만으로 구분하지 않는다. 아이콘, 텍스트 또는 badge를 함께 표시한다.

## 4. 타이포그래피

- 페이지 제목: `text-xl font-bold`, 아이콘과 subtitle을 같은 행에 배치
- 섹션 제목: `text-sm font-bold`, 필요하면 uppercase + tracking
- 본문: `text-sm`
- 보조 설명: `text-xs text-muted-foreground`
- 경로, 포트, 코드, 수치: `font-mono`
- 버튼/상태 라벨은 짧고 동작 중심으로 쓴다.

권장 제목 패턴:

```tsx
<h1 className="text-xl font-bold flex items-center gap-2">
  <Icon name="..." className="text-primary" />
  <span>{t('page.title')}</span>
  <span className="text-muted-foreground text-sm font-normal">/ {t('page.subtitle')}</span>
</h1>
```

## 5. 공용 컴포넌트

모든 공용 UI는 다음 import를 우선한다.

```tsx
import { Button, Card, Icon, Input, Modal, Pagination } from '@/components/ui';
```

### Button

| variant | 용도 |
|---|---|
| `primary` | 저장, 실행, 적용 등 화면 대표 동작 |
| `secondary` | 새로고침, 보조 작업 |
| `ghost` | 취소, 닫기, 가벼운 툴바 동작 |
| `outline` | 선택적 보조 동작 |
| `danger` | 삭제, 중지 등 파괴적 동작 |

- size는 `sm`, `md`, `lg`를 사용한다.
- 로딩 중에는 `isLoading` 또는 disabled를 적용해 중복 실행을 막는다.
- 아이콘은 `leftIcon`/`rightIcon`을 사용한다.

### Card

- 기본: `rounded-2xl border bg-card p-6`
- 자체 헤더/그리드가 있으면 `noPadding` 후 내부 padding을 명시한다.
- 선택 가능한 카드만 `hover` 또는 명확한 hover/selected 상태를 둔다.

### Input

- label, error, helper text를 공용 Input 계약으로 표시한다.
- 코드값·경로는 필요할 때 mono 스타일을 추가한다.
- validation 오류는 필드 아래 `text-error`로 표시하고 저장 결과만 toast에 의존하지 않는다.

### Modal

- overlay click과 Escape로 닫힌다.
- size는 `sm`부터 `6xl`까지 내용에 맞게 선택한다.
- 본문은 viewport를 넘으면 내부 scroll한다.
- 삭제/복구/재시작은 대상과 영향을 본문에 명시하고 취소/실행 버튼을 분리한다.

## 6. 사이드바

현재 메뉴 순서는 `Sidebar.tsx`의 `NAV_ITEMS`가 단일 소스다.

```text
서버 대시보드
장비 대시보드
송신기 설정
수신기 설정
VRL & 매핑
원본 로그 파일
시스템 로그
운영 진단
파일 업로드
송신기 다운로드
시스템 설정
도움말
```

- 활성 항목은 `bg-primary text-primary-foreground font-bold`를 사용한다.
- sidebar 접힘 상태는 localStorage `sidebarCollapsed`에 저장한다.
- 모바일에서는 overlay와 메뉴 선택 시 닫기 동작을 유지한다.
- 페이지를 추가하면 route, Sidebar, locale 3종, 도움말 토픽과 테스트를 함께 갱신한다.

## 7. 운영 화면 패턴

### 조회·모니터링

- 핵심 상태와 실행 가능한 항목을 첫 화면에 둔다.
- 원본/이력/PM2 로그는 별도 탭 또는 보조 패널로 분리한다.
- 자동 갱신 여부, 마지막 갱신 시각과 조회 오류를 노출한다.
- 숫자 지표는 단위와 시간 범위를 같이 표시한다.

### 선택 중심 화면

- 왼쪽 목록/사이드패널에서 대상을 명시적으로 선택한다.
- 오른쪽에 현재 선택과 상세/편집 내용을 표시한다.
- 미선택 상태에는 다음 행동을 설명하는 empty state를 제공한다.
- 위험 동작은 현재 선택 대상이 화면에 보일 때만 활성화한다.

### 설정 화면

- 보기와 편집 상태를 구분한다.
- 저장, 취소, 새로고침을 한 영역에 배치한다.
- 저장이 프로세스 재시작을 요구하면 즉시 적용/나중에 선택을 제공한다.
- 원본 TOML 편집은 고급 옵션으로 접고, 폼 변경과 동기화 상태를 명확히 한다.

### 로그·테이블

- filter → action → grid 순으로 배치한다.
- stage/status는 badge나 색+텍스트 조합으로 표현한다.
- 대량 행은 pagination 또는 limit을 사용한다.
- 긴 메시지와 경로는 truncate하되 title/상세 보기를 제공한다.

## 8. 상태와 피드백

| 상태 | 표현 |
|---|---|
| loading | spinner + action disabled |
| success | success 색 + 완료 문구 |
| warning | warning 색 + 운영 영향 설명 |
| error | error 색 + 원인 메시지와 재시도 동작 |
| empty | 아이콘 + 이유 + 다음 행동 |
| offline | 상태 점 + 텍스트 + 마지막 heartbeat |
| excluded | warning badge + DB 적재 제외 설명 |

API 오류를 빈 데이터로 조용히 바꾸지 않는다. 사용자가 연결 실패와 실제 0건을 구분할 수 있어야 한다.

## 9. 다크모드와 접근성

- 모든 배경·텍스트·border는 light/dark 쌍을 확인한다.
- 텍스트 없는 icon button에는 `title` 또는 접근 가능한 이름을 제공한다.
- keyboard focus를 제거하지 않는다.
- modal은 Escape를 지원하고 destructive action에는 확인 단계를 둔다.
- 색상 대비가 낮은 `text-muted-foreground`를 핵심 값에 사용하지 않는다.

## 10. 페이지 추가 체크리스트

1. route/page는 layout과 상태 wiring만 담당하는가?
2. 큰 폼·그리드·비즈니스 로직을 책임별 컴포넌트로 분리했는가?
3. 공용 Button/Card/Input/Modal/Icon을 재사용했는가?
4. loading, empty, error, disabled와 destructive confirmation이 있는가?
5. light/dark와 모바일 폭에서 확인했는가?
6. `ko.json`, `en.json`, `es.json`을 함께 갱신했는가?
7. Sidebar 메뉴가 필요하면 현재 순서와 icon 규칙을 반영했는가?
8. `frontend/src/docs` 도움말과 `help-docs.check.mjs`를 갱신했는가?
9. `npm run build --prefix frontend`가 통과하는가?
