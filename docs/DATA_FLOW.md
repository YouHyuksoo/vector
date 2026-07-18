---
sources:
  - src/server/routes/log-ingest.route.ts
  - src/services/log-ingest.service.ts
  - src/database/dynamic-insert.ts
  - src/database/repositories/error-log.repository.ts
  - src/services/heartbeat.service.ts
  - vector-config/aggregator/vector-aggregator.toml
  - config/table-registry.json
verifiedCommit: e736824
---

# Vector 로그 수집 시스템 데이터 흐름

최종 검증: 2026-07-18

## 1. 전체 파이프라인

```text
설비 로그 파일
  ├─ Vector Agent :6000
  └─ Fluent Bit :24224
        ↓
Vector Aggregator
  ├─ equipment_type별 VRL 파싱
  ├─ TABLE/PROCEDURE 타겟 지정
  └─ HTTP sink disk buffer
        ↓ POST http://127.0.0.1:3110/api/logs
Fastify API
  ├─ Zod 검증
  ├─ raw 원문 파일 저장
  ├─ 처리 로그 JSONL 기록
  ├─ 수집 제외 설비 필터
  └─ Oracle 직접 INSERT/PROCEDURE CALL
        ↓
Oracle LOG_* 테이블 또는 등록 프로시저
```

Redis/BullMQ 큐와 별도 worker는 현재 런타임에 없다. API 요청 경로에서 raw 저장과 Oracle 처리를 완료한 뒤 `202 Accepted`를 반환한다.

## 2. 설비 PC 송신

Vector Agent 설정은 `vector-config/agent/*.toml`, Fluent Bit 설정은 `vector-config/agent-fluent/*.conf`에 있다.

현재 Vector Agent 유형:

```text
AOI, COATING1, COATING2, COATINGREVIEW, COATINGVISION,
DOWNLOAD, EOL, FCT, ICT, ISCM_BURNIN, ISCM_ICT, LCR,
LOWCURRENT, MARKING, MOUNTER, PRESSFIT, REFLOW, SELECTIVE,
SPI, SPI_VD, VISION_LEGACY, VISION_NATIVE
```

Agent는 다음 메타데이터를 붙여 중앙 수신기로 보낸다.

- `equipment_id`: 설비 고유 ID
- `equipment_type`: Aggregator VRL 분기 키
- `line_code`: 생산 라인
- `log_type`: 로그 분류
- `file`: 원본 파일 경로
- `message`: 원문

Agent의 disk buffer는 네트워크 장애 때 미전송 이벤트를 보존한다. fingerprint와 `data_dir`은 재기동 후 읽기 위치를 복원하므로 운영 중 임의 초기화하면 중복 전송될 수 있다.

하트비트는 Agent Manager가 30초마다 `POST /api/heartbeat`로 직접 보낸다. Vector 로그 파이프라인을 경유하지 않는다.

## 3. Aggregator 수신과 VRL

`vector-config/aggregator/vector-aggregator.toml`의 주요 source:

```toml
[sources.from_agents]
type = "vector"
address = "0.0.0.0:6000"

[sources.from_fluent_agents]
type = "fluent"
address = "0.0.0.0:24224"
```

`parse_logs` transform은 `equipment_type`별로 원문을 파싱하고 `data`, `target_type`, `target_table`을 만든다. `format_for_api`는 다음 형태로 정규화한다.

```json
{
  "equipment_id": "EQUIP-01",
  "equipment_type": "SPI",
  "line_code": "SMT-1",
  "log_type": "INSPECTION",
  "target_type": "TABLE",
  "target_table": "LOG_SPI",
  "timestamp": "2026-07-18T10:20:30.000Z",
  "filename": "result.csv",
  "raw_message": "원문",
  "data": {}
}
```

현재 주요 타겟은 다음과 같다.

```text
LOG_AOI, LOG_COATING1, LOG_COATING2, LOG_COATINGREVIEW,
LOG_COATINGVISION, LOG_DOWNLOAD, LOG_EOL, LOG_FCT, LOG_ICT,
LOG_ISCM_BURNIN, LOG_ISCM_ICT, LOG_LCR, LOG_LOWCURRENT,
LOG_MARKING, LOG_MOUNTER, LOG_PRESSFIT, LOG_REFLOW_01,
LOG_REFLOW_02, LOG_SELECTIVE, LOG_SPI, LOG_SPI_VD,
LOG_VISION_LEGACY, LOG_VISION_NATIVE
```

ISCM_ICT는 과거 3개 테이블 분리 방식이 아니라 `LOG_ISCM_ICT` 단일 테이블에 Header 5종과 상세 `ROWS`를 적재한다.

