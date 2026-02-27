# Fastify 서버

## 개요

Fastify는 이 시스템의 **중앙 허브** 서버입니다 (포트 3100).
설비에서 수집한 로그를 수신하여 Oracle DB에 적재하고, 모든 설정 관리와 모니터링 API를 제공합니다.

## 아키텍처

```
설비 PC (Vector Agent)
    ↓ 로그 전송
서버 (Vector Aggregator)
    ↓ HTTP 전달
Fastify 서버 (포트 3100)  ← 이 서버
    ├── BullMQ 큐 (Redis)
    │     ↓ 비동기 처리
    │   Oracle DB 적재
    ├── 설정 관리 (TOML, JSON)
    ├── VRL 시뮬레이션
    ├── AI 연동
    └── 모니터링 API → Next.js 프론트엔드
```

## 부트스트랩 순서

서버 시작 시 다음 순서로 초기화됩니다:

1. **Oracle 커넥션 풀 생성** — 최소 4, 최대 20개 연결
2. **Fastify 인스턴스 생성** — 라우트 등록, 플러그인 로드
3. **BullMQ Worker 시작** — Redis 기반 큐 워커
4. **Graceful Shutdown 등록** — SIGINT/SIGTERM 핸들러
5. **HTTP 수신 시작** — 포트 3100에서 리스닝

## 핵심 기능

### 1. 로그 수신 & 큐 적재

Vector Aggregator가 파싱된 로그를 HTTP로 전송하면 Fastify가 이를 수신합니다.

```
POST /api/logs
```

| 단계 | 설명 |
|------|------|
| 유효성 검증 | Zod 스키마로 로그 배치 검증 |
| 큐 적재 | BullMQ 큐에 비동기 적재 (즉시 응답 202) |
| 우선순위 | ALARM 로그 → 우선순위 1 (최우선), 나머지 → 5 |
| 재시도 | 실패 시 3회 재시도 (지수 백오프: 1초 → 2초 → 4초) |

### 2. 큐 워커: DB 적재

BullMQ 워커가 큐에서 로그를 꺼내 Oracle DB에 저장합니다.

**TABLE 모드**:
- `table-registry.json`의 매핑 정보로 INSERT SQL 자동 생성
- `executeMany`로 벌크 삽입 지원
- 부분 실패 허용 (`batchErrors: true`)

**PROCEDURE 모드**:
- **NAMED**: 파라미터명으로 호출 (`BEGIN PKG.PROC(:P1, :P2); END;`)
- **ARRAY**: Oracle Collection 타입으로 배열 전달

**실패 시**:
- `LOG_ERROR` 테이블에 오류 상세 기록
- BullMQ가 자동 재시도 처리
- 최대 재시도 횟수 초과 시 Failed 상태로 보관

### 3. 하트비트 & 설비 상태 관리

```
POST /api/heartbeat
```

| 항목 | 설명 |
|------|------|
| 수신 | 설비 Agent가 주기적으로 하트비트 전송 |
| 저장 | Redis `SETEX`로 TTL 기반 저장 (기본 60초) |
| 판정 | TTL 만료 = 오프라인, 존재 = 온라인 |
| 조회 | `GET /api/status`로 전체 설비 상태 일괄 조회 |

### 4. 통합 모니터링 API

```
GET /api/monitor/overview
```

한 번의 호출로 시스템 전체 상태를 반환합니다:

| 항목 | 내용 |
|------|------|
| `server` | 운영 시간, 환경 (development/production) |
| `redis` | 연결 상태 |
| `vector` | 실행 여부, PID, API 도달성, 버전 |
| `queue` | 대기/처리중/완료/실패 건수 |
| `equipments` | 설비 온라인/오프라인 목록 |
| `tables` | 등록된 Oracle 테이블 목록 |
| `recentErrors` | 최근 오류 |

### 5. Vector 프로세스 관리

| 엔드포인트 | 동작 |
|------------|------|
| `GET /api/monitor/vector` | Vector 상태 조회 (PID, 버전, 가동 시간) |
| `POST /api/monitor/vector/start` | Vector 엔진 시작 (`spawn` + detached) |
| `POST /api/monitor/vector/stop` | Vector 엔진 중지 (`taskkill`) |

Vector API(`/health`)와 GraphQL을 통해 상태를 확인합니다.

### 6. TOML 설정 관리

#### Aggregator (수신기)

| 엔드포인트 | 동작 |
|------------|------|
| `GET /api/monitor/aggregator/config` | 현재 TOML 설정 읽기 |
| `PUT /api/monitor/aggregator/config` | 저장 (자동 백업 생성) |
| `GET /api/monitor/aggregator/backups` | 백업 이력 조회 |
| `POST /api/monitor/aggregator/backups/:name/restore` | 백업 복구 |

- 백업은 타임스탬프 기반으로 최대 20개 보관
- 초과 시 오래된 백업 자동 삭제

#### Agent (송신기)

| 엔드포인트 | 동작 |
|------------|------|
| `GET /api/monitor/agent/configs` | 전체 설비 목록 |
| `POST /api/monitor/agent/configs` | 새 설비 생성 (기본 템플릿) |
| `GET /api/monitor/agent/config/:name` | 특정 설비 TOML 읽기 |
| `PUT /api/monitor/agent/config/:name` | 저장 (.bak 백업) |
| `DELETE /api/monitor/agent/config/:name` | 삭제 |
| `GET /api/monitor/agent/config/:name/download` | TOML 다운로드 |

