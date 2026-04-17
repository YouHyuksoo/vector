# AOI 로그 뷰어 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 프로그램이 URL로 `line`, `date`, `file` 파라미터를 넘겨 호출하면 AOI 로그 파일 하나를 CSV 표로 보여주는 경량 뷰어 페이지를 만든다.

**Architecture:** Next.js App Router 최상위에 `/log-viewer` 라우트 추가 (대시보드 레이아웃 밖). 기존 `log-files/page.tsx`에 인라인된 CSV 파싱 함수와 테이블 컴포넌트를 공용 모듈로 추출해 신규 페이지와 함께 재사용한다. 백엔드는 기존 `/api/monitor/log-files/read`를 그대로 사용.

**Tech Stack:** Next.js 15 (App Router, 클라이언트 컴포넌트), TypeScript, Tailwind, 기존 `apiFetch` 래퍼

**Spec:** `docs/superpowers/specs/2026-04-16-aoi-log-viewer-design.md`

**테스트 전략:** 이 프로젝트에는 프론트엔드 유닛테스트 인프라가 없으므로 `npx tsc --noEmit`(타입체크)과 브라우저 수동 검증으로 각 단계를 확인한다. 백엔드 회귀 영향 없음.

---

## 파일 구조

### 신규
- `frontend/src/lib/csv-viewer.ts` — CSV 파싱 순수 함수 및 타입
- `frontend/src/components/CsvSectionTable.tsx` — CSV 섹션 테이블 / 일반 CSV 테이블 렌더링 컴포넌트
- `frontend/src/app/log-viewer/page.tsx` — AOI 로그 뷰어 페이지

### 수정
- `frontend/src/app/dashboard/log-files/page.tsx`
  - L48~L112: `parseCsvLine` / `isSectionLabel` / `parseSectionedCsv` / `interface CsvSection` 제거
  - L115~L224: `CsvSectionTable` / `CsvTableView` 컴포넌트 제거
  - 상단 import에 `@/lib/csv-viewer`와 `@/components/CsvSectionTable` 추가

### 백엔드: 변경 없음

---

## Task 1: CSV 파싱 함수/타입을 `lib/csv-viewer.ts`로 추출

**Files:**
- Create: `frontend/src/lib/csv-viewer.ts`

- [ ] **Step 1: 새 모듈 파일 작성**

Create `frontend/src/lib/csv-viewer.ts`:

```typescript
/**
 * @file src/lib/csv-viewer.ts
 * @description CSV 로그 파일 파싱 유틸리티 — 섹션 라벨이 섞인 복합 CSV와 단일 CSV를 모두 처리
 *
 * 초보자 가이드:
 * 1. **parseCsvLine**: 한 줄을 콤마로 분리 (따옴표 이스케이프 처리)
 * 2. **isSectionLabel**: 콤마 없는 단독 영문 라벨이면 섹션 헤더로 간주 (예: "BoardInfo")
 * 3. **parseSectionedCsv**: 섹션 라벨로 블록을 구분해 header/data로 분해.
 *    섹션이 하나도 없으면 null 반환 → 호출 측에서 단일 CSV로 fallback 처리
 */

export interface CsvSection {
  label: string;
  header: string[];
  data: string[][];
}

/** CSV 한 줄을 파싱 (따옴표 처리 포함) */
export function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

/** 섹션 라벨 판별 — 콤마 없는 단독 영문 라벨 */
export function isSectionLabel(parsed: string[]): boolean {
  return parsed.length === 1 && /^[A-Za-z][A-Za-z0-9_ ]*$/.test(parsed[0]);
}

/** 섹션 구분이 있는 CSV 파싱 — 섹션이 하나도 없으면 null 반환 */
export function parseSectionedCsv(lines: string[]): CsvSection[] | null {
  const sections: CsvSection[] = [];
  let i = 0;

  // ── 1) 섹션 라벨 이전에 나타나는 CSV 줄들을 별도 섹션으로 수집 ──
  //    (예: SPI_VD 파일의 MasterBarcode 헤더/데이터 행)
  const preLines: string[] = [];
  while (i < lines.length) {
    const parsed = parseCsvLine(lines[i]);
    if (isSectionLabel(parsed)) break;
    preLines.push(lines[i]);
    i++;
  }
  if (preLines.length >= 2) {
    sections.push({
      label: '',
      header: parseCsvLine(preLines[0]),
      data: preLines.slice(1).map(parseCsvLine),
    });
  }

  // ── 2) 섹션 라벨 블록 파싱 ──
  while (i < lines.length) {
    const parsed = parseCsvLine(lines[i]);
    if (isSectionLabel(parsed)) {
      const label = parsed[0];
      i++;
      if (i >= lines.length) break;
      const header = parseCsvLine(lines[i]);
      i++;
      const data: string[][] = [];
      while (i < lines.length) {
        const next = parseCsvLine(lines[i]);
        if (isSectionLabel(next)) break;
        data.push(next);
        i++;
      }
      sections.push({ label, header, data });
    } else {
      i++;
    }
  }
  return sections.length >= 1 ? sections : null;
}
```