## 4. HTTP sink와 backpressure

Aggregator의 최종 sink는 `POST http://127.0.0.1:3110/api/logs`다.

```text
batch: 최대 25 events / 2 MiB / 5초
request timeout: 300초
request concurrency: 8
disk buffer: 8 GiB
when_full: block
```

Backend 또는 Oracle이 느리면 disk buffer가 이벤트를 보존한다. buffer가 가득 차면 `block` 정책 때문에 backpressure가 Agent 방향으로 전파된다. 운영 진단에서는 source/sink 이벤트 수와 Active, Rotation Wait, Orphan buffer를 함께 확인한다.

## 5. Fastify 수신

`POST /api/logs`는 단건, 배열, `{ "logs": [...] }`를 지원하며 최대 1,000건을 검증한다.

```text
요청
  → logBatchSchema 검증
  → raw 원문 병렬 저장
  → FILE_RECEIVE / HTTP_RECEIVE 기록
  → equipmentRegistry.excluded 필터
  → logIngestService.processLogBatch
  → TABLE_INSERT / PROCEDURE_CALL 기록
  → 202 응답
```

raw 파일 기본 경로:

```text
C:\data\raw-logs\{equipment_type}\{equipment_id}\{yyyy-MM-dd}\{filename}
```

동일 파일 write는 per-file promise chain으로 직렬화하고, 서로 다른 파일은 병렬 저장한다. `SELECTIVE`는 append, 그 외 유형은 같은 경로에 overwrite한다.

`excluded = true`인 설비는 raw와 수신 이력을 남기지만 Oracle 적재만 건너뛴다.

## 6. Oracle 처리

`logIngestService`는 요청별 최대 30개 worker를 사용한다. 전체 요청이 공유하는 semaphore는 `ORACLE_POOL_MAX - 5`로 동시 Oracle 작업을 제한한다.

### 단건 데이터

`target_type = TABLE`이면 `config/table-registry.json` 매핑으로 동적 INSERT를 실행한다. `PROCEDURE`이면 등록된 NAMED 또는 ARRAY 호출 규약으로 프로시저를 호출한다.

### `data.ROWS` 데이터

| 대상 | 처리 방식 |
|---|---|
| `LOG_ICT`, `LOG_ISCM_ICT`, `LOG_PRESSFIT` | BARCODE별 기존 행 DELETE 후 `executeMany` bulk INSERT |
| 그 외 다중행 테이블 | trigger mutating 오류 방지를 위해 행별 INSERT |
| `SELECTIVE`의 빈 `ROWS` | INSERT 생략 |

중복키 `ORA-00001`은 재전송 중복으로 보고 skip 처리한다.

## 7. 처리 로그와 재처리

정상과 오류는 Oracle 테이블이 아니라 다음 JSONL 파일에 함께 기록한다.

```text
data/process-logs/process-YYYY-MM-DD.jsonl
```

주요 stage:

```text
FILE_RECEIVE, HTTP_RECEIVE, VRL_PARSE, TABLE_INSERT,
PROCEDURE_CALL, PIPELINE_SKIP, LOG_DOWNLOAD
```

write는 50건 또는 250ms 단위로 비동기 flush하며 기본 보존 기간은 30일이다. 오류 레코드에 `RAW_DATA`가 있으면 `/api/monitor/retry` 또는 `/api/monitor/retry/all`로 같은 직접 적재 흐름을 다시 실행한다.

## 8. 하트비트와 설비 상태

```text
Agent Manager
  → POST /api/heartbeat
  → 인메모리 Map 갱신
  → data/heartbeat-snapshot.json 저장
  → data/equipment-registry.json upsert
```

`HEARTBEAT_TTL_SECONDS` 기본값은 60초다. TTL을 넘긴 설비는 삭제하지 않고 offline으로 표시한다. 서버 재시작 시 snapshot을 복원하지만 새 하트비트가 오기 전까지 offline 상태다.

## 9. 신규 설비 추가 체크리스트

1. `vector-config/agent` 또는 `agent-fluent` 설정 생성
2. Aggregator `parse_logs`에 VRL 분기 추가
3. 시뮬레이터로 대표/경계/오류 로그 검증
4. Oracle DDL 또는 프로시저 준비
5. `config/table-registry.json` 타겟·컬럼 매핑 등록
6. `config/parse-fields.json` 동기화
7. 다운로드/설치 후 장비 하트비트 확인
8. 원본 파일, 처리 로그, Oracle 결과를 종단 검증
9. 다중행 BARCODE 교체가 필요하면 trigger 조건을 검토한 뒤 `BARCODE_REPLACE_TABLES` 등록
