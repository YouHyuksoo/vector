# Vector Log Collection System Architecture

Last updated: 2026-05-21

이 문서는 현재 `C:\Project\vector` 코드 기준의 아키텍처 문서다. 예전 문서에 있던 Redis/BullMQ 큐 구조는 현재 코드에 없다. 현재 백엔드는 Vector HTTP sink에서 받은 배치를 검증하고, raw 파일을 저장한 뒤, Oracle에 직접 INSERT 또는 PROCEDURE CALL을 수행한다.

## 1. 시스템 개요

Vector Log Collection System은 설비 PC의 결과 로그를 중앙 서버로 모아 Oracle DB에 적재하고, 운영자가 웹 대시보드에서 수신기/송신기/매핑/처리 로그/재처리를 관리하는 시스템이다.

핵심 흐름은 다음과 같다.

```text
설비 PC
  ├─ Vector Agent 또는 Fluent Bit Agent
  └─ Agent Manager(Go, :9090)
        │
        │ Vector protocol :6000 또는 Fluent forward :24224
        ▼
중앙 서버 Vector Aggregator
  ├─ 설비유형별 VRL 파싱
  ├─ API 전송용 JSON 정규화
  └─ HTTP sink + disk buffer
        │
        │ POST http://127.0.0.1:3110/api/logs
        ▼
Node.js Fastify API
  ├─ Zod 검증
  ├─ raw 파일 저장: C:\data\raw-logs
  ├─ 처리 로그 저장: data/process-logs/*.jsonl
  ├─ 설비 하트비트/레지스트리 관리
  └─ Oracle 직접 적재
        │
        ▼
Oracle DB
  ├─ LOG_* 테이블
  └─ 등록 프로시져

Next.js Dashboard
  └─ Fastify API를 호출해 수신/송신/매핑/로그/재처리 관리
```

## 2. 런타임 구성요소

| 구성요소 | 위치 | 역할 |
|---|---|---|
| Vector Agent | 설비 PC, `vector-config/agent/*.toml` | 파일 감시, 설비 메타데이터 태깅, Aggregator로 전송 |
| Fluent Bit Agent | 설비 PC, `vector-config/agent-fluent/*.conf` | Vector 사용이 어려운 Windows 환경용 forward 송신 |
| Agent Manager | `agent-manager-go/` | 설비 PC 로컬 관리 UI/API, Vector 시작/중지, TOML 편집, heartbeat 전송 |
| Vector Aggregator | `vector-config/aggregator/vector-aggregator.toml` | 중앙 수신기, VRL 파싱, HTTP sink 전송, disk buffer |
| Backend API | `src/index.ts`, `src/server/app.ts` | Fastify API, Oracle 적재, 운영 API |
| Frontend | `frontend/` | Next.js 대시보드 |
| Oracle | 외부 DB | LOG_* 테이블 및 프로시져 저장 |

## 3. 포트

| 포트 | 구성요소 | 설명 |
|---:|---|---|
| 3110 | Backend API | 기본 `PORT`, `/api/logs`, `/api/monitor/*`, `/health` |
| 3000 | Frontend dev server | `npm run dev --prefix frontend` 기본 Next.js 포트 |
| 6000 | Vector Aggregator source | Vector Agent 수신 |
| 24224 | Vector Aggregator fluent source | Fluent Bit forward 수신 |
| 8687 | Vector Aggregator API | `/health`, `/graphql` 상태 조회 |
| 8686 | Vector Agent API | 설비 PC 로컬 Vector API |
| 9090 | Agent Manager | 설비 PC 로컬 관리 API/UI |

## 4. 중앙 서버 부팅 순서

현재 `src/index.ts` 기준 순서는 다음과 같다.

1. `.env` 로드 및 Zod 검증
2. Oracle Thin mode connection pool 초기화
3. Fastify 앱 생성 및 라우트 등록
4. graceful shutdown 핸들러 등록
5. Backend API listen
6. Vector Aggregator 자동 시작 시도

Vector Aggregator는 `src/services/vector-process.service.ts`에서 `vector-bin/bin/vector.exe --config vector-config/aggregator/vector-aggregator.toml`로 실행된다. 이미 `8687` API가 살아 있으면 자동 시작은 건너뛴다.

