/**
 * @file docs/DATA_FLOW.md
 * @description Vector 로그 수집 시스템 전체 데이터 흐름 문서
 *
 * 초보자 가이드:
 * 1. 이 문서는 설비 로그가 수집→파싱→저장되기까지의 전체 파이프라인을 설명
 * 2. 각 단계별 관련 파일 경로와 핵심 로직을 함께 기술
 * 3. 신규 설비 추가 시 필요한 작업 체크리스트 포함
 */

# Vector 로그 수집 시스템 — 전체 데이터 흐름

## 파이프라인 개요

```
설비 PC 로그 파일
    ↓  Vector Agent (TCP:6000)
Vector Aggregator (VRL 파싱)
    ├─→ [분기 1] Raw 파일 저장  →  C:\data\raw-logs\{설비}\{ID}\{날짜}\{파일명}
    └─→ [분기 2] HTTP POST      →  http://127.0.0.1:3100/api/logs
                                        ↓
                                   Fastify API (Zod 검증)
                                        ↓
                                   BullMQ 큐 (Redis)
                                        ↓
                                   Worker → DynamicInsert
                                        ↓
                                   Oracle DB (LOG_xxx 테이블)
```

---

## 1단계: Vector Agent (송신기)

**파일:** `vector-config/agent/{설비유형}.toml` (13개)

| 설비 | 파일 |
|---|---|
| SP, SPI, AOI, MAOI, REFLOW, ICT, FCT | 각 `{설비}.toml` |
| BURNIN, HIPOT, EOL, METALMASK, MOUNTER, VISCOSITY | 각 `{설비}.toml` |

**동작 방식:**
1. `file` 소스로 설비 로그 디렉토리 감시 (tail)
2. `multiline` 설정으로 파일 전체를 단일 이벤트로 묶음 (1초 타임아웃)
3. `remap` transform에서 메타데이터 태깅:
   - `.equipment_type` = 설비 유형 (예: `"SPI"`)
   - `.log_type` = 로그 유형 (예: `"INSPECTION"`)
   - `.equipment_id` = 설비 ID (예: `"SPI-001"`)
   - `.line_code` = 라인 코드
4. `vector` sink로 Aggregator TCP:6000에 전송 (256MB 디스크 버퍼)

```toml
[sources.work_logs]
type = "file"
include = ["C:\\logs\\spi\\*.txt", "C:\\logs\\spi\\*.csv"]
fingerprint.strategy = "checksum"

[transforms.add_metadata]
type = "remap"
source = '''
.equipment_type = "SPI"
.log_type = "INSPECTION"
.equipment_id = "SPI-001"
'''

[sinks.to_aggregator]
type = "vector"
address = "127.0.0.1:6000"
buffer.type = "disk"
buffer.max_size = 268435488
```

---

## 2단계: Vector Aggregator (수신기)

**파일:** `vector-config/aggregator/vector-aggregator.toml`

### 수신 → 파싱 → 분기

```
[sources.from_agents]       TCP:6000 수신
        ↓
[transforms.parse_logs]     VRL 파싱 (equipment_type 기준 분기)
        ↓                        ↓
[transforms.format_for_api]    [sinks.raw_file]
        ↓                      raw 원본 저장
[sinks.to_api]
  POST /api/logs
```

### VRL 파싱 핵심 로직 (`parse_logs`)

```vrl
.raw_message = .message
.filename = replace!(.file, r'.*\\', "")
.target_table = "LOG_" + to_string!(.log_type)

if .equipment_type == "SPI" {
  values = split!(.message, "\n")
  header = split!(to_string!(get!(values, [0])), ",")
  data_line = split!(to_string!(get!(values, [1])), ",")
  .data.MASTER_BARCODE = strip_whitespace!(to_string!(get!(data_line, [0])))
  .data.PCB_ID         = strip_whitespace!(to_string!(get!(data_line, [1])))
  # ...
} else if .equipment_type == "AOI" {
  # ...
}
```

