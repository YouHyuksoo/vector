# VRL & 매핑 통합 페이지 설계

## 개요

기존 `/dashboard/simulator`(VRL 시뮬레이터)와 `/dashboard/mapping`(타겟 매핑) 페이지를 하나의 통합 페이지 `/dashboard/vrl-mapping`으로 합친다. 작업 순서가 VRL → 매핑이고, 설비 목록을 공유하며, VRL 페이지의 AI 생성 영역이 공간을 많이 차지하는 문제를 해결한다.

## 레이아웃

```
┌──────────┬──────────────────────────────────────────┐
│          │  [VRL 탭]  [매핑 탭]                      │
│ 설비목록  │ ┌──────────────────────────────────────┐ │
│          │ │                                      │ │
│ ── 미완료 │ │   선택된 탭의 컨텐츠                   │ │
│  ○ AOI   │ │                                      │ │
│  ○ SPI   │ │                                      │ │
│          │ │                                      │ │
│ ── 완료  │ │                                      │ │
│  ● REFLOW│ │                                      │ │
│  ● ICT   │ │                                      │ │
│          │ └──────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────┘
```

### 왼쪽 사이드 패널 (~200px)
- `usePipelineStatus` 훅으로 설비 목록 + 파이프라인 상태 조회
- **미완료 그룹**: vrl/table/mapping 단계 중 하나라도 미완료인 설비
- **완료 그룹**: 모든 단계 완료된 설비
- 설비 선택 시 VRL 탭, 매핑 탭 모두 해당 설비 컨텍스트로 전환
- 각 설비 옆에 완료 단계 수 표시 (예: 3/5)

### 오른쪽 메인 영역
- 탭 전환: VRL / 매핑
- 탭 상태는 URL query 또는 로컬 state로 관리

## VRL 탭 구조

### AI VRL 생성 (접이식, 기본 접힘)
- 접힌 상태: "▶ AI VRL 생성" 한 줄만 표시
- 펼친 상태: 모델 선택 + 로그 구조 + 시스템 프롬프트 + 프롬프트 입력 + 생성 버튼
- 한 줄 레이아웃으로 공간 최소화

### 샘플 로그 + VRL 코드 (좌우 분할)
- 왼쪽: 샘플 로그 입력 (텍스트 + 파일 업로드/드래그앤드롭)
- 오른쪽: VRL 코드 에디터
- 기존 기능 유지: 인코딩 자동 감지, 파일 형식 제한

### 시뮬레이션 실행
- [시뮬레이션 실행] 버튼
- 결과는 아래에 표시 (결과 있을 때만 — 빈 공간 방지)
- 파싱된 필드명 + 값 테이블

### VRL 적용
- [VRL 적용] 버튼 → aggregator TOML 업데이트 + DB 필드 동기화
- 적용 완료 시 토스트로 "매핑 탭으로 이동하시겠습니까?" 안내
- Vector 재시작 모달은 기존과 동일

## 매핑 탭 구조

기존 매핑 페이지 컴포넌트를 재사용하되, 상단의 LogTypeSelector/PipelineStatus 제거 (사이드 패널에서 설비 선택이 이미 됨).

- TABLE/PROCEDURE 모드 전환 유지
- SelectionPanel (테이블/프로시저 목록) 재사용
- MappingTable / ProcedureMapping 재사용
- AutoCreateModal 재사용
- ParseRuleEditor 재사용
- useTableMapping / useProcedureMapping 훅 재사용

## 컴포넌트 분리 (VrlSimulator 649줄 → 분리)

### 새로 생성
| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `page.tsx` | ~120 | 레이아웃 + 탭 전환 + 설비 사이드패널 통합 |
| `EquipmentSidePanel.tsx` | ~120 | 설비 목록 (완료/미완료 그룹, 진행률 표시) |
| `AiVrlGenerator.tsx` | ~150 | AI 생성 접이식 영역 (모델, 로그구조, 프롬프트) |
| `VrlEditor.tsx` | ~250 | 샘플로그 입력 + VRL 코드 편집 + 시뮬레이션 실행 |
| `VrlResultPanel.tsx` | ~100 | 파싱 결과 테이블 표시 |

### 재사용 (mapping에서 import)
- `MappingTable.tsx` (134줄)
- `ProcedureMapping.tsx` (161줄)
- `SelectionPanel.tsx` (123줄)
- `AutoCreateModal.tsx` (314줄)
- `ParseRuleEditor.tsx` (191줄)
- `useTableMapping.ts` (142줄)
- `useProcedureMapping.ts` (146줄)
- `types.ts` (88줄)
- `mapping-utils.ts` (209줄)

## 사이드바 변경

- "Simulator" 메뉴 제거
- "Target Mapping" 메뉴 제거
- "VRL & 매핑" 메뉴 추가 (`/dashboard/vrl-mapping`, swap_horiz 아이콘)
- 기존 `/dashboard/simulator`, `/dashboard/mapping` 페이지는 코드 유지 (직접 접근 가능하되 메뉴에서 숨김)

## 백엔드 변경

없음. 기존 API 엔드포인트 그대로 사용.

## 파일 구조

```
frontend/src/app/dashboard/vrl-mapping/
├── page.tsx
└── components/
    ├── EquipmentSidePanel.tsx
    ├── AiVrlGenerator.tsx
    ├── VrlEditor.tsx
    └── VrlResultPanel.tsx
```