## 5. 주요 코드 경계

| 영역 | 파일 |
|---|---|
| 앱 진입점 | `src/index.ts` |
| Fastify 구성 | `src/server/app.ts` |
| 로그 수신 라우트 | `src/server/routes/log-ingest.route.ts` |
| 로그 적재 서비스 | `src/services/log-ingest.service.ts` |
| Oracle pool | `src/database/oracle.pool.ts` |
| 동적 INSERT/프로시져 호출 | `src/database/dynamic-insert.ts` |
| 테이블/프로시져 로컬 레지스트리 | `src/config/local-registry.ts`, `config/table-registry.json` |
| 처리 로그 저장소 | `src/database/repositories/error-log.repository.ts` |
| 하트비트 | `src/server/routes/heartbeat.route.ts`, `src/services/heartbeat.service.ts` |
| 설비 레지스트리 | `src/services/equipment-registry.service.ts`, `data/equipment-registry.json` |
| Vector 프로세스 관리 | `src/services/vector-process.service.ts` |
| Aggregator 설정 | `vector-config/aggregator/vector-aggregator.toml` |
| Agent Manager | `agent-manager-go/main.go` |

## 6. 로그 수집 데이터 흐름

### 6.1 설비 PC 송신

설비 PC는 장비 유형별 TOML을 사용한다.

```text
vector-config/agent/
  AOI.toml
  COATING1.toml
  COATING2.toml
  COATINGREVIEW.toml
  COATINGVISION.toml
  DOWNLOAD.toml
  EOL.toml
  FCT.toml
  ICT.toml
  LCR.toml
  LOWCURRENT.toml
  MARKING.toml
  MOUNTER.toml
  REFLOW.toml
  SELECTIVE.toml
  SP.toml
  SPI.toml
  SPI_VD.toml
  VISION_LEGACY.toml
  VISION_NATIVE.toml
```

Agent TOML은 파일 source에서 로그 파일을 읽고 `equipment_id`, `equipment_type`, `line_code`, `log_type` 같은 메타데이터를 붙인 뒤 `sinks.to_aggregator`로 중앙 수신기 `서버IP:6000`에 전송한다.

32비트/구형 Windows 등 Vector Agent가 맞지 않는 설비는 Fluent Bit 설정(`vector-config/agent-fluent/*.conf`)을 사용해 Aggregator의 `:24224` forward source로 보낼 수 있다. Aggregator의 `normalize_fluent` transform이 `.log`를 `.message`, `.path`를 `.file`로 정규화한다.

### 6.2 Aggregator 수신 및 파싱

Aggregator는 두 source를 가진다.

```toml
[sources.from_agents]
type = "vector"
address = "0.0.0.0:6000"

[sources.from_fluent_agents]
type = "fluent"
address = "0.0.0.0:24224"
```

`route_events`는 Vector internal metric 이벤트를 로그 파이프라인에서 분리한다. 실제 로그는 `parse_logs`에서 `equipment_type`별 VRL 분기로 파싱된다. 파싱 결과는 `format_for_api`에서 다음 구조로 정리된다.

```json
{
  "equipment_id": "SM-AOI-01",
  "equipment_type": "AOI",
  "log_type": "INSPECTION",
  "line_code": "SMT-1",
  "target_type": "TABLE",
  "target_table": "LOG_AOI",
  "timestamp": "2026-05-21T10:20:30.000Z",
  "data": {},
  "raw_message": "원본 로그 내용",
  "filename": "result.csv"
}
```

현재 Aggregator에는 별도 raw-file sink가 없다. raw 원문은 API payload의 `raw_message`, `filename`으로 넘기고 Node.js가 파일 저장을 담당한다.

### 6.3 HTTP sink와 backpressure

Aggregator의 최종 sink는 `sinks.to_api` 하나다.

```toml
[sinks.to_api]
type = "http"
inputs = ["format_for_api"]
uri = "http://127.0.0.1:3110/api/logs"
method = "post"

[sinks.to_api.batch]
max_events = 25
max_bytes = 2097152
timeout_secs = 5

[sinks.to_api.buffer]
type = "disk"
max_size = 8589934592
when_full = "block"

[sinks.to_api.request]
timeout_secs = 300
concurrency = 8
```