- [ ] **Step 2: 타입체크**

Run:
```bash
cd frontend && npx tsc --noEmit
```
Expected: 에러 없음 (신규 파일이라 경고만 나올 수 있음)

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/lib/csv-viewer.ts
git commit -m "refactor: CSV 파싱 함수를 lib/csv-viewer로 추출"
```

---

## Task 2: CSV 테이블 컴포넌트를 `components/CsvSectionTable.tsx`로 추출

**Files:**
- Create: `frontend/src/components/CsvSectionTable.tsx`

- [ ] **Step 1: 컴포넌트 파일 작성**

Create `frontend/src/components/CsvSectionTable.tsx`:

```tsx
/**
 * @file src/components/CsvSectionTable.tsx
 * @description CSV 섹션/일반 CSV 테이블 렌더링 컴포넌트 — 로그 뷰어 공용
 *
 * 초보자 가이드:
 * 1. **CsvTableView**: 문자열 content를 받아 섹션 CSV로 해석되면 섹션별 테이블,
 *    아니면 첫 줄을 헤더로 두는 단일 테이블을 그린다.
 * 2. **CsvSectionTable**: 단일 섹션 렌더 (`CsvTableView` 내부에서 섹션별로 호출)
 */
'use client';

import { Card } from '@/components/ui';
import { parseCsvLine, parseSectionedCsv, type CsvSection } from '@/lib/csv-viewer';

