# Vector Log Collection System - 아키텍처 및 실행 가이드

## 📋 프로젝트 개요

**Vector Log Collection System**은 공장 설비 PC의 로그를 **실시간 수집 → 파싱 → DB 저장**하는 분산 로그 파이프라인입니다.
Vector Agent/Aggregator + Fastify v5 + BullMQ + Oracle DB 기반의 풀스택 시스템입니다.

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        설비 PC (여러 대)                             │
│                                                                     │
│  C:\logs\inspection\*.log   ──┐                                     │
│  C:\logs\alarm\*.log        ──┼── Vector Agent (:8686)              │
│  C:\logs\process\*.log      ──┘   (파일 감시 + 메타데이터 태깅)       │
│                                        │                            │
└────────────────────────────────────────┼────────────────────────────┘
                                         │ gRPC (Vector 프로토콜)
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        중앙 서버                                     │
│                                                                     │
│  Vector Aggregator (:6000)                                          │
│    ├── VRL 파싱 (INSPECTION: 파이프구분, ALARM: JSON, PROCESS: CSV)   │
│    ├── Sink 1: Raw 파일 저장 (C:\data\raw-logs\{장비ID}\날짜\)       │
│    └── Sink 2: HTTP POST ──────────────────┐                        │
│                                             ▼                       │
│  Node.js API Server (:3100)  ←── Fastify v5                        │
│    ├── POST /api/logs          → Zod 검증 → BullMQ 큐 적재          │
│    ├── POST /api/heartbeat     → Redis SETEX (TTL 갱신)             │
│    ├── GET  /api/status        → Redis에서 장비 온라인 상태 조회      │
│    └── GET  /health            → 서버 헬스체크                       │
│                                             │                       │
│  BullMQ Worker                              │                       │
│    └── 큐에서 소비 → DynamicInsert ─────────┼──→ Oracle DB           │
│                      (target_table 기반     │     ├── LOG_INSPECTION │
│                       동적 INSERT)          │     ├── LOG_ALARM      │
│                                             │     ├── LOG_PROCESS    │
│  Redis (:6379) ◄────────────────────────────┘     └── LOG_ERROR     │
│    ├── BullMQ 작업 큐                                                │
│    └── Heartbeat TTL 저장                                           │
└─────────────────────────────────────────────────────────────────────┘
```

## 🛠️ 기술 스택

| 분류 | 기술 | 역할 |
|------|------|------|
| **로그 수집** | Vector Agent 0.45 | 설비 PC 로그 파일 감시 + 메타데이터 태깅 |
| **로그 중계** | Vector Aggregator | VRL 파싱 + Raw 파일 백업 + API 전송 |
| **API 서버** | Fastify v5 + Zod | HTTP 수신 + 요청 검증 |
| **작업 큐** | BullMQ + Redis | 비동기 작업 큐잉 + 재시도 관리 |
| **상태 관리** | Redis | 장비 하트비트 TTL 기반 온/오프라인 판정 |
| **DB 저장** | Oracle DB + oracledb | target_table 기반 동적 INSERT |
| **언어** | TypeScript 5 | 타입 안전한 서버 코드 |

## 📁 프로젝트 구조

```
C:\Project\vector\
├── docs/                          # 📄 문서
│   ├── PRD.md                     # 요구사항 정의서
│   └── ARCHITECTURE.md            # 아키텍처 가이드 (이 문서)
├── sql/                           # 🗄️ Oracle DDL
│   ├── 01_create_tables.sql       # 로그 테이블 생성
│   ├── 02_create_metadata.sql     # 메타데이터 테이블
│   ├── 03_create_error_log.sql    # 에러 로그 테이블
│   └── 04_create_indexes.sql      # 인덱스 생성
├── src/
│   ├── config/                    # ⚙️ 설정
│   │   ├── env.ts                 # 환경 변수 검증 (Zod)
│   │   └── constants.ts           # 상수 정의
│   ├── database/                  # 🗄️ DB 접근 계층
│   │   ├── oracle.pool.ts         # Oracle 커넥션 풀
│   │   ├── dynamic-insert.ts      # 동적 INSERT (단건/벌크)
│   │   ├── table-registry.ts      # 테이블 스키마 캐시
│   │   └── repositories/          # 리포지토리 패턴
│   ├── queue/                     # 📮 BullMQ 작업 큐
│   │   ├── producers/log.producer.ts    # 큐 적재
│   │   ├── workers/log-insert.worker.ts # 큐 소비 → DB 삽입
│   │   └── queue.manager.ts             # 큐/워커 관리
│   ├── redis/                     # 🔴 Redis
│   │   ├── redis.client.ts        # 클라이언트
│   │   └── heartbeat.service.ts   # 하트비트 TTL 관리
│   ├── schemas/                   # ✅ Zod 검증
│   │   └── log-ingest.schema.ts   # 요청 검증 스키마
│   ├── server/                    # 🌐 Fastify 서버
│   │   ├── app.ts                 # 앱 팩토리
│   │   ├── plugins/               # 플러그인 (health, error-handler)
│   │   └── routes/                # API 라우트
│   ├── services/                  # 💼 비즈니스 로직
│   ├── types/                     # 📝 TypeScript 타입 정의
│   ├── utils/                     # 🔧 유틸리티 (로거, 재시도, 셧다운)
│   └── index.ts                   # 🚀 앱 진입점 (부트스트랩)
├── vector-config/                 # 📡 Vector 설정
│   ├── agent/vector-agent.toml         # Agent 설정
│   └── aggregator/vector-aggregator.toml # Aggregator 설정
├── vector-bin/                    # 📦 Vector 바이너리 (.gitignore)
├── .env.example                   # 환경 변수 템플릿
├── package.json
└── tsconfig.json
```

## 🚀 실행 순서

시스템 의존성에 따라 아래 순서로 실행해야 합니다.

```
① Redis  →  ② Oracle DB  →  ③ Node.js API  →  ④ Vector Aggregator  →  ⑤ Vector Agent
```

| 순서 | 컴포넌트 | 의존 대상 | 포트 |
|------|----------|----------|------|
| ① | Redis | - | 6379 |
| ② | Oracle DB | - | 1521 |
| ③ | Node.js API | Redis, Oracle | 3100 |
| ④ | Vector Aggregator | Node.js API | 6000 (gRPC), 8687 (API) |
| ⑤ | Vector Agent | Aggregator | 8686 (API) |

## 📖 실행 방법

### 1️⃣ 사전 준비

```bash
# Redis 실행 확인 (기본 127.0.0.1:6379)
redis-cli ping   # → PONG