이 disk buffer는 백엔드/API/DB 지연 시 데이터를 디스크에 보관한다. 다만 버퍼가 가득 차면 `when_full = "block"` 때문에 sink가 대기하고, 그 backpressure가 Aggregator 입력 쪽으로 전파된다. 따라서 병목 설명 시 "HTTP sink가 막혔다"보다 "disk buffer와 HTTP 전송 대기가 상류 수신 처리량에 backpressure를 건다"가 더 정확하다.

## 7. Backend API 처리 흐름

`POST /api/logs`는 현재 핵심 수신 경로다.

```text
POST /api/logs
  → logBatchSchema 검증
  → raw 파일 저장
  → FILE_RECEIVE / HTTP_RECEIVE 처리 로그 기록
  → equipmentRegistry excluded 여부 확인
  → logIngestService.processLogBatch()
  → dynamicInsert.insert / replaceMany / callProcedure
  → TABLE_INSERT 또는 PROCEDURE_CALL 처리 로그 기록
  → 202 응답
```

지원 요청 형태는 세 가지다.

```json
[
  { "equipment_id": "EQ-1", "log_type": "INSPECTION", "target_table": "LOG_AOI", "timestamp": "...", "data": {} }
]
```

```json
{
  "logs": [
    { "equipment_id": "EQ-1", "log_type": "INSPECTION", "target_table": "LOG_AOI", "timestamp": "...", "data": {} }
  ]
}
```

```json
{ "equipment_id": "EQ-1", "log_type": "INSPECTION", "target_table": "LOG_AOI", "timestamp": "...", "data": {} }
```

배치 최대 크기는 schema 기준 1000건이다. Vector sink에서는 `max_events = 25`로 보낸다.

## 8. Raw 파일 저장

raw 파일 저장은 `src/server/routes/log-ingest.route.ts`의 `saveRawLogFile()`에서 수행한다.

기본 경로:

```text
C:\data\raw-logs\{equipment_type}\{equipment_id}\{yyyy-MM-dd}\{filename}
```

동작:

| 설비 유형 | 저장 방식 |
|---|---|
| `SELECTIVE` | append |
| 그 외 | overwrite |

같은 파일 경로에 대한 동시 write는 `fileWriteChains`로 직렬화한다. 다른 파일은 병렬 저장한다. 이 구조는 Vector HTTP concurrency가 8인 상황에서 같은 파일에 대한 race를 줄이기 위한 것이다.

## 9. Oracle 적재 구조

현재는 BullMQ/Redis worker가 없다. `logIngestService`가 직접 Oracle 작업을 수행한다.

### 9.1 동시성 제한

요청별 worker limit은 30이지만, 실제 DB 적재는 모듈 전역 semaphore로 제한된다.

```text
GLOBAL_DB_CONCURRENCY = ORACLE_POOL_MAX - 5
```

기본 `ORACLE_POOL_MAX`는 40이므로 DB 동시 처리 상한은 35다. 이 제한은 Vector HTTP request concurrency와 API 요청 병렬성이 곱해져 Oracle pool을 압박하는 문제를 막기 위한 장치다.

### 9.2 TABLE 적재

`target_type = "TABLE"`이면 `target_table`을 키로 `config/table-registry.json`에서 컬럼 매핑을 읽는다. `TableRegistry`는 이 매핑으로 INSERT SQL을 생성하고 5분 TTL 캐시를 사용한다.

현재 등록된 주요 테이블:

```text
LOG_AOI
LOG_COATING1
LOG_COATING2
LOG_COATINGREVIEW
LOG_COATINGVISION
LOG_DOWNLOAD
LOG_EOL
LOG_FCT
LOG_ICT
LOG_LCR
LOG_LOWCURRENT
LOG_MARKING
LOG_MOUNTER
LOG_REFLOW_01
LOG_REFLOW_02
LOG_SELECTIVE
LOG_SPI
LOG_SPI_VD
LOG_VISION_LEGACY
LOG_VISION_NATIVE
```