### API 전송 포맷 (`format_for_api`)

```vrl
. = {
  "equipment_id":  .equipment_id,
  "log_type":      .log_type,
  "target_table":  .target_table,
  "timestamp":     to_string!(.timestamp),
  "data":          .data
}
```

### Raw 파일 저장 (`sinks.raw_file`)

- 경로: `C:\data\raw-logs\{equipment_type}\{equipment_id}\%Y-%m-%d\{filename}`
- 인코딩: text (원본 그대로)
- 버퍼: 512MB 디스크, block 모드

### API 전송 (`sinks.to_api`)

- URL: `http://127.0.0.1:3100/api/logs`
- 배치: 100개 이벤트 또는 5초마다
- 재시도: 초기 1초 → 최대 30초 (지수 백오프)
- 버퍼: 512MB 디스크

---

## 3단계: Fastify API 수신

**파일:** `src/schemas/log-ingest.schema.ts`, `src/server/routes/log-ingest.route.ts`

### POST /api/logs

```
요청 → Zod 검증 → BullMQ 큐 적재 → 202 Accepted
```

**Zod 스키마:**
```typescript
logRecordSchema = {
  equipment_id:  string,
  log_type:      string,
  target_table:  string,   // "LOG_SPI" 등
  timestamp:     string,
  data:          Record<string, unknown>
}
```

Vector HTTP sink는 JSON 배열, 수동 호출은 `{ logs: [...] }` 형태 모두 허용.

---

## 4단계: BullMQ 큐 처리

**파일:** `src/queue/producers/log.producer.ts`, `src/queue/workers/log-insert.worker.ts`

### Producer

- 큐명: `log-insert`
- ALARM 우선순위: 1 (일반: 5)
- 재시도: 3회, 지수 백오프
- 완료 후 보관: 1,000개 / 실패 보관: 5,000개

### Worker

```typescript
processLogInsert(job) {
  dynamicInsert.insert(target_table, {
    ...data,
    EQUIPMENT_ID:  equipment_id,
    LOG_TIMESTAMP: timestamp,
    CREATED_AT:    new Date().toISOString(),
  });
}
```

- 동시성: `QUEUE_CONCURRENCY` 환경변수 (기본 5)
- 실패 시: LOG_ERROR에 기록 후 throw (BullMQ가 재시도)

---

## 5단계: Dynamic INSERT

**파일:** `src/database/dynamic-insert.ts`, `src/database/table-registry.ts`

### 스키마 해석 흐름

```
config/table-registry.json
    ↓  local-registry.ts → getTableColumns()
table-registry.ts → loadSchema()
    ↓  5분 TTL 메모리 캐시
INSERT INTO LOG_SPI (COL1, COL2, ...) VALUES (:b0, :b1, ...)
```

### DynamicInsert

- `insert()`: 단건 삽입 (autoCommit)
- `insertMany()`: 벌크 삽입 (batchErrors: true, 부분 실패 허용)
- OracleDB 타입 매핑: NUMBER → DB_TYPE_NUMBER, DATE → DB_TYPE_TIMESTAMP, CLOB → DB_TYPE_CLOB, 기타 → DB_TYPE_VARCHAR

---

## 설정 파일 관리 (DB 독립)

### config/table-registry.json

**역할:** Oracle 테이블별 컬럼 매핑 정의 (구 TABLE_COLUMN_REGISTRY 대체)

```json
{
  "LOG_SPI": [
    { "COLUMN_NAME": "MASTER_BARCODE", "DATA_TYPE": "VARCHAR2", "SOURCE_FIELD": "data.MASTER_BARCODE", "IS_REQUIRED": "Y", "COLUMN_ORDER": 1 },
    { "COLUMN_NAME": "PCB_ID", "DATA_TYPE": "VARCHAR2", "SOURCE_FIELD": "data.PCB_ID", "IS_REQUIRED": "N", "COLUMN_ORDER": 2 }
  ]
}
```

**관련 모듈:** `src/config/local-registry.ts`