# Oracle DB 실행 확인

# 환경 변수 설정
cp .env.example .env
# .env 파일에서 Oracle 접속 정보 수정

# Oracle 테이블 생성 (최초 1회)
# sql/ 디렉토리의 DDL 파일을 순서대로 실행
```

### 2️⃣ Node.js API 서버

```bash
# 패키지 설치
npm install

# 개발 모드 (핫리로드)
npm run dev

# 프로덕션
npm run build
npm start
```

✅ 정상 기동 로그:
```
INFO: Oracle pool ready
INFO: BullMQ worker started
INFO: Server is running  address="http://127.0.0.1:3100"
```

### 3️⃣ Vector Aggregator (중앙 서버)

```bash
vector-bin\bin\vector.exe --config vector-config\aggregator\vector-aggregator.toml
```

✅ 정상 기동 로그:
```
INFO vector: Vector has started.
INFO Building gRPC server. address=0.0.0.0:6000
INFO API server running. address=0.0.0.0:8687
```

### 4️⃣ Vector Agent (설비 PC)

```bash
# 장비 ID 환경 변수 설정 (필수)
set EQUIPMENT_ID=EQ-001

# Agent 실행 전 vector-agent.toml에서 Aggregator 주소 수정
# address = "AGGREGATOR_SERVER_IP:6000" → 실제 서버 IP로 변경