`data.ROWS`가 있으면 기본적으로 row별 INSERT를 수행한다. 단, `LOG_ICT`는 같은 BARCODE의 이전 row를 삭제한 뒤 `executeMany()`로 replace+insert 한다.

중복키 `ORA-00001`은 재전송 상황으로 보고 skip 처리한다.

### 9.3 PROCEDURE 호출

`target_type = "PROCEDURE"`이면 `config/table-registry.json`의 procedure entry를 사용한다. 호출 모드는 두 가지다.

| 모드 | 설명 |
|---|---|
| `NAMED` | 개별 named parameter로 PL/SQL 호출 |
| `ARRAY` | Oracle collection type에 배열을 담아 호출 |

현재 레지스트리에는 `PKG_BATCH.P_PBA_FT_SUMMARY`, `SP_LOG_INS_SPI` 같은 procedure key가 포함되어 있다.

## 10. 처리 로그와 재처리

처리 로그 저장소는 DB가 아니라 파일 기반이다.

```text
data/process-logs/process-YYYY-MM-DD.jsonl
```

기록 상태:

| STATUS | 의미 |
|---|---|
| `SUCCESS` | 파일 수신, HTTP 수신, TABLE INSERT, PROCEDURE CALL 성공 등 |
| `ERROR` | 검증 실패, VRL 파싱 실패, INSERT 실패 등 |

주요 stage:

```text
FILE_RECEIVE
HTTP_RECEIVE
VRL_PARSE
TABLE_INSERT
PROCEDURE_CALL
PIPELINE_SKIP
LOG_DOWNLOAD
```

파일 write는 50건 또는 250ms 단위로 비동기 batch flush한다. 조회 전에는 `flushSync()`로 pending 로그를 비워 UI 누락을 줄인다. 기본 보존 기간은 30일이다.

`/api/monitor/errors`, `/api/monitor/logs`, `/api/monitor/retry`, `/api/monitor/retry/all` 계열 API가 이 파일 저장소를 사용한다.

## 11. 하트비트와 설비 레지스트리

하트비트는 Redis TTL이 아니라 인메모리 Map + 디스크 snapshot 구조다.

```text
Agent Manager
  → POST /api/heartbeat
  → heartbeatService.update()
  → data/heartbeat-snapshot.json debounce 저장
  → equipmentRegistry.upsert()
  → data/equipment-registry.json debounce 저장
```

`HEARTBEAT_TTL_SECONDS` 기본값은 60초다. TTL이 지나면 항목을 삭제하지 않고 `online = false`로만 바꾼다. 재시작 후에는 snapshot을 복원하되, 다음 heartbeat가 오기 전까지는 offline으로 표시한다.

설비 레지스트리의 `excluded = true`인 설비는 raw 파일과 처리 로그는 남기지만 DB INSERT는 건너뛴다.

## 12. Agent Manager 구조

`agent-manager-go`는 설비 PC에 배포되는 Go 단일 바이너리다.

기본값:

| 값 | 기본 |
|---|---|
| 로컬 포트 | `9090` |
| Vector API | `http://127.0.0.1:8686` |
| 중앙 서버 | `http://20.10.30.112:3100` |
| 설정 폴더 | `C:\vector` |
| Vector 실행파일 | `C:\vector\vector.exe` |

주요 기능:

| API | 역할 |
|---|---|
| `/api/status`, `/api/metrics` | 로컬 Vector/설비 상태 |
| `/api/config` | TOML 내용 조회/수정 |
| `/api/vector/start`, `/api/vector/stop`, `/api/vector/restart` | 로컬 Vector 제어 |
| `/api/install`, `/api/update/*` | 중앙 서버에서 Vector zip 다운로드/업데이트 |
| `/api/service/*` | Windows 서비스 등록/해제 |
| `/api/logs/recent`, `/api/logs/resend` | 감시 경로 최근 파일 및 재전송 폴더 확인 |
| `/api/server-config` | 중앙 서버 주소 조회/변경 |

Agent Manager는 30초마다 TOML의 `equipment_id`, `equipment_type`, `line_code`, `log_type`과 Vector 실행 여부를 읽어 중앙 서버 `/api/heartbeat`로 보낸다.

