# Vector Log Collection System
<!-- 최종 갱신: 2026-07-18 / verifiedCommit: e736824 -->

## 프로젝트 개요

제조 설비의 파일 로그를 Vector Agent 또는 Fluent Bit으로 수집하고, 중앙 Vector Aggregator의 VRL로 파싱하여 Fastify API가 Oracle에 직접 적재하는 시스템이다.

```text
설비 파일
  → Vector Agent :6000 또는 Fluent Bit :24224
  → Vector Aggregator VRL
  → HTTP sink disk buffer
  → POST :3110/api/logs
  → raw 저장 + JSONL 처리 로그 + Oracle 직접 적재
```

현재 런타임에는 Redis/BullMQ와 별도 DB worker가 없다.

## 서버 정보

- 운영 서버: `20.10.30.112` (SSH: `administrator / 1234`)
- 서버 프로젝트 경로: `C:\Project\vector`
- Backend: Fastify + TypeScript, port `3110`
- Frontend: Next.js, port `3100`
- 배포: `main` push 또는 수동 GitHub Actions → Windows self-hosted runner → PM2

## 소스 오브 트루스

| 영역 | 파일 |
|---|---|
| 앱 시작/종료 | `src/index.ts`, `src/utils/graceful-shutdown.ts` |
| 로그 수신 | `src/server/routes/log-ingest.route.ts` |
| Oracle 처리 | `src/services/log-ingest.service.ts`, `src/database/dynamic-insert.ts` |
| Oracle pool | `src/database/oracle.pool.ts` |
| 운영 API | `src/server/routes/monitor.route.ts`, `src/server/routes/diagnose.route.ts` |
| 처리 로그 | `src/database/repositories/error-log.repository.ts` |
| 하트비트 | `src/services/heartbeat.service.ts`, `src/server/routes/heartbeat.route.ts` |
| 설비 레지스트리 | `src/services/equipment-registry.service.ts` |
| Aggregator | `vector-config/aggregator/vector-aggregator.toml` |
| Agent | `vector-config/agent/*.toml`, `vector-config/agent-fluent/*.conf` |
| 타겟 매핑 | `config/table-registry.json` |
| 파싱 필드 | `config/parse-fields.json` |
| Frontend 메뉴 | `frontend/src/components/layout/Sidebar.tsx` |
| 내장 도움말 | `frontend/src/docs/index.ts`, `frontend/src/docs/{ko,en,es}` |
| 배포 | `.github/workflows/deploy.yml`, `ecosystem.config.cjs` |

라인 번호나 파일 크기는 변경되기 쉬우므로 고정 인덱스 대신 `rg`로 현재 정의를 찾는다.

## 주요 포트

| 포트 | 용도 |
|---:|---|
| 3100 | Next.js Frontend |
| 3110 | Fastify Backend/API |
| 6000 | Vector Agent → Aggregator |
| 24224 | Fluent Bit → Aggregator |
| 8687 | Aggregator API |
| 8686 | 설비 PC Vector API |
| 9090 | 설비 PC Agent Manager |

## 실행과 검증

```powershell
# Backend + Frontend 개발
npm run dev

# 개별 실행
npm run dev:backend
npm run dev:frontend

# Backend 빌드
npm run build

# Frontend 빌드
npm run build:frontend

# 도움말 구조 검사
node --test frontend/src/docs/help-docs.check.mjs
```

현재 Vitest 형식의 `*.test.*`/`*.spec.*` suite는 등록되어 있지 않다. `tests/pipeline-test.ts`는 실행 중인 Backend/Oracle을 전제로 한 수동 종단 검사이므로 환경을 확인한 뒤 별도로 실행한다.

운영 상태:

```powershell
pm2 status
Invoke-WebRequest http://localhost:3110/api/monitor/pipeline-status -UseBasicParsing
Invoke-WebRequest http://localhost:3100 -UseBasicParsing
Invoke-WebRequest http://localhost:8687/health -UseBasicParsing
```

## 로그 수신 계약

`POST /api/logs`는 단건, 배열, `{ "logs": [...] }`를 지원하고 최대 1,000건을 검증한다.

```text
Zod 검증
  → raw 파일 저장
  → FILE_RECEIVE / HTTP_RECEIVE 처리 로그
  → excluded 설비 필터
  → processLogBatch
  → TABLE_INSERT / PROCEDURE_CALL
  → 202 Accepted
```

- raw 기본 경로: `C:\data\raw-logs\{equipment_type}\{equipment_id}\{date}\{filename}`
- 처리 로그: `data/process-logs/process-YYYY-MM-DD.jsonl`
- 동일 raw 파일 write는 직렬화하고 다른 파일은 병렬 처리한다.
- `excluded = true`는 Oracle 적재만 건너뛰며 raw와 수신 이력은 유지한다.

## Oracle 적재 규칙