vector-bin\bin\vector.exe --config vector-config\agent\vector-agent.toml
```

✅ 정상 기동 로그:
```
INFO vector: Vector has started.
INFO Starting file server. include=["C:\\logs\\inspection\\*.log"]
INFO Starting file server. include=["C:\\logs\\alarm\\*.log"]
INFO Starting file server. include=["C:\\logs\\process\\*.log"]
```

## 🔄 데이터 흐름

### 📥 로그 수집 흐름

```
설비 로그 파일 (*.log)
  → Vector Agent (파일 감시 + equipment_id/log_type/target_table 태깅)
    → Vector Aggregator (gRPC :6000 수신)
      → VRL 파싱 (로그 타입별 파싱 로직)
        → 💾 Raw 파일 백업 (C:\data\raw-logs\{장비ID}\YYYY\MM\DD\raw.log)
        → 🌐 HTTP POST → Node.js API (POST /api/logs)
          → ✅ Zod 스키마 검증
          → 📮 BullMQ 큐 적재 (202 Accepted 즉시 응답)
          → ⚙️ Worker가 큐에서 소비
          → 🗄️ DynamicInsert로 Oracle DB 삽입 (target_table 기반)
```

### 💓 하트비트 흐름

```
설비 PC → POST /api/heartbeat { equipment_id, timestamp, metadata }
  → 🔴 Redis SETEX (TTL=60초)
  → ⏰ TTL 만료 시 자동 오프라인 판정

모니터링 → GET /api/status → Redis TTL 조회 → 장비 온/오프라인 상태 반환
```

### 📊 로그 타입별 형식

| log_type | 원본 형식 | 파싱 방식 | target_table |
|----------|----------|----------|-------------|
| INSPECTION | `timestamp\|item\|value\|unit\|result` | 파이프(`\|`) 구분 | LOG_INSPECTION |
| ALARM | `{"code":"...","level":"...","message":"..."}` | JSON 파싱 | LOG_ALARM |
| PROCESS | `step,status,start_time,end_time,duration` | CSV 구분 | LOG_PROCESS |

## 🌐 API 엔드포인트

| Method | Path | 설명 | 응답 |
|--------|------|------|------|
| GET | `/health` | 서버 헬스체크 | `{ status, uptime, timestamp }` |
| POST | `/api/logs` | 로그 배치 수신 | `{ accepted: N, timestamp }` (202) |
| POST | `/api/heartbeat` | 장비 하트비트 | `{ status: "ok" }` (200) |
| GET | `/api/status` | 전체 장비 상태 | `{ equipments: [...] }` |
| GET | `/api/status/:equipmentId` | 개별 장비 상태 | `{ equipment_id, online, last_seen }` |

### 📤 로그 수신 형식 (`POST /api/logs`)

**Vector 배열 형식** (Aggregator에서 전송):
```json
[
  {
    "equipment_id": "EQ-001",
    "log_type": "INSPECTION",
    "target_table": "LOG_INSPECTION",
    "timestamp": "2026-02-19T03:15:00Z",
    "data": { "INSPECT_ITEM": "PRESSURE_CHECK", "INSPECT_VALUE": "4.52" }
  }
]
```

**수동 테스트 형식**:
```json
{
  "logs": [
    {
      "equipment_id": "EQ-001",
      "log_type": "ALARM",
      "target_table": "LOG_ALARM",
      "timestamp": "2026-02-19T03:15:10Z",
      "data": { "ALARM_CODE": "ALM-001", "ALARM_LEVEL": "warning" }
    }
  ]
}
```

## ⚙️ 환경 변수 (.env)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | 3100 | API 서버 포트 |
| `HOST` | 0.0.0.0 | API 서버 바인드 주소 |
| `NODE_ENV` | development | 실행 환경 |
| `ORACLE_USER` | - | Oracle 사용자명 |
| `ORACLE_PASSWORD` | - | Oracle 비밀번호 |
| `ORACLE_CONNECT_STRING` | - | Oracle 접속 문자열 (예: `localhost:1521/ORCL`) |
| `ORACLE_POOL_MIN` | 4 | Oracle 커넥션 풀 최소 |
| `ORACLE_POOL_MAX` | 20 | Oracle 커넥션 풀 최대 |
| `REDIS_HOST` | 127.0.0.1 | Redis 호스트 |
| `REDIS_PORT` | 6379 | Redis 포트 |
| `REDIS_PASSWORD` | (빈값) | Redis 비밀번호 |
| `QUEUE_CONCURRENCY` | 5 | BullMQ Worker 동시 처리 수 |
| `BATCH_SIZE` | 100 | 배치 처리 크기 |
| `BATCH_TIMEOUT_MS` | 5000 | 배치 타임아웃 (ms) |
| `HEARTBEAT_TTL_SECONDS` | 60 | 하트비트 TTL (초) |

## 🚨 장애 대응

| 상황 | 동작 | 복구 방식 |
|------|------|----------|
| 🔴 Node.js API 다운 | Aggregator 디스크 버퍼에 보관 (512MB) | API 복구 시 자동 재전송 |
| 🔴 Aggregator 다운 | Agent 디스크 버퍼에 보관 (256MB) | Aggregator 복구 시 자동 재전송 |
| 🔴 Oracle DB 다운 | BullMQ 큐에 보관 | Worker가 자동 재시도 |
| ⚠️ DB INSERT 실패 | LOG_ERROR 테이블에 에러 기록 | BullMQ 재시도 |
| ⚠️ 설비 PC 오프라인 | Redis 하트비트 TTL 만료 | 자동 오프라인 판정 |

## 🔧 트러블슈팅

### 1. Fastify 로거 오류

**증상**: `FST_ERR_LOG_INVALID_LOGGER_CONFIG`

**원인**: Fastify v5에서 `logger` 옵션에 pino 인스턴스 직접 전달

**해결**: `logger` → `loggerInstance`로 변경
```typescript
// ❌ 틀림
const app = Fastify({ logger });