## 13. Backend API 요약

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | Backend health |
| POST | `/api/logs` | Vector HTTP sink 로그 수신 |
| POST | `/api/heartbeat` | Agent Manager heartbeat 수신 |
| GET | `/api/status` | 전체 설비 상태 |
| GET | `/api/status/:equipmentId` | 단일 설비 상태 |
| GET | `/api/monitor/overview` | 대시보드 통합 현황 |
| GET/POST | `/api/monitor/vector/*` | Aggregator 상태/시작/중지/reload |
| GET/PUT | `/api/monitor/aggregator/config` | Aggregator TOML 조회/수정 |
| GET/PUT/POST/DELETE | `/api/monitor/agent/config*` | Vector Agent TOML 관리 |
| GET/PUT/POST/DELETE | `/api/monitor/agent-fluent/config*` | Fluent Bit config 관리 |
| GET/POST | `/api/monitor/tables/oracle*` | Oracle table/column 조회 및 DDL 생성 |
| GET/POST/DELETE | `/api/monitor/procedures*` | Procedure mapping 관리 |
| GET | `/api/monitor/logs` | 처리 로그 조회 |
| GET/DELETE/POST | `/api/monitor/errors*` | 오류 로그 조회/삭제 |
| POST | `/api/monitor/retry`, `/api/monitor/retry/all` | 실패 raw_data 재처리 |
| GET/POST | `/api/monitor/vrl/*` | VRL 조회, 시뮬레이션, 검증, 적용, manual ingest |
| GET/PUT/DELETE | `/api/monitor/equipment-registry*` | 설비 레지스트리 관리 |
| GET/PUT | `/api/monitor/config` | 서버/Oracle/storage 설정 조회/변경 |
| GET | `/api/monitor/pipeline-status` | 파이프라인 단계별 상태 |
| GET | `/api/monitor/system-logs`, `/api/monitor/pm2-logs` | 운영 로그 조회 |
| POST/GET/DELETE | `/api/upload*` | 파일 업로드/목록/다운로드/삭제 |
| GET | `/api/monitor/remote/:equipmentId/*` | 설비 Agent Manager 프록시 |

## 14. Frontend 구조

프론트엔드는 `frontend/`의 Next.js 앱이다. 백엔드는 별도 proxy 없이 같은 origin 경로로 호출하는 `apiFetch()` 래퍼를 사용한다.

주요 화면:

| 경로 | 역할 |
|---|---|
| `/dashboard` | 운영 대시보드 |
| `/dashboard/sender` | Agent TOML/Fluent config 관리 및 다운로드 |
| `/dashboard/receiver` | Aggregator 설정 관리 |
| `/dashboard/mapping` | 테이블/프로시져 매핑 |
| `/dashboard/vrl-mapping` | VRL 생성/시뮬레이션/적용 |
| `/dashboard/log-files` | raw 파일 조회/다운로드/삭제 및 batch ingest |
| `/dashboard/logs` | 처리 로그 |
| `/dashboard/errors` | 오류 로그 |
| `/dashboard/retry` | 재처리 |
| `/dashboard/equipment` | 설비 상태 및 원격 Agent Manager 제어 |
| `/dashboard/diagnose` | 진단 |
| `/dashboard/system-logs` | 시스템/PM2 로그 |
| `/dashboard/settings` | 서버/Oracle/AI 설정 |
| `/dashboard/upload` | 설정/파일 업로드 |
| `/dashboard/help` | 내장 문서 |

## 15. 환경 변수

