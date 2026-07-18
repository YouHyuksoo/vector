# 워크플로우

## 전체 데이터 흐름

```text
설비 로그 파일
  → Vector Agent 또는 Fluent Bit
  → Vector Aggregator (VRL 파싱)
  → POST /api/logs
  → Fastify 검증·원본 저장·Oracle 직접 적재
```

## 단계별 처리

### 1. 설비 PC

Agent가 지정 경로를 감시하고 설비 ID, 설비 유형, 라인, 로그 유형을 붙입니다. Vector Agent는 `:6000`, Fluent Bit은 `:24224`로 중앙 수신기에 전송합니다.

### 2. Vector Aggregator

`equipment_type`에 맞는 VRL로 원문을 구조화하고 TABLE 또는 PROCEDURE 타겟을 지정합니다. API가 느리거나 중단되면 HTTP sink의 disk buffer가 이벤트를 보관합니다.

### 3. Fastify API

`POST /api/logs`가 Zod 스키마로 요청을 검증합니다. 원문은 `C:\data\raw-logs`에 저장하고 처리 단계는 `data/process-logs/*.jsonl`에 기록합니다.

### 4. Oracle 적재

현재 Redis나 별도 큐 worker를 사용하지 않습니다. API 요청 안에서 `config/table-registry.json` 매핑을 기준으로 TABLE INSERT 또는 PROCEDURE CALL을 실행합니다.

## 운영 확인 순서

1. **운영 진단**에서 Backend, Vector, Oracle 연결과 buffer 증가 여부를 확인합니다.
2. **장비 대시보드**에서 Agent 하트비트와 수집 제외 상태를 확인합니다.
3. **시스템 로그**에서 실패 stage와 오류 메시지를 찾습니다.
4. 필요하면 **원본 로그 파일**에서 원문을 확인하고 수동 투입합니다.
