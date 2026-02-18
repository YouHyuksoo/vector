# Distributed Multi-Table Log Collection System - PRD

## 1. 개요

설비 PC의 비정형 로그를 중앙 서버로 수집하여, 로그 종류별로 Oracle DB 개별 테이블에 저장하는 시스템.
원본 파일은 서버 로컬에 보관하고, 파싱된 정형 데이터만 DB에 적재하는 구조.

## 2. 기술 스택

| 구성 요소 | 기술 | 역할 |
|-----------|------|------|
| 로그 수집 | Vector (vector.dev) | Agent(설비) + Aggregator(서버) |
| API 서버 | Fastify + TypeScript | 데이터 수신 및 큐 적재 |
| 큐/상태 | Redis + BullMQ | 비동기 작업 처리 + 하트비트 TTL |
| DB | Oracle + node-oracledb | 로그 종류별 개별 테이블 저장 |
| 원본 저장 | 서버 로컬 파일시스템 | raw 로그 파일 보관 |

## 3. 아키텍처

### 데이터 흐름

```
설비 PC (Vector Agent)
  │ file source → tag remap → vector sink (port 6000)
  ▼
서버 (Vector Aggregator)
  │ vector source → VRL parse & tag → file sink (raw 저장)
  │                                  → http sink (POST /api/logs)
  ▼
서버 (Fastify API)
  │ POST /api/logs → LogProducer.addBulk() → Redis/BullMQ
  ▼
서버 (BullMQ Worker)
  │ consume → TableRegistry.getSchema() → DynamicInsert.insert()
  ▼
Oracle DB (LOG_INSPECTION / LOG_ALARM / LOG_PROCESS / LOG_ERROR)
```

### 핵심 설계 결정

- **Fastify** 선택 (Express 대비 5배 성능, 내장 JSON Schema 검증, TypeScript 네이티브)
- **TABLE_COLUMN_REGISTRY** 메타 테이블로 동적 테이블 매핑 (코드 수정 없이 새 로그 타입 추가)
- **executeMany()** Oracle 벌크 삽입 (배치 100건, 타임아웃 5초)
- **디스크 버퍼** Vector 양쪽에서 데이터 유실 방지

## 4. API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/logs | Vector 배치 JSON 수신 → BullMQ 적재 → 202 |
| POST | /api/heartbeat | 장비 상태 → Redis SETEX (TTL 60초) |
| GET | /api/status | 장비 온/오프라인 상태 조회 |
| GET | /api/status/:equipmentId | 개별 장비 상태 조회 |
| GET | /health | 헬스체크 |

## 5. DB 스키마

### 로그 테이블
- **LOG_INSPECTION**: 검사 로그 (파이프 구분 형식)
- **LOG_ALARM**: 알람 로그 (JSON 형식)
- **LOG_PROCESS**: 공정 로그 (CSV 형식)
- **LOG_ERROR**: 삽입 실패 에러 기록

### 메타데이터 테이블
- **TABLE_COLUMN_REGISTRY**: 동적 테이블-컬럼 매핑 (확장성 핵심)

## 6. 에러 전략

| 시나리오 | 대응 |
|---------|------|
| VRL 파싱 실패 | reroute_dropped → 에러 파일 + LOG_PARSE_ERROR |
| API 서버 다운 | Vector 디스크 버퍼 보관 (512MB) |
| DB 삽입 실패 | BullMQ 3회 재시도 → LOG_ERROR 기록 |
| Redis 다운 | IORedis 자동 재연결 (지수 백오프) |

## 7. 환경 설정

`.env` 파일 참조. 주요 설정:
- `ORACLE_CONNECT_STRING`: Oracle 접속 정보
- `REDIS_HOST/PORT`: Redis 접속 정보
- `RAW_LOG_BASE_PATH`: 원본 로그 저장 경로
- `QUEUE_CONCURRENCY`: Worker 동시 처리 수
- `HEARTBEAT_TTL_SECONDS`: 장비 오프라인 판정 시간

## 8. 검증 방법

1. **API**: curl POST /api/logs → 202 응답 + BullMQ 큐 확인
2. **Worker → DB**: Redis 큐 모니터링 → Oracle 테이블 데이터 확인
3. **하트비트**: POST /api/heartbeat → Redis TTL → GET /api/status
4. **에러**: 잘못된 target_table → LOG_ERROR 기록 확인
5. **Vector**: 샘플 로그 → Agent → Aggregator → raw 파일 + HTTP 전송
6. **Shutdown**: SIGINT → 순차적 종료 로그 확인