// ✅ 올바름
const app = Fastify({ loggerInstance: logger });
```

### 2. Vector 포트 충돌

**증상**: `error creating server listener: 각 소켓 주소는 하나만 사용할 수 있습니다 (os error 10048)`

**원인**: 이전 Vector 프로세스가 포트 점유 중

**해결**:
```powershell
# Vector 프로세스 전체 종료
Get-Process vector -ErrorAction SilentlyContinue | Stop-Process -Force

# 버퍼 락 파일 정리 후 재시작
rm -rf vector-data/buffer
```

### 3. Vector Agent 파일 무시

**증상**: `Currently ignoring file too small to fingerprint`

**원인**: `fingerprint.lines` 설정보다 파일 줄 수가 적음

**해결**: `vector-agent.toml`에서 `fingerprint.lines = 1`로 변경

### 4. Vector VRL 파싱 오류

**증상**: `unnecessary error coalescing operation` 또는 `unhandled fallible assignment`

**해결**: VRL 함수에 `!` (infallible) 연산자 사용
```
# ❌ 틀림
.data.ALARM_CODE = to_string(parsed.code ?? "")

# ✅ 올바름
.data.ALARM_CODE = to_string!(parsed.code)
```

## ⭐ 필수 체크리스트

### 최초 설치 시

1. ✅ Redis 설치 및 실행
2. ✅ Oracle DB 설치 및 DDL 실행 (`sql/` 디렉토리)
3. ✅ `.env` 파일 생성 및 접속 정보 설정
4. ✅ `npm install` 패키지 설치
5. ✅ Vector 바이너리 다운로드 (`vector-bin/`)

### 설비 PC Agent 배포 시

1. ✅ Vector 바이너리 복사
2. ✅ `vector-agent.toml` 복사 후 Aggregator IP 주소 변경
3. ✅ `EQUIPMENT_ID` 환경 변수 설정 (장비별 고유 ID)
4. ✅ 로그 디렉토리 경로 확인 (`C:\logs\*`)

### ❌ 절대 하지 말 것

- Fastify v5에서 `logger` 옵션에 pino 인스턴스 직접 전달 → `loggerInstance` 사용
- Vector 설정의 `Content-Type` 헤더를 배열로 지정 → 문자열 사용
- VRL에서 `??` 연산자를 fallible 표현식 없이 사용 → `!` 연산자 사용
- `data_dir` 미지정 상태로 Vector 실행 → Windows 경로 명시 필수

### ✅ 반드시 할 것

- 서비스 실행 전 의존 서비스 상태 확인 (Redis, Oracle)
- Vector 설정 변경 후 `vector validate` 검증 실행
- 장비 추가 시 `EQUIPMENT_ID` 환경 변수 고유하게 설정
- 프로덕션 배포 시 디스크 버퍼 경로 및 용량 확인
