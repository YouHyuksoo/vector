# AOI 로그 뷰어 페이지 설계

**작성일:** 2026-04-16
**상태:** 설계 승인됨 (오빠)

## 배경

외부 프로그램에서 URL로 호출했을 때, AOI 로그 파일 하나를 바로 보여주는 경량 뷰어 페이지가 필요하다. 기존 `/dashboard/log-files` 페이지는 폴더 트리 탐색기 + 수동 투입 기능까지 포함된 복합 화면이라 외부 팝업/iframe 용도로는 부적합하다.

## 요구사항

- 외부 프로그램이 **라인코드 · 날짜 · 파일명** 세 개를 쿼리 파라미터로 넘겨 호출
- AOI 전용 (다른 설비 확장 고려 없음)
- 대시보드 레이아웃(헤더/사이드바) 없이 뷰어 본문만 전체 화면
- CSV 섹션별 표 렌더링 (기존 log-files의 파서 재사용)
- 줄 단위 키워드 검색
- 인증 없음 (내부망)

## URL 스펙

```
GET /log-viewer?line={라인코드}&date={날짜}&file={파일명}
```

| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `line`  | ✅ | AOI 하위 라인코드 폴더명 | `AOI-001` |
| `date`  | ✅ | 날짜 폴더명 | `2026-04-16` |
| `file`  | ✅ | 파일명 (확장자 포함) | `AOI_20260416.csv` |

**실제 파일 경로 조립:** `{RAW_LOG_BASE_PATH}\AOI\{line}\{date}\{file}`

**예시 호출:**
```
http://20.10.30.112:3100/log-viewer?line=AOI-001&date=2026-04-16&file=AOI_20260416.csv
```

## 아키텍처

### 신규 파일

1. **`frontend/src/app/log-viewer/page.tsx`** (약 150줄)
   - Next.js App Router 최상위 라우트 → `/dashboard` 레이아웃 영향 안 받음
   - `useSearchParams`로 `line`/`date`/`file` 읽기
   - 백엔드 API 호출 및 상태 관리
   - 상단 헤더, 검색바, CSV 테이블 렌더

2. **`frontend/src/lib/csv-viewer.ts`**
   - 기존 `log-files/page.tsx`에 인라인된 CSV 파싱 순수 함수를 모듈로 추출
   - export: `parseCsvLine`, `isSectionLabel`, `parseSectionedCsv`, 타입 `CsvSection`

### 수정 파일

- **`frontend/src/app/dashboard/log-files/page.tsx`**
  - CSV 파싱 함수들 제거 → `@/lib/csv-viewer` import로 교체
  - 기능 동일, 파일 줄수 감소

### 백엔드

**변경 없음.** 기존 `GET /api/monitor/log-files/read?path=&search=`를 그대로 사용한다.
프론트에서 `path=AOI/{line}/{date}/{file}` 형태로 조립해 전달.
기존 API가 이미 처리하는 것:
- `..` 경로 조작 차단
- `RAW_LOG_BASE_PATH` 외부 접근 차단
- 404 / 500 응답
- 설비별 인코딩 자동 적용 (descriptions.json)

## 화면 구성

```
┌──────────────────────────────────────────────────┐
│ AOI-001 / 2026-04-16 / AOI_20260416.csv   [🔄]   │
├──────────────────────────────────────────────────┤
│ [🔍 검색어 입력]   표시 3/120 줄                 │
├──────────────────────────────────────────────────┤
│                                                  │
│   (섹션별 CSV 테이블)                            │
│                                                  │
└──────────────────────────────────────────────────┘
```

- **헤더:** 현재 파일의 전체 경로(line/date/file)와 새로고침 버튼
- **검색바:** 키워드 입력 → 서버 재호출(`&search=kw`) → 매칭 줄만 반환
- **본문:** `parseSectionedCsv` 결과를 섹션별 `<table>`로 렌더. 파서가 `null` 반환 시 원본 텍스트 `<pre>` fallback

## 데이터 흐름

```
1. 페이지 마운트 → useSearchParams로 line/date/file 읽기
2. 세 개 중 하나라도 없으면 → "필수 파라미터 누락" 화면 (fetch 안 함)
3. fetch: /api/monitor/log-files/read?path=AOI/{line}/{date}/{file}&search={q}
4. 응답 content → parseSectionedCsv로 섹션 분리 → 테이블 렌더
5. 검색어 변경 → 3번부터 재실행
```

## 에러 처리

| 상황 | 표시 | 비고 |
|------|------|------|
| 파라미터 누락 | "line, date, file 파라미터가 필요합니다" | fetch 전 조기 반환 |
| 404 (파일 없음) | "파일을 찾을 수 없습니다: AOI/{line}/{date}/{file}" | 전체 경로 노출 (내부망) |
| 500 / 네트워크 | "파일을 읽을 수 없습니다" + [재시도] 버튼 | |
| CSV 파싱 실패 | 원본 텍스트 `<pre>`로 fallback | `parseSectionedCsv`가 `null` 반환 시 |

**로딩:** 스피너 + "로그 파일 불러오는 중..." 중앙 표시

## 테스트 시나리오

1. **정상 호출:** 실존하는 line/date/file로 호출 → 표 렌더 확인
2. **파라미터 누락:** `?line=AOI-001` 하나만으로 호출 → 에러 메시지
3. **존재하지 않는 파일:** 잘못된 파일명 → 404 안내 화면
4. **검색:** 검색어 입력 후 줄 필터링 동작 확인
5. **리팩토링 회귀:** 기존 `/dashboard/log-files` 페이지가 여전히 동일하게 동작하는지 확인

## 비범위 (YAGNI)

- 인증/토큰 (내부망, 기존 API도 무인증)
- 파일 다운로드 버튼
- 다른 설비 타입 지원 (AOI 고정)
- 페이지네이션 (기존 API가 파일 전체 반환하므로 그대로 사용)

## 리스크 및 완화

| 리스크 | 완화 |
|--------|------|
| `log-files/page.tsx` 리팩토링으로 기존 기능 회귀 | 테스트 시나리오 5번 필수 |
| AOI 파일명에 URL-unsafe 문자 포함 가능 | 프론트에서 `encodeURIComponent` 처리 |
| 매우 큰 CSV 파일로 인한 브라우저 부담 | 현 단계에서는 기존 API와 동일하게 전체 로드. 실측 후 필요시 한도 추가 |
