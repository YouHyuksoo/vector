# Fastify 서버

## 역할

Fastify 백엔드는 Vector Aggregator와 웹 대시보드 사이의 운영 API이며, Oracle 적재를 직접 수행합니다.

```text
Vector HTTP sink → :3110/api/logs → 검증 → raw 저장 → Oracle → 처리 로그
Next.js Dashboard → /api/monitor/* → 설정·상태·로그·VRL 관리
```

## 시작 순서

1. `.env` 로드와 환경변수 검증
2. Oracle Thin mode pool 초기화
3. Fastify 라우트 등록과 서버 시작
4. Vector Aggregator가 실행 중이 아니면 자동 시작 시도

## 로그 수신

`POST /api/logs`는 단건, 배열, `{ "logs": [...] }` 형식을 지원하며 최대 1,000건을 검증합니다. 처리 흐름은 다음과 같습니다.

1. Zod 검증
2. 원본 파일 저장
3. 설비 레지스트리의 수집 제외 여부 확인
4. TABLE INSERT 또는 PROCEDURE CALL
5. JSONL 처리 로그 기록 후 `202 Accepted`

## 주요 저장 위치

| 항목 | 위치 |
|---|---|
| 원본 로그 | `C:\data\raw-logs\{equipment_type}\{equipment_id}\{date}` |
| 처리/오류 로그 | `data/process-logs/process-YYYY-MM-DD.jsonl` |
| 설비 레지스트리 | `data/equipment-registry.json` |
| 하트비트 스냅샷 | `data/heartbeat-snapshot.json` |
| 테이블/프로시저 매핑 | `config/table-registry.json` |

## 주요 포트

| 포트 | 용도 |
|---:|---|
| 3110 | Fastify API |
| 3100 | Next.js 대시보드 |
| 6000 | Vector Agent 수신 |
| 24224 | Fluent Bit 수신 |
| 8687 | Aggregator API |
| 9090 | 설비 PC Agent Manager |

## 종료

SIGINT/SIGTERM 수신 시 Vector, Fastify, Oracle pool 순으로 종료하고 대기 중인 처리 로그를 flush합니다.