`src/config/env.ts` 기준 현재 환경 변수는 다음과 같다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3110` | Backend API 포트 |
| `HOST` | `0.0.0.0` | Backend bind 주소 |
| `NODE_ENV` | `development` | 실행 환경 |
| `ORACLE_USER` | 필수 | Oracle 사용자 |
| `ORACLE_PASSWORD` | 필수 | Oracle 비밀번호 |
| `ORACLE_CONNECT_STRING` | 필수 | Oracle 접속 문자열 |
| `ORACLE_POOL_MIN` | `8` | Oracle pool min |
| `ORACLE_POOL_MAX` | `40` | Oracle pool max |
| `RAW_LOG_BASE_PATH` | `C:\data\raw-logs` | raw 파일 저장 루트 |
| `HEARTBEAT_TTL_SECONDS` | `60` | heartbeat online TTL |
| `AGENT_MONITOR_PORT` | `9090` | Agent Manager 포트 |

## 16. 실행 명령

Backend + Frontend 개발 실행:

```powershell
npm run dev
```

Backend만 실행:

```powershell
npm run dev:backend
```

Frontend만 실행:

```powershell
npm run dev:frontend
```

TypeScript 빌드:

```powershell
npm run build
```

프로덕션 Backend 실행:

```powershell
npm start
```

Aggregator 단독 실행:

```powershell
vector-bin\bin\vector.exe --config vector-config\aggregator\vector-aggregator.toml
```

## 17. 종료와 복구 설계

`setupGracefulShutdown()`은 SIGINT/SIGTERM에서 다음 순서로 종료한다.

1. Vector Aggregator 중지
2. Fastify 서버 close
3. Oracle pool close
4. 처리 로그 pending buffer flush

Windows에서 Vector 중지는 즉시 kill을 기본으로 쓰지 않는다. 먼저 `taskkill /IM vector.exe /T`로 정상 종료를 유도하고, 30초 안에 내려가지 않을 때만 강제 종료한다. disk buffer 손상을 줄이기 위한 정책이다.

장애 시 내구성은 다음 위치에서 제공된다.

| 상황 | 보존 위치 |
|---|---|
| Backend API 지연/다운 | Vector `sinks.to_api.buffer` disk buffer |
| Oracle INSERT 실패 | `data/process-logs/*.jsonl` ERROR + raw_data |
| raw 원문 | `C:\data\raw-logs` |
| 하트비트 마지막 상태 | `data/heartbeat-snapshot.json` |
| 설비 등록/배제 | `data/equipment-registry.json` |

## 18. 현재 구조에서 중요한 운영 포인트

1. `POST /api/logs`는 raw 파일 저장과 DB INSERT를 같은 요청 경로에서 수행한다. 따라서 대용량 row 설비는 API 응답 시간과 Vector sink backpressure에 직접 영향을 준다.
2. Vector disk buffer는 유실 방지 장치이지만, 가득 차면 upstream backpressure를 만든다. 디스크 여유와 `vector-data` 상태를 같이 봐야 한다.
3. 처리 로그는 Oracle이 아니라 JSONL 파일이다. DB 장애 상황에서도 수신/실패 흔적은 남지만, 로그 파일 경로와 30일 보존 정책을 알고 있어야 한다.
4. `config/table-registry.json`이 실제 INSERT/PROCEDURE mapping의 source of truth다. Oracle DDL만 바꿔서는 백엔드 적재 필드가 바뀌지 않는다.
5. `equipmentRegistry.excluded`는 DB INSERT만 막는다. raw 파일 저장과 HTTP 수신 로그는 계속 남는다.
6. `LOG_ICT`는 replaceMany 특례가 있다. 다른 다중 row 테이블과 동일하게 보면 안 된다.
7. 하트비트는 Agent Manager가 직접 HTTP로 전송한다. Vector internal metrics는 Aggregator에서 로그 파이프라인으로 흘려보내지 않는다.

## 19. 구버전 문서와 달라진 점

| 구버전 설명 | 현재 상태 |
|---|---|
| Fastify + BullMQ + Redis 큐 | Redis/BullMQ 없음, Fastify가 Oracle 직접 적재 |
| `/api/logs`가 큐에 적재 후 202 | raw 저장 후 DB 처리까지 수행하고 202 |
| Redis heartbeat TTL | 인메모리 Map + `data/heartbeat-snapshot.json` |
| Aggregator raw file sink | 제거됨, Node.js가 raw 파일 저장 |
| API 기본 포트 3100 | 코드 기본값은 3110 |
| 단순 INSPECTION/ALARM/PROCESS 3종 예시 | 실제로는 설비유형별 VRL + LOG_* 테이블/프로시져 매핑 |
| Agent만 존재 | Agent Manager Go 바이너리와 원격 프록시/서비스 관리 포함 |

