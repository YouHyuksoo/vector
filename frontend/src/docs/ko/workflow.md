# 워크플로우

## 전체 데이터 흐름

```
설비 로그 파일 → Agent(Vector) → Aggregator(Vector) → Fastify API → Oracle DB
```

## 단계별 프로세스

### 1단계: 로그 수집 (Agent)

각 설비 PC에 설치된 Vector Agent가 로그 파일을 감시합니다.

- **file source**: 지정된 경로의 로그 파일을 tail 방식으로 읽음
- 새로운 줄이 추가되면 실시간으로 감지
- 메타데이터(설비 유형, 라인 코드, 설비 ID) 자동 첨부

### 2단계: 로그 전송 (Agent → Aggregator)

Agent가 수집한 로그를 Aggregator 서버로 전송합니다.

- **vector sink**: TCP 기반의 Vector 네이티브 프로토콜 사용
- 네트워크 장애 시 자동 재시도 및 버퍼링
- 배치 전송으로 네트워크 효율 최적화

### 3단계: 로그 파싱 (Aggregator)

Aggregator에서 VRL(Vector Remap Language)을 이용해 로그를 파싱합니다.

- 설비 유형별 VRL 파싱 코드 적용
- CSV, 고정 길이, 키-값 등 다양한 포맷 지원
- 파싱 결과를 구조화된 JSON 필드로 변환

### 4단계: API 전달 (Aggregator → Fastify)

파싱된 데이터를 HTTP API로 Fastify 서버에 전달합니다.

- JSON 인코딩된 배치 전송
- 실패 시 지수 백오프(exponential backoff) 재시도

### 5단계: DB 적재 (Fastify → Oracle)

Fastify 서버가 데이터를 Oracle DB에 저장합니다.

- **TABLE 모드**: 테이블에 직접 INSERT
- **PROCEDURE 모드**: 프로시져 호출로 비즈니스 로직 실행
- BullMQ 큐를 통한 비동기 처리로 안정성 보장

## 모니터링 포인트

| 위치 | 확인 사항 |
|------|-----------|
| 대시보드 | 인프라 상태 (서버, Redis, Oracle, Vector) |
| 큐 현황 | 대기/처리중/완료/실패 건수 |
| 장비 수집기 | Agent 하트비트 및 온라인 상태 |
| 오류 현황 | 적재 실패 로그 |