export function CsvSectionTable({ section }: { section: CsvSection }) {
  return (
    <div className="mb-4">
      {section.label && (
        <div className="px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 dark:bg-primary/20 rounded-t">
          {section.label}
        </div>
      )}
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="bg-surface dark:bg-surface-dark border-b border-border dark:border-border-dark">
            <th className="px-3 py-2 text-left text-muted-foreground font-bold w-10">#</th>
            {section.header.map((col, i) => (
              <th key={i} className="px-3 py-2 text-left font-bold text-text dark:text-white whitespace-nowrap
                border-l border-border/30 dark:border-border-dark/30">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.data.map((row, ri) => (
            <tr key={ri} className="border-b border-border/20 dark:border-border-dark/20
              hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors">
              <td className="px-3 py-1.5 text-muted-foreground">{ri + 1}</td>
              {section.header.map((_, ci) => (
                <td key={ci} className="px-3 py-1.5 text-text dark:text-white whitespace-nowrap
                  border-l border-border/20 dark:border-border-dark/20">
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
          {section.data.length === 0 && (
            <tr>
              <td colSpan={section.header.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                No data rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CsvTableView({ content }: { content: string }) {
  if (!content.trim()) return null;
  const lines = content.split('\n').filter(l => l.trim());

  const sections = parseSectionedCsv(lines);
  if (sections) {
    return (
      <Card noPadding className="flex-1 overflow-hidden min-h-0">
        <div className="overflow-auto h-full p-2">
          {sections.map((sec, i) => (
            <CsvSectionTable key={i} section={sec} />
          ))}
        </div>
      </Card>
    );
  }

  // 일반 CSV — 첫 줄 헤더, 나머지 데이터
  const rows = lines.map(parseCsvLine);
  const header = rows[0] ?? [];
  const data = rows.slice(1);

  return (
    <Card noPadding className="flex-1 overflow-hidden min-h-0">
      <div className="overflow-auto h-full">
        <table className="w-full text-xs font-mono border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface dark:bg-surface-dark border-b border-border dark:border-border-dark">
              <th className="px-3 py-2 text-left text-muted-foreground font-bold w-10">#</th>
              {header.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left font-bold text-text dark:text-white whitespace-nowrap
                  border-l border-border/30 dark:border-border-dark/30">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="border-b border-border/20 dark:border-border-dark/20
                hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors">
                <td className="px-3 py-1.5 text-muted-foreground">{ri + 1}</td>
                {header.map((_, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-text dark:text-white whitespace-nowrap
                    border-l border-border/20 dark:border-border-dark/20">
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={header.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                  No data rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 타입체크**

Run:
```bash
cd frontend && npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/CsvSectionTable.tsx
git commit -m "refactor: CSV 테이블 컴포넌트를 공용 컴포넌트로 추출"
```

---

## Task 3: `log-files/page.tsx` 리팩토링 (기존 인라인 함수/컴포넌트 제거 + import 교체)

**Files:**
- Modify: `frontend/src/app/dashboard/log-files/page.tsx:46-224`

- [ ] **Step 1: 상단 import 추가**

`frontend/src/app/dashboard/log-files/page.tsx`의 기존 import 블록(대략 L12~L16) 뒤에 추가:

```typescript
import { CsvTableView } from '@/components/CsvSectionTable';
```

(`parseCsvLine` 등 순수 함수는 이 파일에서 직접 호출하지 않으므로 lib 재export만 필요 시 import)

- [ ] **Step 2: 인라인 정의 제거**

`frontend/src/app/dashboard/log-files/page.tsx`에서 다음 범위를 모두 **삭제**한다:

- L46 주석 `/** CSV 내용을 테이블로 렌더링 */` 포함 L47 주석까지
- `function parseCsvLine` 정의 (현재 L48~L59)
- `interface CsvSection` (현재 L62)
- 주석 `/** 섹션 라벨 판별 */` (현재 L64)
- `function isSectionLabel` (현재 L65~L67)
- `function parseSectionedCsv` (현재 L69~L113)
- `function CsvSectionTable` (현재 L115~L159)
- `function CsvTableView` (현재 L161~L224)

**주의:** `formatSize` 함수(L40~L44)는 유지. `extractEquipInfo` 함수(L18~L25)도 유지.

삭제 후 `formatSize` 함수 바로 다음 줄이 `export default function LogFilesPage()`가 되어야 한다.

- [ ] **Step 3: 타입체크로 참조 누락 확인**

Run:
```bash
cd frontend && npx tsc --noEmit
```
Expected: 에러 없음. 만약 `CsvTableView is not defined` 류 에러가 나면 Step 1 import가 빠진 것이므로 추가.

- [ ] **Step 4: 프론트 빌드로 최종 확인**

Run:
```bash
cd frontend && npx next build
```
Expected: 빌드 성공 (경고는 무시)

- [ ] **Step 5: dev 서버에서 회귀 검증 (수동)**

Run:
```bash
cd frontend && npm run dev
```
브라우저에서 `http://localhost:3000/dashboard/log-files` 접속 후 확인:
- 좌측 트리에서 AOI/라인/날짜로 내려가 파일 선택
- 우측에 CSV 섹션 테이블이 이전과 동일하게 렌더되는지 확인
- 검색 입력, 일괄 삭제, 수동 투입 모달 등 다른 기능이 깨지지 않았는지 스폿 체크

Expected: 이전과 완전히 동일한 동작

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/app/dashboard/log-files/page.tsx
git commit -m "refactor: log-files 페이지의 CSV 파서/컴포넌트를 공용 모듈로 교체"
```

---

## Task 4: `/log-viewer` 뷰어 페이지 생성

**Files:**
- Create: `frontend/src/app/log-viewer/page.tsx`

- [ ] **Step 1: 페이지 파일 작성**

Create `frontend/src/app/log-viewer/page.tsx`:

```tsx
/**
 * @file src/app/log-viewer/page.tsx
 * @description AOI 로그 파일 뷰어 — 외부 프로그램이 URL로 호출해 단일 파일만 표시
 *
 * 초보자 가이드:
 * 1. 쿼리 파라미터: line(라인코드), date(날짜 폴더명), file(파일명). 셋 다 필수.
 * 2. 백엔드 경로 조립: AOI/{line}/{date}/{file} → /api/monitor/log-files/read?path=...
 * 3. 대시보드 레이아웃(헤더/사이드바) 밖의 최상위 라우트이므로 화면 전체를 차지.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { CsvTableView } from '@/components/CsvSectionTable';

interface FileContent {
  path: string;
  content: string;
  total: number;
  filtered: number;
}

export default function LogViewerPage() {
  const params = useSearchParams();
  const line = params.get('line') ?? '';
  const date = params.get('date') ?? '';
  const file = params.get('file') ?? '';

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FileContent | null>(null);

  const missing: string[] = [];
  if (!line) missing.push('line');
  if (!date) missing.push('date');
  if (!file) missing.push('file');

  const relPath = `AOI/${line}/${date}/${file}`;

  const load = useCallback(async () => {
    if (missing.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ path: relPath });
      if (search) qs.set('search', search);
      const res = await apiFetch<FileContent>(`/api/monitor/log-files/read?${qs.toString()}`);
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('File not found')) {
        setError(`파일을 찾을 수 없습니다: ${relPath}`);
      } else {
        setError(`파일을 읽을 수 없습니다: ${msg}`);
      }
      setData(null);
    }
    setLoading(false);
  }, [relPath, search, missing.length]);

  useEffect(() => { load(); }, [load]);

  // ── 파라미터 누락 ──
  if (missing.length > 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="text-center">
          <div className="text-lg font-bold text-red-600 mb-2">필수 파라미터 누락</div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            다음 파라미터가 필요합니다: <code>{missing.join(', ')}</code>
          </div>
          <div className="text-xs text-gray-400 mt-2">
            예) /log-viewer?line=AOI-001&amp;date=2026-04-16&amp;file=AOI_20260416.csv
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="text-sm font-mono text-gray-700 dark:text-gray-200 truncate">
          <span className="text-gray-400">AOI / </span>
          <span className="font-bold">{line}</span>
          <span className="text-gray-400"> / </span>
          <span>{date}</span>
          <span className="text-gray-400"> / </span>
          <span className="font-bold">{file}</span>
        </div>
        <button
          onClick={load}
          className="text-xs px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          disabled={loading}
        >
          {loading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>

      {/* 검색바 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="검색어 입력 (엔터)"
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          className="flex-1 px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800"
        />
        {data && (
          <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            표시 {data.filtered}/{data.total} 줄
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-hidden min-h-0 p-2">
        {loading && (
          <div className="h-full flex items-center justify-center text-gray-500">
            로그 파일 불러오는 중...
          </div>
        )}
        {!loading && error && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="text-red-600 text-sm">{error}</div>
            <button
              onClick={load}
              className="text-xs px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              재시도
            </button>
          </div>
        )}
        {!loading && !error && data && (
          <CsvTableView content={data.content} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run:
```bash
cd frontend && npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 3: 프론트 빌드**

Run:
```bash
cd frontend && npx next build
```
Expected: 빌드 성공, 새 라우트 `/log-viewer`가 출력 라인에 나타남

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/app/log-viewer/page.tsx
git commit -m "feat: AOI 로그 뷰어 페이지 추가 — 외부 URL 호출용 경량 뷰어"
```

---

## Task 5: 브라우저 수동 테스트 (5개 시나리오)

이 태스크는 새 코드를 작성하지 않는다. 실제 동작을 검증한다.

**Files:** 없음

**선행 조건:**
- dev 서버 실행 중 (`cd frontend && npm run dev`)
- 백엔드도 실행 중 (`npm run dev` 혹은 PM2)
- `C:\data\raw-logs\AOI\{라인코드}\{날짜}\{파일}` 경로에 실제 파일이 하나 이상 존재

실존 파일을 확인하려면:
```bash
ls "C:/data/raw-logs/AOI" 2>/dev/null | head
```
(결과가 비어 있으면 AOI 파일이 아직 없다는 뜻 → 오빠에게 테스트 가능한 실제 파일 경로를 확인)

- [ ] **시나리오 1: 정상 호출**

브라우저에서 실존 파일의 line/date/file로 접속:
```
http://localhost:3000/log-viewer?line={실제라인}&date={실제날짜}&file={실제파일명}
```
Expected:
- 헤더에 AOI / {line} / {date} / {file} 표시
- CSV 섹션 테이블 렌더링됨
- 우측 상단에 "표시 N/N 줄" 표시

- [ ] **시나리오 2: 파라미터 누락**

접속:
```
http://localhost:3000/log-viewer?line=AOI-001
```
Expected: "필수 파라미터 누락" 안내 + `date, file` 표시 + 예시 URL 안내

- [ ] **시나리오 3: 존재하지 않는 파일**

접속:
```
http://localhost:3000/log-viewer?line=AOI-001&date=2026-04-16&file=does-not-exist.csv
```
Expected: "파일을 찾을 수 없습니다: AOI/AOI-001/2026-04-16/does-not-exist.csv" 메시지 + [재시도] 버튼

- [ ] **시나리오 4: 검색 필터링**

시나리오 1 성공 후 검색창에 파일 내 존재하는 키워드 입력 후 엔터.
Expected:
- "표시 M/N 줄"에서 M이 N보다 작아짐
- 테이블에는 키워드 포함 줄만 남음

빈 검색어로 다시 엔터 → 전체 줄 복원

- [ ] **시나리오 5: 회귀 — 기존 log-files 페이지**

접속:
```
http://localhost:3000/dashboard/log-files
```
Expected:
- 좌측 트리 정상 표시
- AOI 파일 하나 선택 시 우측에 이전과 동일한 CSV 섹션 테이블 렌더
- 검색/일괄 삭제/수동 투입 모달 동작 이상 없음

- [ ] **커밋 (테스트 결과 요약)**

모든 시나리오 통과 시 별도 커밋 불필요. 한두 개 실패 시 원인 수정 후 해당 태스크로 돌아가서 패치 후 커밋.

---

## Self-Review 체크리스트 (구현자 본인용)

- [ ] 백엔드 수정 없는지 확인 (`git diff --name-only main..` 에 `src/server/` 변경 없어야 함)
- [ ] `lib/csv-viewer.ts`의 export된 함수 시그니처가 Task 2/3/4에서 호출하는 방식과 동일한가
- [ ] `/log-viewer` 경로가 `/dashboard` 레이아웃을 상속하지 않는지 (dev 서버에서 헤더/사이드바가 없어야 함)
- [ ] 새 페이지가 브라우저 뒤로 가기/새로고침 시에도 동작하는지
- [ ] i18n 키 추가는 하지 않음 (단순 안내 문구는 하드코딩 OK — 스펙 범위에 맞춤)

## 비범위 (YAGNI — 구현하지 말 것)

- 다운로드 버튼
- 페이지네이션
- 다른 설비 타입 지원 (AOI 외)
- 인증/토큰
- 유닛테스트 파일 추가 (프로젝트 컨벤션상 수동 검증 유지)
