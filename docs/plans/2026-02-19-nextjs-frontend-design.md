# Next.js 프론트엔드 분리 설계서

> **날짜**: 2026-02-19
> **상태**: 승인됨
> **요약**: `public/monitor.html` 단일 파일을 `frontend/` Next.js 멀티 페이지 앱으로 분리

---

## 1. 프로젝트 구조

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 루트 레이아웃 (폰트, 테마 프로바이더)
│   │   ├── page.tsx                # → /dashboard 리다이렉트
│   │   ├── globals.css             # Tailwind + oklch 변수 + 다크모드
│   │   ├── providers.tsx           # ThemeProvider
│   │   └── dashboard/
│   │       ├── layout.tsx          # 대시보드 레이아웃 (Header + Sidebar + Main)
│   │       ├── page.tsx            # 메인 대시보드
│   │       ├── logs/page.tsx       # 로그 뷰어
│   │       ├── mapping/page.tsx    # 테이블-컬럼 매핑
│   │       └── settings/page.tsx   # 시스템 설정
│   ├── components/
│   │   ├── ui/
│   │   │   ├── index.ts            # 배럴 export
│   │   │   ├── Button.tsx
│   │   │   ├── Icon.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Modal.tsx
│   │   └── layout/
│   │       ├── Header.tsx
│   │       └── Sidebar.tsx
│   ├── hooks/
│   │   └── useMonitor.ts           # API 폴링 훅
│   ├── lib/
│   │   └── api.ts                  # API 클라이언트
│   └── contexts/
│       └── ThemeContext.tsx
├── next.config.ts
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```

## 2. 사이드바 네비게이션

| # | 라벨 | 아이콘 | 경로 |
|---|------|--------|------|
| 1 | Dashboard | `dashboard` | `/dashboard` |
| 2 | Log Viewer | `description` | `/dashboard/logs` |
| 3 | Table Mapping | `table_chart` | `/dashboard/mapping` |
| 4 | Settings | `settings` | `/dashboard/settings` |

- 접기/펴기: w-64 ↔ w-16, `localStorage("sidebarCollapsed")`
- 모바일: fixed 오버레이 방식

## 3. 페이지 기능 정의

### Dashboard (`/dashboard`)
- 인프라 상태 카드 (Server, Redis, Oracle, Vector + 제어 버튼)
- Queue 통계 (Waiting, Active, Completed, Failed)
- 등록 테이블 목록
- 장비 Collector 카드 그리드 (온라인/오프라인 표시)
- 최근 에러 테이블
- 5초 자동 폴링
- API: `GET /api/monitor/overview`

### Log Viewer (`/dashboard/logs`)
- 테이블 선택 드롭다운
- 로그 데이터 테이블 (최신순)
- 페이지네이션
- API: `GET /api/monitor/logs?table=XXX&limit=50`

### Table Mapping (`/dashboard/mapping`)
- Oracle 테이블 목록 조회
- 테이블별 컬럼 메타데이터 조회
- 컬럼 레지스트리 CRUD
- API: `GET /api/monitor/tables/oracle`, `GET/POST /api/monitor/registry`

### Settings (`/dashboard/settings`)
- 시스템 설정 조회/수정
- 섹션: Server, Oracle, Redis, Queue, Storage, Heartbeat
- 비밀번호 마스킹, 수정 시 재시작 필요 여부 표시
- API: `GET/PUT /api/monitor/config`

## 4. 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) |
| CSS | Tailwind CSS 4 |
| 색상 체계 | oklch() CSS 변수 |
| 아이콘 | Material Symbols Outlined |
| 폰트 | Outfit + Inter (next/font) |
| 다크모드 | `.dark` 클래스 기반 |
| API 통신 | fetch + SWR 패턴 (useMonitor 훅) |
| 포트 | 3000 (Next.js) → 3100 (Fastify) 프록시 |

## 5. API 프록시

```ts
// next.config.ts
async rewrites() {
  return [
    { source: '/api/:path*', destination: 'http://localhost:3100/api/:path*' }
  ];
}
```

## 6. 디자인 시스템 (DESIGN_GUIDELINE.md 기반)

- oklch() 색상 변수 (라이트/다크)
- 그림자 7단계
- 둥근 모서리 체계 (radius: 0.5rem 기준)
- Button (primary/secondary/ghost/outline), Input, Icon, Card, Modal 컴포넌트
- 다크모드: 반드시 라이트/다크 쌍 지정
- 반응형: sm(640) → md(768) → lg(1024) → xl(1280)

## 7. 백엔드 변경

- `monitor.route.ts`에서 `GET /monitor` (HTML 서빙) 엔드포인트 제거
- API 엔드포인트는 모두 유지
- `public/monitor.html` 삭제 (또는 보관)
