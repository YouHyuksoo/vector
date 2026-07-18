---
sources:
  - src/
  - frontend/src/app/dashboard/
  - vector-config/
  - config/table-registry.json
verifiedCommit: e736824
---

# Vector Log Collection System — Current PRD

최종 검증: 2026-07-18

## 1. 목적

다양한 제조 설비의 파일 로그를 중앙에서 수집·파싱하여 Oracle의 설비별 테이블 또는 프로시저에 안정적으로 적재하고, 운영자가 웹 화면에서 설정·상태·원본·오류·재처리를 관리한다.

## 2. 핵심 사용자

- 설비/자동화 담당자: Agent 설치, 로그 경로와 설비 정보 설정
- MES/인터페이스 개발자: VRL 파싱과 Oracle 매핑 관리
- 운영자: 상태 진단, 오류 분석, 재처리와 배포

## 3. 현재 기술 구성

| 영역 | 기술 | 역할 |
|---|---|---|
| 설비 수집 | Vector Agent, Fluent Bit | 파일 tail, 메타데이터, 전송 buffer |
| 중앙 수신 | Vector Aggregator + VRL | TCP 수신, 설비별 파싱, HTTP disk buffer |
| Backend | Node.js 24, Fastify 5, TypeScript | 검증, raw 저장, 직접 Oracle 처리, 운영 API |
| DB | OracleDB Thin mode | LOG_* INSERT와 프로시저 실행 |
| 상태/이력 | 메모리 Map + JSON/JSONL | 하트비트, 설비 레지스트리, 처리 로그 |
| Frontend | Next.js 16, React 19 | 운영 대시보드와 설정 UI |
| 배포 | GitHub Actions, Windows self-hosted runner, PM2 | main 자동 배포와 프로세스 관리 |

Redis/BullMQ는 현재 제품 구성요소가 아니다.

## 4. 기능 요구사항

### FR-1. 로그 수집

- Vector Agent와 Fluent Bit을 지원한다.
- 파일 포함/제외 glob, read position, fingerprint, multiline과 재전송 폴더를 설정할 수 있어야 한다.
- Agent와 Aggregator는 네트워크 장애 시 disk buffer로 미전송 데이터를 보존해야 한다.

### FR-2. 파싱과 라우팅

- `equipment_type`별 VRL로 CSV, 고정 길이, 키-값, 다중행 로그를 파싱한다.
- 대상은 TABLE 또는 PROCEDURE 중 선택할 수 있어야 한다.
- 샘플 로그 시뮬레이션을 통과한 VRL만 운영 TOML에 반영할 수 있어야 한다.

### FR-3. Oracle 적재

- `config/table-registry.json`을 컬럼·파라미터 매핑의 단일 소스로 사용한다.
- 단건과 `data.ROWS` 다중행 데이터를 지원한다.
- `LOG_ICT`, `LOG_ISCM_ICT`, `LOG_PRESSFIT`은 BARCODE 단위 최신 데이터 교체와 bulk INSERT를 지원한다.
- 전체 DB 동시성은 Oracle pool 한도 안에서 제한한다.

### FR-4. 원본과 처리 이력

- raw 원문을 설비 유형/ID/날짜/파일명 구조로 저장한다.
- 정상과 오류를 stage 기반 JSONL로 기록하고 30일 보존한다.
- `RAW_DATA`가 있는 오류는 선택 또는 전체 재처리할 수 있어야 한다.

### FR-5. 설비 상태

- Agent Manager heartbeat로 online/offline을 판단한다.
- 상태 snapshot과 설비 레지스트리를 디스크에 보존한다.
- 수집 제외 설비는 raw와 이력은 유지하고 DB 적재만 중지한다.

### FR-6. 운영 UI

- 대시보드, 장비, 송신기, 수신기, VRL/매핑, 원본 파일, 시스템 로그, 진단, 업로드, 다운로드, 설정과 도움말을 제공한다.
- 운영 진단에서 Vector buffer, 메모리, source/sink 처리량, Oracle pool, 적재량과 지연을 함께 보여준다.
- 한국어, 영어, 스페인어 UI와 도움말을 제공한다.

### FR-7. 배포와 복구

- main push 또는 수동 실행으로 Windows 운영 서버에 배포한다.
- `.env`, 운영 데이터, 로컬 레지스트리와 Aggregator 운영 설정을 배포 동기화에서 보호한다.
- PM2는 Backend 3110과 Frontend 3100을 관리한다.
- Backend가 Vector Aggregator를 단일 소유자로 시작·종료해야 한다.

## 5. 비기능 요구사항

- 동일 raw 파일의 동시 write가 섞이지 않아야 한다.
- API/DB 지연 때 이벤트를 유실하지 않고 backpressure를 적용해야 한다.
- Oracle 장애 중에도 원본과 오류 이력을 남겨야 한다.
- 운영 설정 변경 전 백업을 생성하고 복구할 수 있어야 한다.
- 비밀번호는 API/UI에서 마스킹해야 한다.
- 모든 경로 입력은 raw 저장 루트 밖으로 탈출할 수 없어야 한다.

## 6. 핵심 API

| Method | Path | 목적 |
|---|---|---|
| POST | `/api/logs` | 파싱 로그 수신과 직접 적재 |
| POST | `/api/heartbeat` | Agent Manager 상태 갱신 |
| GET | `/api/monitor/overview` | 대시보드 상태 |
| GET | `/api/monitor/pipeline-status` | 설비별 구성 진행률 |
| GET/PUT | `/api/monitor/aggregator/config` | 수신기 TOML 관리 |
| GET/PUT/POST/DELETE | `/api/monitor/agent/config*` | Vector Agent 설정 관리 |
| GET/PUT/POST/DELETE | `/api/monitor/agent-fluent/config*` | Fluent Bit 설정 관리 |
| GET/POST | `/api/monitor/vrl/*` | VRL 조회·검증·시뮬레이션·적용 |
| GET/POST | `/api/monitor/tables/oracle*` | Oracle 테이블 조회·생성 |
| GET/POST/DELETE | `/api/monitor/procedures*` | 프로시저 매핑 |
| GET | `/api/monitor/logs`, `/errors` | 처리 로그 조회 |
| POST | `/api/monitor/retry`, `/retry/all` | 오류 재처리 |
| GET/DELETE | `/api/monitor/log-files*` | raw 파일 관리 |
| GET | `/api/diagnose/health` | 종합 운영 진단 |

## 7. 검증 기준

1. Agent 샘플 파일이 Aggregator source에 수신된다.
2. VRL 시뮬레이션 결과가 기대 필드와 타겟을 생성한다.
3. `/api/logs`가 raw와 JSONL 이력을 남기고 Oracle 결과를 만든다.
4. 다중행 설비의 row 수와 BARCODE 교체 결과가 일치한다.
5. 오류 후 재처리가 성공하고 SUCCESS 이력을 남긴다.
6. Backend/Oracle 지연 시 Vector disk buffer가 증가하고 복구 후 감소한다.
7. 장비 heartbeat, 수집 제외와 재등록 동작이 UI에 반영된다.
8. Backend/Frontend 빌드와 핵심 테스트가 통과한다.