### 7. 테이블/프로시져 매핑 관리

매핑 정보는 로컬 JSON 파일(`config/table-registry.json`)에 저장됩니다.

| 엔드포인트 | 동작 |
|------------|------|
| `GET /api/monitor/tables/oracle/all` | Oracle 전체 테이블 조회 |
| `GET /api/monitor/tables/oracle/:name/columns` | 테이블 컬럼 메타데이터 |
| `POST /api/monitor/registry` | 테이블 컬럼 매핑 저장 |
| `GET /api/monitor/procedures/oracle/all` | Oracle 전체 프로시져 조회 |
| `POST /api/monitor/procedures` | 프로시져 매핑 저장 |

워커가 로그를 적재할 때 이 레지스트리를 참조하여 INSERT SQL이나 PROCEDURE 호출문을 동적으로 생성합니다.
스키마는 5분 캐시로 매번 파일을 읽지 않습니다.

### 8. VRL 시뮬레이터

| 엔드포인트 | 동작 |
|------------|------|
| `GET /api/monitor/vrl/code/:equipmentType` | 기존 VRL 코드 조회 |
| `POST /api/monitor/vrl/simulate` | VRL 코드 테스트 실행 |
| `POST /api/monitor/vrl/apply` | TOML에 VRL 코드 반영 + 파싱 룰 동기화 |

**시뮬레이션 동작 순서**:
1. 임시 파일 생성 (입력 JSON + VRL 프로그램)
2. `vector vrl --input ... --program ... --print-object` 실행
3. stdout에서 JSON 추출 → `.data.*` 필드 파싱
4. 결과 반환

**TOML 적용 순서**:
1. aggregator.toml의 `[transforms.parse_logs]` 블록 탐색
2. 해당 설비 유형의 `if .equipment_type == "TYPE" { ... }` 블록 교체
3. 중괄호 깊이 추적으로 정확한 블록 경계 감지
4. TOML 저장 (백업 먼저) + 파싱 룰 JSON 동기화

### 9. AI VRL 코드 생성

| 엔드포인트 | 동작 |
|------------|------|
| `GET /api/monitor/ai/config` | AI 설정 조회 (API 키 마스킹) |
| `PUT /api/monitor/ai/config` | AI 설정 저장 |
| `POST /api/monitor/ai/test` | API 연결 테스트 |
| `POST /api/monitor/ai/generate-vrl` | VRL 코드 자동 생성 |

**지원 AI 모델**:

| 제공사 | 모델 |
|--------|------|
| Google Gemini | gemini-2.5-flash 등 |
| Mistral AI | mistral-large-latest 등 |
| Anthropic Claude | claude-sonnet-4 등 |

샘플 로그 + 설비 유형 + 사용자 지시를 보내면 VRL 파싱 코드가 자동 생성됩니다.

### 10. 시스템 설정 (환경변수)

```
GET /api/monitor/config  — 현재 설정 조회
PUT /api/monitor/config  — .env 파일 업데이트
```

| 그룹 | 설정 키 |
|------|---------|
| 서버 | HOST, PORT, NODE_ENV |
| Oracle | USER, PASSWORD, CONNECT_STRING, POOL_MIN, POOL_MAX |
| Redis | HOST, PORT, PASSWORD |
| 큐 | CONCURRENCY, BATCH_SIZE, BATCH_TIMEOUT_MS |
| 저장소 | RAW_LOG_BASE_PATH |
| 하트비트 | TTL_SECONDS |

- 비밀번호는 마스킹하여 반환
- Oracle/Redis 관련 키 변경 시 서버 재시작 필요
- `updateEnvValue()`로 메모리에도 즉시 반영

### 11. 파일 다운로드

| 엔드포인트 | 동작 |
|------------|------|
| `GET /api/monitor/download/vector-zip` | Vector 실행파일 (vector.zip) |
| `GET /api/monitor/download/agent/:name` | 설비별 Agent TOML |

### 12. 에러 로그

| 엔드포인트 | 동작 |
|------------|------|
| `DELETE /api/monitor/errors` | LOG_ERROR 테이블 전체 삭제 |

큐 워커가 DB 적재 실패 시 자동으로 `LOG_ERROR` 테이블에 기록합니다.

## Graceful Shutdown

서버 종료 시 다음 순서로 안전하게 종료됩니다:

1. **Fastify** — 새 요청 수신 차단
2. **BullMQ 워커/큐** — 진행 중인 작업 완료 대기 후 종료
3. **Oracle 커넥션 풀** — 연결 반환 후 풀 닫기
4. **Redis 연결** — 종료

> SIGINT(Ctrl+C) 또는 SIGTERM 시그널에 반응합니다.

## 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| Fastify | 5.x | HTTP 서버 프레임워크 |
| oracledb | 6.x | Oracle DB 드라이버 |
| BullMQ | 5.x | Redis 기반 작업 큐 |
| ioredis | 5.x | Redis 클라이언트 |
| Zod | 3.x | 런타임 스키마 검증 |
| Pino | 9.x | 구조화 로깅 |
| dotenv | 16.x | 환경변수 관리 |