### config/parse-fields.json

**역할:** VRL에서 자동 추출된 `data.*` 필드 목록 (구 VRL_PARSE_FIELDS 대체)

```json
{
  "SPI": [
    { "fieldName": "data.MASTER_BARCODE", "fieldLabel": "data.MASTER_BARCODE", "fieldOrder": 1 },
    { "fieldName": "data.PCB_ID", "fieldLabel": "data.PCB_ID", "fieldOrder": 2 }
  ]
}
```

**관련 모듈:** `src/config/local-parse-fields.ts`

**갱신 시점:**
- VRL 코드 적용(`POST /api/monitor/vrl/apply`) 시 자동 동기화
- 프론트엔드 매핑 페이지에서 수동 편집

---

## 하트비트 / 모니터링

**파일:** `src/redis/heartbeat.service.ts`

```
설비 PC → POST /api/heartbeat { equipment_id }
    ↓
Redis SETEX heartbeat:{id} TTL=60초
    ↓ (TTL 만료 시 자동 삭제 = 오프라인)
GET /api/status → 전체 장비 온/오프라인 상태
```

**Vector Aggregator 모니터링:** `src/services/vector-process.service.ts`
- Health: `http://127.0.0.1:8687/health`
- GraphQL: uptime, version 조회
- 프로세스 시작/중지: `vector.exe --config aggregator.toml`

---

## 에러 처리

**파일:** `src/database/repositories/error-log.repository.ts`

```
Worker INSERT 실패
    ↓
errorLogRepository.record() → LOG_ERROR 테이블
    ↓
throw → BullMQ 재시도 (최대 3회)
    ↓ 3회 실패
Job 'failed' 상태로 Redis 보관 (최대 5,000개)
```

LOG_ERROR 컬럼: `ERROR_ID`, `SOURCE_TABLE`, `EQUIPMENT_ID`, `ERROR_MESSAGE`, `RAW_DATA`, `CREATED_AT`

---

## 시스템 초기화 순서

**파일:** `src/index.ts`

```
1. initOraclePool()          Oracle 커넥션 풀
2. buildApp()                Fastify 서버 (routes/plugins)
3. startLogInsertWorker()    BullMQ Worker (concurrency:5)
4. setupGracefulShutdown()   SIGTERM/SIGINT 핸들러
5. app.listen(3100)          HTTP 리스닝
```

---

## 프론트엔드 페이지 구성

| 경로 | 페이지 | 주요 기능 |
|---|---|---|
| `/dashboard` | 대시보드 | 인프라 상태, 큐 통계, 설비 그리드 |
| `/dashboard/logs` | 로그 뷰어 | Oracle 테이블 데이터 조회 |
| `/dashboard/errors` | 에러 로그 | LOG_ERROR 조회/삭제 |
| `/dashboard/mapping` | 테이블 매핑 | Oracle 컬럼 ↔ VRL 소스 필드 매핑 |
| `/dashboard/receiver` | 수신기 설정 | Aggregator TOML 폼 편집 |
| `/dashboard/simulator` | VRL 시뮬레이터 | 샘플 로그로 파싱 테스트/적용 |
| `/dashboard/sender` | 송신기 설정 | Agent TOML 설비별 관리 |
| `/dashboard/download` | 다운로드 | vector.zip + Agent TOML 배포 |
| `/dashboard/settings` | 설정 | .env 변수 + AI 모델 설정 |

---

## 신규 설비 추가 체크리스트

1. **Agent TOML 생성** — Sender 페이지에서 UI로 생성 가능
2. **VRL 파싱 블록 추가** — Simulator 페이지에서 AI 생성 → 테스트 → Apply
3. **Oracle 테이블 결정** — 기존 테이블 사용 또는 신규 `LOG_{설비}` 생성
4. **컬럼 매핑 등록** — Mapping 페이지에서 `config/table-registry.json`에 저장
5. **파싱 필드 동기화** — VRL Apply 시 `config/parse-fields.json`에 자동 반영
