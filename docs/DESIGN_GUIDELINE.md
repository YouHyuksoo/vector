# WBS Master - 디자인 지침 (Design Guideline)

> 이 문서는 WBS Master 프로젝트의 소스 코드를 역분석하여 도출한 디자인 시스템 명세입니다.
> 새 페이지/컴포넌트 작성 시 이 문서를 참조하여 일관된 UI를 유지하세요.

---

## 목차

1. [기술 스택 & 도구](#1-기술-스택--도구)
2. [색상 시스템 (Theme)](#2-색상-시스템-theme)
3. [타이포그래피 (Font)](#3-타이포그래피-font)
4. [아이콘 시스템](#4-아이콘-시스템)
5. [레이아웃 구조](#5-레이아웃-구조)
6. [사이드바 네비게이션](#6-사이드바-네비게이션)
7. [헤더](#7-헤더)
8. [UI 컴포넌트](#8-ui-컴포넌트)
9. [리스트 페이지 패턴](#9-리스트-페이지-패턴)
10. [그리드 시스템](#10-그리드-시스템)
11. [모달 패턴](#11-모달-패턴)
12. [카드 패턴](#12-카드-패턴)
13. [애니메이션 시스템](#13-애니메이션-시스템)
14. [다크모드 규칙](#14-다크모드-규칙)
15. [반응형 디자인](#15-반응형-디자인)
16. [상태 표현 패턴](#16-상태-표현-패턴)
17. [플로팅 메뉴](#17-플로팅-메뉴)
18. [스크롤바 스타일](#18-스크롤바-스타일)

---

## 1. 기술 스택 & 도구

| 분류           | 기술                                         | 버전          |
| -------------- | -------------------------------------------- | ------------- |
| CSS 프레임워크 | Tailwind CSS                                 | 4             |
| CSS 방식       | Utility-first (Tailwind) + CSS 변수          | -             |
| 다크모드       | 클래스 기반 (`.dark`)                        | -             |
| 색상 표기법    | oklch()                                      | -             |
| 테마 생성 도구 | [tweakcn](https://tweakcn.com/)              | -             |
| 아이콘         | Material Symbols Outlined                    | variable font |
| 폰트 로딩      | next/font/google (Inter) + CSS 변수 (Outfit) | -             |

---

## 2. 색상 시스템 (Theme)

### 2.1 기본 색상 토큰

CSS 변수 기반으로 라이트/다크 모드를 전환합니다. oklch() 색상 공간을 사용합니다.

#### 핵심 색상 팔레트

| 토큰                   | 라이트 모드             | 다크 모드               | 용도                         |
| ---------------------- | ----------------------- | ----------------------- | ---------------------------- |
| `--background`         | `oklch(0.98 0.002 248)` | `oklch(0.16 0.035 282)` | 페이지 배경                  |
| `--foreground`         | `oklch(0.16 0.035 282)` | `oklch(0.95 0.007 261)` | 기본 텍스트                  |
| `--card`               | `oklch(1.0 0 0)` (흰색) | `oklch(0.25 0.061 281)` | 카드 배경                    |
| `--primary`            | `oklch(0.67 0.290 341)` | 동일                    | 주요 액션 (마젠타/핑크 계열) |
| `--primary-foreground` | `oklch(1.0 0 0)` (흰색) | 동일                    | Primary 위 텍스트            |
| `--secondary`          | `oklch(0.96 0.020 286)` | `oklch(0.25 0.061 281)` | 보조 배경                    |
| `--accent`             | `oklch(0.89 0.174 171)` | 동일                    | 강조 (민트/청록 계열)        |
| `--destructive`        | `oklch(0.65 0.235 34)`  | 동일                    | 삭제/위험 액션               |
| `--border`             | `oklch(0.92 0.009 225)` | `oklch(0.33 0.083 281)` | 테두리                       |
| `--muted`              | `oklch(0.96 0.020 286)` | `oklch(0.21 0.052 281)` | 비활성 배경                  |
| `--muted-foreground`   | `oklch(0.16 0.035 282)` | `oklch(0.62 0.050 278)` | 비활성 텍스트                |

#### 상태(Status) 색상

| 토큰        | HEX       | Tailwind 클래스              | 용도       |
| ----------- | --------- | ---------------------------- | ---------- |
| `--success` | `#22c55e` | `text-success`, `bg-success` | 성공, 완료 |
| `--warning` | `#f59e0b` | `text-warning`, `bg-warning` | 경고, 대기 |
| `--error`   | `#ef4444` | `text-error`, `bg-error`     | 오류, 삭제 |
| `--info`    | `#3b82f6` | `text-info`, `bg-info`       | 정보       |

#### 레거시 호환 색상

기존 컴포넌트와의 호환을 위해 추가 변수가 정의되어 있습니다.

| 토큰                 | 용도            | Tailwind 클래스       |
| -------------------- | --------------- | --------------------- |
| `--text`             | foreground 별칭 | `text-text`           |
| `--text-secondary`   | 보조 텍스트     | `text-text-secondary` |
| `--surface`          | 표면 배경       | `bg-surface`          |
| `--surface-dark`     | 다크 표면       | `bg-surface-dark`     |
| `--background-white` | 밝은 배경       | `bg-background-white` |
| `--background-dark`  | 어두운 배경     | `bg-background-dark`  |
| `--border-dark`      | 다크 테두리     | `border-border-dark`  |
| `--border-hover`     | 호버 테두리     | `border-border-hover` |
| `--primary-hover`    | Primary 호버    | `bg-primary-hover`    |
| `--card-hover`       | 카드 호버       | `bg-card-hover`       |

#### 차트 색상 (5색 팔레트)

| 토큰        | 용도                       |
| ----------- | -------------------------- |
| `--chart-1` | 차트 색상 1 (Primary 계열) |
| `--chart-2` | 차트 색상 2 (보라 계열)    |
| `--chart-3` | 차트 색상 3 (하늘 계열)    |
| `--chart-4` | 차트 색상 4 (민트 계열)    |
| `--chart-5` | 차트 색상 5 (노랑 계열)    |

#### 사이드바 전용 색상

| 토큰                   | 용도               |
| ---------------------- | ------------------ |
| `--sidebar`            | 사이드바 배경      |
| `--sidebar-foreground` | 사이드바 텍스트    |
| `--sidebar-primary`    | 사이드바 활성 항목 |
| `--sidebar-accent`     | 사이드바 강조      |
| `--sidebar-border`     | 사이드바 테두리    |

### 2.2 그림자 시스템

그림자는 7단계로 정의됩니다.

| 토큰           | 설명                          |
| -------------- | ----------------------------- |
| `--shadow-2xs` | 초소형 (카드 기본)            |
| `--shadow-xs`  | 소형                          |
| `--shadow-sm`  | 작은 그림자 (주차 카드)       |
| `--shadow`     | 기본 그림자                   |
| `--shadow-md`  | 중간 (호버 시 주차 카드)      |
| `--shadow-lg`  | 큰 그림자 (선택된 카드, 버튼) |
| `--shadow-xl`  | 초대형 (플로팅 버튼)          |
| `--shadow-2xl` | 최대 (플로팅 버튼 호버)       |

### 2.3 둥근 모서리 시스템

기본 `--radius: 0.5rem` (8px) 기준으로 계산됩니다.

| 토큰           | 크기 | 용도                          |
| -------------- | ---- | ----------------------------- |
| `--radius-sm`  | 4px  | 작은 버튼, 배지               |
| `--radius-md`  | 6px  | 입력 필드                     |
| `--radius-lg`  | 8px  | 카드, 모달                    |
| `--radius-xl`  | 12px | 큰 카드                       |
| `--radius-2xl` | 16px | Card 컴포넌트 (`rounded-2xl`) |
| `--radius-3xl` | 20px | -                             |
| `--radius-4xl` | 24px | -                             |

---

## 3. 타이포그래피 (Font)

### 3.1 폰트 패밀리

| 용도          | 폰트                      | CSS 변수       | Tailwind     |
| ------------- | ------------------------- | -------------- | ------------ |
| **기본 본문** | Outfit (+ Inter fallback) | `--font-sans`  | `font-sans`  |
| **세리프**    | Georgia, Cambria          | `--font-serif` | `font-serif` |
| **코드/모노** | Fira Code                 | `--font-mono`  | `font-mono`  |

- **Outfit**: CSS 변수(`--font-sans`)로 정의, Google Fonts CDN
- **Inter**: `next/font/google`로 로딩, `--font-inter` 변수, body fallback
- **Material Symbols**: `<link>` 태그로 Google Fonts에서 로딩

### 3.2 폰트 크기 규칙

Tailwind 유틸리티 클래스를 사용합니다.

| 용도             | 클래스                    | 크기 |
| ---------------- | ------------------------- | ---- |
| 페이지 제목 (h1) | `text-xl font-bold`       | 20px |
| 카드/섹션 제목   | `text-lg font-bold`       | 18px |
| 부제목           | `text-base font-semibold` | 16px |
| 본문             | `text-sm`                 | 14px |
| 보조 텍스트      | `text-xs`                 | 12px |
| 극소 라벨        | `text-[10px]`             | 10px |
| 극극소 라벨      | `text-[8px]`              | 8px  |

### 3.3 자간(Tracking) 시스템

| 토큰                 | 값       | 용도        |
| -------------------- | -------- | ----------- |
| `--tracking-tighter` | -0.05em  | 큰 헤딩     |
| `--tracking-tight`   | -0.025em | 제목        |
| `--tracking-normal`  | 0em      | 기본        |
| `--tracking-wide`    | 0.025em  | 버튼 라벨   |
| `--tracking-wider`   | 0.05em   | 섹션 라벨   |
| `--tracking-widest`  | 0.1em    | 대문자 라벨 |

### 3.4 타이포그래피 패턴

```tsx
{/* 페이지 제목 - 그라데이션 텍스트 */}
<h1 className="text-xl font-bold text-white flex items-center gap-2">
  <Icon name="아이콘명" className="text-[#00f3ff]" />
  <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-[#00f3ff] to-[#fa00ff]">
    ENGLISH TITLE
  </span>
  <span className="text-slate-400 text-sm font-normal ml-1">
    / 한글 부제
  </span>
</h1>

{/* 섹션 라벨 */}
<p className="px-3 text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
  SECTION LABEL
</p>

{/* 카드 내 숫자 */}
<p className="text-2xl font-bold text-primary">99%</p>
<p className="text-xl font-bold text-text dark:text-white">42</p>
```

---

## 4. 아이콘 시스템

### 4.1 아이콘 라이브러리

**Material Symbols Outlined** (Google Fonts, Variable Font)

```html
<link
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
  rel="stylesheet"
/>
```

### 4.2 Icon 컴포넌트

```tsx
import { Icon } from "@/components/ui";

// 기본 사용
<Icon name="dashboard" />

// 크기 변형
<Icon name="search" size="xs" />   // 16px
<Icon name="search" size="sm" />   // 20px (기본)
<Icon name="search" size="md" />   // 24px
<Icon name="search" size="lg" />   // 28px
<Icon name="search" size="xl" />   // 32px
<Icon name="search" size="2xl" />  // 40px

// 채워진 아이콘
<Icon name="favorite" filled />

// 색상 지정
<Icon name="check_circle" className="text-success" />
<Icon name="error" className="text-error" />
<Icon name="warning" className="text-warning" />
<Icon name="info" className="text-info" />
<Icon name="star" className="text-primary" />
```

### 4.3 아이콘 기본 스타일 (CSS)

```css
.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 400,
    "GRAD" 0,
    "opsz" 24;
}

.material-symbols-outlined.filled {
  font-variation-settings:
    "FILL" 1,
    "wght" 400,
    "GRAD" 0,
    "opsz" 24;
}
```

### 4.4 프로젝트에서 사용하는 주요 아이콘

| 아이콘명                                    | 용도          |
| ------------------------------------------- | ------------- |
| `dashboard`                                 | 대시보드      |
| `account_tree`                              | WBS           |
| `flag_circle`                               | 마일스톤      |
| `view_kanban`                               | 칸반 보드     |
| `event`                                     | 일정 관리     |
| `smart_toy`                                 | AI 어시스턴트 |
| `check_circle`                              | 완료 상태     |
| `pending`                                   | 대기 상태     |
| `error`                                     | 에러          |
| `warning`                                   | 경고          |
| `search`                                    | 검색          |
| `add`                                       | 추가          |
| `edit`                                      | 수정          |
| `delete`                                    | 삭제          |
| `download`                                  | 다운로드      |
| `upload`                                    | 업로드        |
| `close`                                     | 닫기          |
| `chevron_left` / `chevron_right`            | 네비게이션    |
| `keyboard_arrow_up` / `keyboard_arrow_down` | 스크롤        |

---

## 5. 레이아웃 구조

### 5.1 전체 레이아웃 아키텍처

```
┌─────────────────────────────────────────────────┐
│                  DashboardHeader (h-16)          │
│  [≡] [Logo] [프로젝트 선택] ... [알림] [프로필]  │
├────────┬────────────────────────────────────────┤
│        │                                        │
│ Sidebar│           Main Content                 │
│ (w-64) │          (flex-1, overflow-auto)        │
│   or   │                                        │
│ (w-16) │          bg-background                 │
│ 축소시  │          dark:bg-background-dark        │
│        │                                        │
│        │                                        │
├────────┴────────────────────────────────────────┤
│                FloatingMenu (fixed, 우하단)       │
└─────────────────────────────────────────────────┘
```

### 5.2 레이아웃 컨테이너 클래스

```tsx
// 루트 컨테이너
<div className="h-screen flex flex-col overflow-hidden bg-background dark:bg-background-dark">

// 메인 영역 (헤더 제외)
<div className="flex flex-1 overflow-hidden">

// 사이드바
<aside className="fixed lg:static w-64 lg:w-16(축소시)
  bg-background-white dark:bg-background-dark
  border-r border-border dark:border-border-dark" />

// 메인 콘텐츠
<main className="flex-1 overflow-auto bg-background dark:bg-background-dark">
```

### 5.3 페이지 콘텐츠 컨테이너

모든 대시보드 페이지의 최상위 컨테이너:

```tsx
<div className="p-6 space-y-6">{/* 페이지 콘텐츠 */}</div>
```

- **패딩**: `p-6` (24px)
- **수직 간격**: `space-y-6` (24px)

---

## 6. 사이드바 네비게이션

### 6.1 사이드바 구조

```
사이드바 (w-64, 축소 시 w-16)
├── 토글 버튼 (우측 -3px, 원형, bg-primary)
├── 메뉴 영역 (flex-1, overflow-y-auto, p-4)
│   ├── "Menu" 라벨 (text-xs, uppercase, tracking-wider)
│   ├── 주요 메뉴 항목 15개
│   ├── 구분선 (h-px, bg-border)
│   ├── "Management" 라벨
│   └── 관리 메뉴 항목 8개
└── 하단 영역 (p-4)
    ├── 구분선
    ├── 도움말
    └── 로그아웃
```

### 6.2 네비게이션 항목 목록

#### 주요 메뉴 (Menu)

| #   | 라벨           | 아이콘                    | 경로                               | filled |
| --- | -------------- | ------------------------- | ---------------------------------- | ------ |
| 1   | 대시보드       | `dashboard`               | `/dashboard`                       | -      |
| 2   | WBS 보기       | `account_tree`            | `/dashboard/wbs`                   | O      |
| 3   | 마일스톤       | `flag_circle`             | `/dashboard/milestones`            | -      |
| 4   | TASK 관리      | `view_kanban`             | `/dashboard/kanban`                | -      |
| 5   | 일정 관리      | `event`                   | `/dashboard/holidays`              | -      |
| 6   | 인터뷰 관리    | `mic`                     | `/dashboard/interviews`            | -      |
| 7   | AS-IS 분석     | `analytics`               | `/dashboard/as-is-analysis`        | -      |
| 8   | 고객요구사항   | `contact_page`            | `/dashboard/customer-requirements` | -      |
| 9   | 고객이슈관리   | `support_agent`           | `/dashboard/field-issues`          | -      |
| 10  | 협의요청관리   | `forum`                   | `/dashboard/discussion-items`      | -      |
| 11  | 업무기능추적표 | `fact_check`              | `/dashboard/process-verification`  | -      |
| 12  | 공정설비구성   | `precision_manufacturing` | `/dashboard/equipment`             | O      |
| 13  | 주간 업무보고  | `assignment`              | `/dashboard/weekly-report`         | -      |
| 14  | 문서함 관리    | `folder_copy`             | `/dashboard/documents`             | O      |
| 15  | AI 어시스턴트  | `smart_toy`               | `/dashboard/chat`                  | O      |

#### 관리 메뉴 (Management)

| #   | 라벨            | 아이콘            | 경로                      |
| --- | --------------- | ----------------- | ------------------------- |
| 1   | 기준 설정       | `tune`            | `/dashboard/settings`     |
| 2   | 유저 관리       | `manage_accounts` | `/dashboard/users`        |
| 3   | 프로젝트 멤버   | `person_add`      | `/dashboard/members`      |
| 4   | 채팅 분석       | `analytics`       | `/dashboard/chat/history` |
| 5   | 업무협조 점검표 | `checklist`       | `/dashboard/requirements` |
| 6   | 이슈사항 점검표 | `bug_report`      | `/dashboard/issues`       |
| 7   | Slack 설정      | `forum`           | `/dashboard/slack`        |
| 8   | 데이터 백업     | `backup`          | `/dashboard/backups`      |

### 6.3 메뉴 항목 스타일

```tsx
// 활성 상태
"bg-primary/10 text-primary border border-primary/20";
// 아이콘: text-primary
// 텍스트: font-bold

// 비활성 상태
"text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark";
// 아이콘: text-text-secondary
// 텍스트: font-medium

// 공통
"flex items-center gap-3 px-3 py-2 rounded-lg transition-colors";

// 축소 시 추가
"lg:justify-center lg:px-0"; // 아이콘만 표시
```

### 6.4 사이드바 접기/펴기

- **토글 버튼**: 사이드바 우측 바깥 (`-right-3`, `top-6`)
- **크기**: `size-6` (24px), 원형 (`rounded-full`)
- **색상**: `bg-primary text-white`
- **아이콘**: 접힘 시 `chevron_right`, 펼침 시 `chevron_left`
- **상태 저장**: `localStorage("sidebarCollapsed")`
- **전환**: `transition-all duration-300 ease-in-out`

### 6.5 모바일 동작

- 오버레이: `fixed inset-0 bg-black/50 z-40 lg:hidden`
- 사이드바: `fixed z-50`, `translate-x-0` / `-translate-x-full`
- `lg` 이상에서 `static` 위치

---

## 7. 헤더

### 7.1 헤더 구성 요소

```
┌──────────────────────────────────────────────────────────────┐
│ [≡] [WBS Master 로고]  [프로젝트 선택 ▼]  [오늘 통계 스크롤러]  │
│                              [🌙] [🔔 3] [👤 프로필 ▼]      │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 헤더 기능

| 영역            | 설명                               |
| --------------- | ---------------------------------- |
| 햄버거 메뉴 (≡) | 모바일 사이드바 토글               |
| 로고            | WBS Master 텍스트 + 아이콘         |
| 프로젝트 선택   | 드롭다운으로 프로젝트 전환         |
| 오늘 통계       | TodayStatsScroller 컴포넌트        |
| 다크모드 토글   | `light_mode` / `dark_mode` 아이콘  |
| 알림            | 읽지 않은 수 배지 표시             |
| 프로필          | 사용자 아바타/이름 + 드롭다운 메뉴 |

### 7.3 다크모드 전환

```tsx
// 토글 로직
const toggleDarkMode = () => {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDarkMode ? "light" : "dark");
};

// 초기화 우선순위
// 1. localStorage("theme") 확인
// 2. 없으면 prefers-color-scheme 확인
// 3. 기본값: 시스템 설정
```

---

## 8. UI 컴포넌트

### 8.1 Button

**파일**: `src/components/ui/Button.tsx`

#### Props

| Prop        | 타입                                               | 기본값      | 설명                         |
| ----------- | -------------------------------------------------- | ----------- | ---------------------------- |
| `variant`   | `"primary" \| "secondary" \| "ghost" \| "outline"` | `"primary"` | 스타일 변형                  |
| `size`      | `"sm" \| "md" \| "lg"`                             | `"md"`      | 크기                         |
| `leftIcon`  | `string`                                           | -           | 왼쪽 Material Symbols 아이콘 |
| `rightIcon` | `string`                                           | -           | 오른쪽 아이콘                |
| `isLoading` | `boolean`                                          | `false`     | 로딩 상태                    |
| `fullWidth` | `boolean`                                          | `false`     | 전체 너비                    |

#### 변형 스타일

```
primary:   bg-primary text-white shadow-lg shadow-primary/25
           hover:bg-primary-hover hover:-translate-y-0.5

secondary: bg-card border border-border text-text
           hover:bg-card-hover

ghost:     bg-transparent text-text
           hover:bg-black/5 dark:hover:bg-white/5

outline:   bg-transparent border border-border text-text
           hover:bg-card-hover hover:border-border-hover
```

#### 크기 스타일

```
sm: h-9  px-4 text-sm   (36px)
md: h-10 px-6 text-sm   (40px)
lg: h-12 px-8 text-base (48px)
```

#### 공통 기본 스타일

```
inline-flex items-center justify-center gap-2
rounded-lg font-bold transition-all duration-200
disabled:opacity-50 disabled:cursor-not-allowed
```

### 8.2 Input

**파일**: `src/components/ui/Input.tsx`

#### Props

| Prop         | 타입     | 설명        |
| ------------ | -------- | ----------- |
| `label`      | `string` | 필드 라벨   |
| `leftIcon`   | `string` | 왼쪽 아이콘 |
| `error`      | `string` | 에러 메시지 |
| `helperText` | `string` | 도움말      |

#### 스타일

```
w-full px-4 py-2.5 rounded-lg
bg-surface dark:bg-surface-dark
border border-border dark:border-border-dark
text-text dark:text-white
placeholder:text-text-secondary
focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary

// 에러 시
border-error focus:ring-error/50 focus:border-error
```

### 8.3 Icon

**파일**: `src/components/ui/Icon.tsx`

| size  | 픽셀        |
| ----- | ----------- |
| `xs`  | 16px        |
| `sm`  | 20px (기본) |
| `md`  | 24px        |
| `lg`  | 28px        |
| `xl`  | 32px        |
| `2xl` | 40px        |

### 8.4 Toast

**파일**: `src/components/ui/Toast.tsx`

#### 토스트 타입

| 타입      | 아이콘         | 악센트 색상                | 자동 닫힘 |
| --------- | -------------- | -------------------------- | --------- |
| `success` | `check_circle` | 에메랄드 → 초록 그라데이션 | 4초       |
| `error`   | `error`        | 빨강 → 로즈 그라데이션     | 6초       |
| `warning` | `warning`      | 앰버 → 오렌지 그라데이션   | 5초       |
| `info`    | `info`         | 파랑 → 시안 그라데이션     | 4초       |

#### 사용법

```tsx
const toast = useToast();
toast.success("저장되었습니다!");
toast.error("오류가 발생했습니다.", "제목");
toast.warning("주의!");
toast.info("정보입니다.");
```

#### 위치 & 스타일

- 위치: 화면 중앙 상단 (`top-6, left-1/2, -translate-x-1/2`)
- 배경: `bg-slate-900/bg-slate-800`
- 상단 악센트 바: 3px 그라데이션
- 하단 프로그레스 바: 남은 시간 표시

---

## 9. 리스트 페이지 패턴

모든 리스트(목록) 페이지는 동일한 레이아웃 구조를 따릅니다.

### 9.1 페이지 레이아웃 순서

```tsx
<div className="p-6 space-y-6">
  {/* 1. 헤더 영역 */}
  {/* 2. 프로젝트 미선택 안내 */}
  {/* 3. 통계 카드 (6열 그리드) */}
  {/* 4. 탭 바 */}
  {/* 5. 필터 바 */}
  {/* 6. 테이블 */}
  {/* 7. 모달들 */}
</div>
```

### 9.2 헤더 패턴

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
  {/* 좌측: 제목 */}
  <div>
    <h1 className="text-xl font-bold ...">
      <Icon name="아이콘" className="text-[#00f3ff]" />
      <span
        className="tracking-wider bg-clip-text text-transparent
        bg-gradient-to-r from-[#00f3ff] to-[#fa00ff]"
      >
        ENGLISH TITLE
      </span>
      <span className="text-slate-400 text-sm font-normal ml-1">
        / 한글 제목
      </span>
    </h1>
    <p className="text-text-secondary mt-1">설명</p>
  </div>

  {/* 우측: 액션 버튼들 */}
  <div className="flex items-center gap-3">
    {/* 프로젝트 배지 */}
    <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
      <Icon name="folder" size="sm" className="text-primary" />
      <span className="text-sm font-medium text-primary">{project.name}</span>
    </div>
    <Button variant="outline" leftIcon="download">
      엑셀 다운로드
    </Button>
    <Button variant="outline" leftIcon="upload">
      Excel 가져오기
    </Button>
    <Button variant="primary" leftIcon="add">
      새 항목 추가
    </Button>
  </div>
</div>
```

### 9.3 통계 카드 그리드

```tsx
<div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
```

#### 비율 카드 (프로그레스 바 포함)

```tsx
<div
  className="bg-gradient-to-br from-primary/10 to-success/10
  border border-primary/20 rounded-xl p-3"
>
  <div className="flex items-center gap-2 mb-2">
    <Icon name="speed" size="xs" className="text-primary" />
    <span className="text-xs font-semibold text-primary">비율명</span>
  </div>
  <p className="text-2xl font-bold text-primary mb-1">{rate}%</p>
  <div className="h-1.5 bg-white/50 dark:bg-black/20 rounded-full overflow-hidden">
    <div
      className="h-full bg-gradient-to-r from-primary to-success rounded-full"
      style={{ width: `${rate}%` }}
    />
  </div>
</div>
```

#### 카운트 카드

```tsx
<div
  className="bg-background-white dark:bg-surface-dark
  border border-border dark:border-border-dark rounded-xl p-3"
>
  <div className="flex items-center gap-2">
    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
      <Icon name="아이콘" size="xs" className="text-primary" />
    </div>
    <div>
      <p className="text-xl font-bold text-text dark:text-white">{count}</p>
      <p className="text-[10px] text-text-secondary">라벨</p>
    </div>
  </div>
</div>
```

### 9.4 탭 스타일

```tsx
<div
  className="flex items-center gap-1 p-1
  bg-surface dark:bg-background-dark rounded-lg w-fit"
>
  <button
    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
    transition-colors ${
      active
        ? "bg-background-white dark:bg-surface-dark text-primary shadow-sm"
        : "text-text-secondary hover:text-text dark:hover:text-white"
    }`}
  >
    <Icon name="icon" size="xs" />
    <span>탭명</span>
    <span
      className={`px-1.5 py-0.5 rounded text-xs ${
        active
          ? "bg-primary/10 text-primary"
          : "bg-surface dark:bg-background-dark"
      }`}
    >
      {count}
    </span>
  </button>
</div>
```

### 9.5 필터 바

```tsx
<div className="flex flex-wrap gap-4">
  <div className="w-64">
    <Input leftIcon="search" placeholder="검색..." />
  </div>
  <select
    className="px-3 py-2 rounded-lg
    bg-surface dark:bg-surface-dark
    border border-border dark:border-border-dark
    text-sm text-text dark:text-white"
  >
    <option value="all">전체</option>
  </select>
</div>
```

### 9.6 테이블 (CSS Grid 방식)

```tsx
<div
  className="bg-background-white dark:bg-surface-dark
  border border-border dark:border-border-dark
  rounded-xl overflow-hidden overflow-x-auto"
>
  {/* 헤더 */}
  <div
    className="grid gap-2 px-4 py-3
    bg-surface dark:bg-background-dark
    border-b border-border dark:border-border-dark
    text-xs font-semibold text-text-secondary uppercase
    min-w-[1200px]"
    style={{ gridTemplateColumns: "80px 100px 1fr 80px 50px" }}
  >
    <div>컬럼1</div>
    <div>컬럼2</div>
    ...
  </div>

  {/* 빈 목록 */}
  <div className="p-8 text-center">
    <Icon name="inbox" size="xl" className="text-text-secondary mb-4" />
    <p className="text-text-secondary">등록된 항목이 없습니다.</p>
  </div>

  {/* 행 */}
  <div
    className="grid gap-2 px-4 py-3
    border-b border-border dark:border-border-dark
    hover:bg-surface dark:hover:bg-background-dark
    transition-colors items-center min-w-[1200px]"
    style={{ gridTemplateColumns: "80px 100px 1fr 80px 50px" }}
  >
    ...
  </div>
</div>
```

---

## 10. 그리드 시스템

### 10.1 통계 카드 그리드

```tsx
// 6열 (데스크탑) / 2열 (모바일)
<div className="grid grid-cols-2 lg:grid-cols-6 gap-3">

// 4열 (데스크탑) / 2열 (모바일)
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

// 3열 (데스크탑) / 1열 (모바일)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```

### 10.2 테이블 그리드

CSS Grid의 `gridTemplateColumns` inline 스타일을 사용합니다:

```tsx
style={{ gridTemplateColumns: "80px 100px 1fr 80px 50px" }}
```

- 고정 열: `px` 단위 (상태, 날짜, 액션 등)
- 유동 열: `1fr` (내용, 설명 등)
- 최소 너비: `min-w-[1200px]` (수평 스크롤 허용)

### 10.3 간격 규칙

| 용도               | 클래스      | 크기 |
| ------------------ | ----------- | ---- |
| 통계 카드 간격     | `gap-3`     | 12px |
| 섹션 간격          | `space-y-6` | 24px |
| 필터 항목 간격     | `gap-4`     | 16px |
| 버튼 그룹 간격     | `gap-3`     | 12px |
| 텍스트 아이콘 간격 | `gap-2`     | 8px  |
| 사이드바 메뉴 간격 | `gap-1`     | 4px  |
| 탭 간격            | `gap-1`     | 4px  |

---

## 11. 모달 패턴

### 11.1 Modal 컴포넌트

**파일**: `src/components/ui/Modal.tsx`

#### 크기

| size   | 최대 너비           | 용도             |
| ------ | ------------------- | ---------------- |
| `sm`   | 384px (`max-w-sm`)  | 확인 다이얼로그  |
| `md`   | 448px (`max-w-md`)  | 기본 폼 (기본값) |
| `lg`   | 512px (`max-w-lg`)  | 큰 폼            |
| `xl`   | 576px (`max-w-xl`)  | 복잡한 폼        |
| `full` | 896px (`max-w-4xl`) | 대형 콘텐츠      |

#### 구조

```tsx
<Modal isOpen={isOpen} onClose={onClose} title="제목" size="lg">
  {/* 본문: p-6, max-h-[calc(100vh-200px)], overflow-y-auto */}
  <div className="space-y-4">{/* 폼 필드들 */}</div>
  {/* 액션 버튼 */}
  <div className="flex justify-end gap-3 mt-6">
    <Button variant="ghost" onClick={onClose}>
      취소
    </Button>
    <Button variant="primary">저장</Button>
  </div>
</Modal>
```

#### 스타일

```
// 오버레이
fixed inset-0 bg-black/50

// 모달 박스
bg-background-white dark:bg-surface-dark
rounded-xl shadow-xl
animate-in fade-in zoom-in-95 duration-200

// 헤더
px-6 py-4 border-b border-border dark:border-border-dark

// 본문
p-6 max-h-[calc(100vh-200px)] overflow-y-auto
```

### 11.2 ConfirmModal (확인 모달)

삭제 등 확인이 필요한 액션에 사용합니다.

### 11.3 ImportExcelModal (엑셀 가져오기)

공통 엑셀 업로드 모달: `@/components/common/ImportExcelModal`

---

## 12. 카드 패턴

### 12.1 Card 컴포넌트

**파일**: `src/components/ui/Card.tsx`

```tsx
<Card hover noPadding>
  <CardHeader>헤더</CardHeader>
  <CardContent>본문</CardContent>
  <CardFooter>푸터</CardFooter>
</Card>
```

#### 기본 스타일

```
rounded-2xl border border-border bg-card
transition-all duration-200
```

#### Props

| Prop        | 효과                                      |
| ----------- | ----------------------------------------- |
| `hover`     | `hover:shadow-lg hover:border-primary/50` |
| `noPadding` | 기본 `p-8` 패딩 제거                      |

#### 서브 컴포넌트

| 컴포넌트      | 여백   |
| ------------- | ------ |
| `CardHeader`  | `mb-4` |
| `CardContent` | 없음   |
| `CardFooter`  | `mt-4` |

### 12.2 통계 카드 (인라인)

Card 컴포넌트 대신 직접 스타일링하는 경우가 많습니다:

```tsx
// 기본 통계 카드
<div className="bg-background-white dark:bg-surface-dark
  border border-border dark:border-border-dark
  rounded-xl p-3">

// 그라데이션 강조 카드
<div className="bg-gradient-to-br from-primary/10 to-success/10
  border border-primary/20 rounded-xl p-3">

// 특수 색상 카드
<div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3">
```

---

## 13. 애니메이션 시스템

### 13.1 정의된 애니메이션 목록

| 클래스                   | 효과                     | 지속 시간 | 이징         |
| ------------------------ | ------------------------ | --------- | ------------ |
| `animate-slide-in-right` | 오른쪽에서 슬라이드 인   | 300ms     | ease-out     |
| `animate-slide-in-down`  | 위에서 아래로 슬라이드   | 200ms     | ease-out     |
| `animate-fade-in`        | 페이드 인                | 200ms     | ease-out     |
| `animate-bounce-in`      | 중앙 팝업 바운스         | 400ms     | ease-out     |
| `animate-toast-in`       | 토스트 진입              | 400ms     | cubic-bezier |
| `animate-fadeIn`         | 페이드 인                | 300ms     | ease-out     |
| `animate-slideUp`        | 아래에서 위로 슬라이드   | 300ms     | ease-out     |
| `animate-slideDown`      | 위에서 아래로 (드롭다운) | 200ms     | ease-out     |
| `animate-scaleIn`        | 스케일 인 (95% → 100%)   | 200ms     | ease-out     |
| `animate-pulseGlow`      | 파란 글로우 펄스         | 2s        | infinite     |
| `animate-pulse-subtle`   | 미묘한 펄스              | 2s        | infinite     |
| `animate-shimmer`        | 로딩 시머 효과           | 1.5s      | infinite     |
| `animate-countUp`        | 카운트 업                | 500ms     | ease-out     |
| `animate-progressFill`   | 프로그레스 바 채우기     | 1s        | ease-out     |
| `animate-toast-progress` | 토스트 프로그레스        | dynamic   | linear       |

### 13.2 트랜지션 규칙

| 용도               | 클래스                                                    |
| ------------------ | --------------------------------------------------------- |
| 기본 전환          | `transition-colors`                                       |
| 버튼/카드          | `transition-all duration-200`                             |
| 사이드바           | `transition-all duration-300 ease-in-out`                 |
| 배경/텍스트 (body) | `transition: background-color 0.2s ease, color 0.2s ease` |
| 플로팅 메뉴        | `transition-all duration-300`                             |

### 13.3 리플 효과

```css
.ripple-effect {
  position: relative;
  overflow: hidden;
}
.ripple-effect:active::after {
  animation: ripple 0.6s ease-out;
}
```

---

## 14. 다크모드 규칙

### 14.1 핵심 원칙

```tsx
// ❌ 틀림 - dark: 클래스만 있고 라이트 모드 기본값 없음
className = "dark:bg-slate-900";

// ✅ 올바름 - 라이트/다크 모드 모두 지정
className = "bg-white dark:bg-slate-900";
```

### 14.2 자주 사용하는 라이트/다크 쌍

| 용도        | 라이트                | 다크                         |
| ----------- | --------------------- | ---------------------------- |
| 배경        | `bg-background`       | `dark:bg-background-dark`    |
| 카드 배경   | `bg-background-white` | `dark:bg-surface-dark`       |
| 텍스트      | `text-text`           | `dark:text-white`            |
| 보조 텍스트 | `text-text-secondary` | (양쪽 동일 변수)             |
| 테두리      | `border-border`       | `dark:border-border-dark`    |
| 표면 (호버) | `hover:bg-surface`    | `dark:hover:bg-surface-dark` |
| 입력 필드   | `bg-surface`          | `dark:bg-surface-dark`       |

### 14.3 구현 방식

- **방식**: `@custom-variant dark (&:where(.dark, .dark *));`
- **전환**: `<html>` 태그에 `dark` 클래스 토글
- **저장**: `localStorage("theme")` → `"dark"` 또는 `"light"`
- **폼 요소**: `color-scheme: light` / `.dark color-scheme: dark`

---

## 15. 반응형 디자인

### 15.1 브레이크포인트 (Tailwind 기본)

| 브레이크포인트 | 크기   | 용도        |
| -------------- | ------ | ----------- |
| `sm`           | 640px  | 모바일 가로 |
| `md`           | 768px  | 태블릿      |
| `lg`           | 1024px | 데스크탑    |
| `xl`           | 1280px | 대형 화면   |

### 15.2 반응형 패턴

```tsx
// 헤더: 모바일 세로 → 데스크탑 가로
"flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4";

// 통계 카드: 2열 → 6열
"grid grid-cols-2 lg:grid-cols-6 gap-3";

// 사이드바: 모바일 오버레이 → 데스크탑 고정
"fixed lg:static";
"-translate-x-full lg:translate-x-0";
"lg:hidden"; // 모바일 오버레이

// 숨김 처리
"hidden lg:flex"; // 모바일에서 숨김
"lg:hidden"; // 데스크탑에서 숨김
```

---

## 16. 상태 표현 패턴

### 16.1 상태 배지

```tsx
// 상태 설정 타입
const STATUS_CONFIG = {
  PENDING: {
    label: "대기",
    icon: "pending",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  ACTIVE: {
    label: "활성",
    icon: "check_circle",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  COMPLETED: {
    label: "완료",
    icon: "done_all",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  CANCELLED: {
    label: "취소",
    icon: "cancel",
    color: "text-error",
    bgColor: "bg-error/10",
  },
};

// 배지 렌더링
<button
  className={`flex items-center gap-1 px-2 py-1
  rounded-md text-xs font-medium
  ${statusConfig.bgColor} ${statusConfig.color}`}
>
  <Icon name={statusConfig.icon} size="xs" />
  <span>{statusConfig.label}</span>
</button>;
```

### 16.2 상태 드롭다운

상태 배지를 클릭하면 드롭다운이 표시됩니다:

```tsx
// 오버레이 (닫기용)
<div className="fixed inset-0 z-10" onClick={() => close()} />

// 드롭다운 메뉴
<div className="absolute left-0 top-full mt-1 z-20
  bg-background-white dark:bg-surface-dark
  border border-border dark:border-border-dark
  rounded-lg shadow-lg py-1 min-w-[120px]">
  {options.map(opt => (
    <button className="w-full flex items-center gap-2
      px-3 py-2 text-sm
      hover:bg-surface dark:hover:bg-background-dark
      transition-colors">
      <Icon name={opt.icon} size="xs" className={opt.color} />
      <span className={opt.color}>{opt.label}</span>
      {isSelected && <Icon name="check" size="xs" className="ml-auto text-primary" />}
    </button>
  ))}
</div>
```

### 16.3 로딩 상태

```tsx
// 스피너
<Icon name="progress_activity" className="animate-spin" />

// 시머 로딩
<div className="animate-shimmer h-4 rounded" />

// 버튼 로딩
<Button isLoading>저장 중...</Button>
```

### 16.4 빈 상태

```tsx
<div className="p-8 text-center">
  <Icon name="inbox" size="xl" className="text-text-secondary mb-4" />
  <p className="text-text-secondary">등록된 항목이 없습니다.</p>
</div>
```

### 16.5 프로젝트 미선택 상태

```tsx
<div className="p-8 text-center">
  <Icon name="folder_open" size="xl" className="text-text-secondary mb-4" />
  <p className="text-text-secondary">프로젝트를 선택해주세요.</p>
</div>
```

---

## 17. 플로팅 메뉴

### 17.1 위치 & 구조

```
위치: fixed bottom-6 right-6 z-[70]
```

```
  [AI 대화]  ←  호버 시 위로 펼쳐짐
  [위로 ↑]
  [아래로 ↓]
  [닫기 ✕]
  ─────────
  [● 메인]   ← size-14, 그라데이션
```

### 17.2 메인 버튼 스타일

```tsx
"size-14 rounded-full
  bg-gradient-to-br from-primary to-purple-600
  shadow-xl hover:shadow-2xl
  transition-all duration-300"
// 열림 시: "rotate-180 scale-110"
```

### 17.3 메뉴 아이템 스타일

```tsx
// 아이콘 버튼
"size-10 rounded-full bg-slate-700 hover:bg-primary
  shadow-lg transition-colors"

// 라벨
"px-2 py-1 rounded bg-slate-900 text-white text-xs whitespace-nowrap"
```

### 17.4 숨김 상태 (축소 버튼)

```tsx
"size-10 rounded-full
  bg-gradient-to-br from-primary/50 to-purple-600/50
  hover:from-primary hover:to-purple-600"
```

- **상태 저장**: `localStorage("floating-menu-hidden")`

---

## 18. 스크롤바 스타일

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--background);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
```

---

## 부록: 컴포넌트 임포트 경로

```tsx
// UI 컴포넌트
import {
  Button,
  Input,
  Icon,
  Modal,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui";
import { useToast } from "@/components/ui";

// 레이아웃 컴포넌트
import {
  DashboardLayout,
  DashboardHeader,
  DashboardSidebar,
} from "@/components/layout";

// 공통 컴포넌트
import { FloatingMenu, ImportExcelModal } from "@/components/common";

// 컨텍스트
import { useProject } from "@/contexts/ProjectContext";
import { ToastProvider } from "@/contexts";

// 프로바이더
import { QueryProvider } from "@/components/providers/QueryProvider";
```

---

## 부록: 주차 캐로셀 스타일 (BEM)

주간보고 페이지에서 사용하는 BEM 명명법 컴포넌트:

| 클래스                           | 용도                         |
| -------------------------------- | ---------------------------- |
| `.week-carousel`                 | 컨테이너                     |
| `.week-carousel__header`         | 주차 정보 헤더               |
| `.week-carousel__nav-btn`        | 이전/다음 버튼 (원형, 40px)  |
| `.week-carousel__card`           | 개별 주차 카드 (min-w-100px) |
| `.week-carousel__card--selected` | 선택된 주차 (bg-primary)     |
| `.week-carousel__today-btn`      | 오늘 버튼                    |

---

## 부록: React Flow 커스텀 스타일

장비 연결 다이어그램(공정설비구성)에서 사용하는 React Flow 오버라이드:

| 셀렉터                         | 스타일                       |
| ------------------------------ | ---------------------------- |
| `.react-flow__edge.selected`   | stroke: 핑크, 4px, glow 효과 |
| `.react-flow__edge:hover`      | stroke: 4px, 파란 glow       |
| `.react-flow__node.selected`   | 파란 glow 효과               |
| `.react-flow__handle:hover`    | scale(1.3), 파란 glow        |
| `.react-flow__connection-path` | 핑크, 3px, 대시 애니메이션   |

---

> **문서 생성일**: 2026-02-19
> **기준 소스**: WBS Master (Next.js 16 + Tailwind CSS 4)
> **역분석 대상 파일**:
>
> - `src/app/globals.css`
> - `src/app/layout.tsx`
> - `src/app/dashboard/layout.tsx`
> - `src/components/ui/*` (Button, Input, Icon, Card, Modal, Toast)
> - `src/components/layout/*` (DashboardLayout, DashboardSidebar, DashboardHeader)
> - `src/components/common/*` (FloatingMenu, ImportExcelModal)