- 매핑의 단일 소스는 `config/table-registry.json`이다.
- 요청별 worker limit은 30이고, 전역 DB semaphore는 `ORACLE_POOL_MAX - 5`다.
- `target_type = TABLE`은 동적 INSERT, `PROCEDURE`는 NAMED/ARRAY 호출을 사용한다.
- `LOG_ICT`, `LOG_ISCM_ICT`, `LOG_PRESSFIT`의 `data.ROWS`는 BARCODE별 기존 행 삭제 후 bulk INSERT한다.
- 다른 `ROWS` 테이블은 자기 테이블 trigger의 ORA-04091을 피하기 위해 행별 INSERT한다.
- `SELECTIVE` 빈 `ROWS`는 INSERT하지 않는다.
- `ORA-00001`은 재전송 중복으로 보고 skip 처리한다.

현재 TABLE 타겟:

```text
LOG_AOI, LOG_COATING1, LOG_COATING2, LOG_COATINGREVIEW,
LOG_COATINGVISION, LOG_DOWNLOAD, LOG_EOL, LOG_FCT, LOG_ICT,
LOG_ISCM_BURNIN, LOG_ISCM_ICT, LOG_LCR, LOG_LOWCURRENT,
LOG_MARKING, LOG_MOUNTER, LOG_PRESSFIT, LOG_REFLOW_01,
LOG_REFLOW_02, LOG_SELECTIVE, LOG_SPI, LOG_SPI_VD,
LOG_VISION_LEGACY, LOG_VISION_NATIVE
```

등록 프로시저 키에는 `PKG_BATCH.P_PBA_FT_SUMMARY`, `SP_LOG_INS_SPI`가 있다. 실제 활성 호출 여부는 registry와 VRL `target_type`을 함께 확인한다.

## 현재 설비 유형

```text
AOI, COATING1, COATING2, COATINGREVIEW, COATINGVISION,
DOWNLOAD, EOL, FCT, ICT, ISCM_BURNIN, ISCM_ICT, LCR,
LOWCURRENT, MARKING, MOUNTER, PRESSFIT, REFLOW, SELECTIVE,
SPI, SPI_VD, VISION_LEGACY, VISION_NATIVE
```

- ISCM_ICT는 `LOG_ISCM_ICT` 단일 테이블에 Header 5종과 상세 `ROWS`를 적재한다.
- Agent Manager가 30초마다 Backend에 heartbeat를 직접 보낸다.
- heartbeat TTL 기본값은 60초이며 snapshot과 equipment registry를 디스크에 보존한다.

## Frontend 주요 경로

| 경로 | 역할 |
|---|---|
| `/dashboard` | 중앙 서비스 흐름과 등록 타겟 |
| `/dashboard/equipment` | heartbeat, 수집 제외, 원격 Agent Manager |
| `/dashboard/sender` | Vector/Fluent Agent 설정 |
| `/dashboard/receiver` | Aggregator 설정과 백업 |
| `/dashboard/vrl-mapping` | VRL 생성·시뮬레이션·적용과 Oracle 매핑 |
| `/dashboard/log-files` | raw 조회·다운로드·삭제·수동 투입 |
| `/dashboard/system-logs` | 오류·재전송·처리·실시간·PM2 로그 |
| `/dashboard/diagnose` | buffer, 처리량, Oracle, 장비 진단 |
| `/dashboard/upload` | 파일 업로드 이력 |
| `/dashboard/download` | Vector/Agent Manager/Fluent Bit/설정 다운로드 |
| `/dashboard/settings` | 서버·Oracle·저장소·heartbeat·AI 설정 |
| `/dashboard/help` | 3개 언어 내장 도움말 |

## 운영 API 찾기

운영 API는 `monitor.route.ts`에 77개 route가 있다. 고정 line index를 유지하지 말고 다음으로 현재 정의를 확인한다.

```powershell
rg -n "app\.(get|post|put|delete)\(" src/server/routes/monitor.route.ts
```

자주 쓰는 경로:

```text
GET  /api/monitor/overview
GET  /api/monitor/pipeline-status
POST /api/monitor/vector/reload
GET  /api/monitor/vrl/code/:equipmentType
POST /api/monitor/vrl/simulate
POST /api/monitor/vrl/manual-ingest
POST /api/monitor/vrl/apply
GET  /api/monitor/logs
GET  /api/monitor/errors
POST /api/monitor/retry
GET  /api/monitor/log-files
GET  /api/diagnose/health
```

## 배포 주의사항

- workflow의 `robocopy /MIR`는 `.env`, registry, Aggregator 운영 설정, data/logs/vector-data를 보호한다.
- 최초 배포는 보호 파일을 서버에 직접 시드해야 한다.
- Backend가 Vector Aggregator의 단일 소유자다. 별도 PM2/Start-Process로 중복 시작하지 않는다.
- TOML만 바뀐 경우 `POST /api/monitor/vector/reload`로 반영한다.
- PM2 Backend port orphan 검사는 workflow에 포함되어 있다.

## 문서

- 현재 아키텍처: `docs/ARCHITECTURE.md`
- 종단 데이터 흐름: `docs/DATA_FLOW.md`
- 현재 요구사항: `docs/PRD.md`
- 배포: `DEPLOYMENT_GUIDE.md`
- SPI 복구: `docs/spi-recovery/README.md`
- 날짜가 붙은 `docs/plans`, `docs/specs`, `docs/superpowers`는 작성 시점 기록이므로 현재 상태 문서로 사용하지 않는다.
