# Agent Monitor - 설비 PC 로컬 웹 UI 설계

> 설비 PC에 설치된 Vector Agent의 상태 확인, 전송 현황 모니터링, TOML 설정 관리를 위한 독립형 로컬 웹 UI

---

## 1. 배경 & 목적

Vector Agent가 설비 PC에 설치된 후, 현장에서 Agent의 동작 상태를 확인할 방법이 없어 불편함.
이를 해결하기 위해 설비 PC에서 브라우저로 접속 가능한 경량 로컬 웹 UI를 제공한다.

### 핵심 기능
1. **Agent 실행 상태** - Running/Stopped, PID, uptime, 메모리 사용량
2. **전송 현황** - events_in/out, errors, buffer 사용량, 전송 성공률
3. **TOML 설정 관리** - 현재 설정 조회, 수정, 저장 (.bak 자동 백업)
4. **프로세스 제어** - Vector Agent 시작/중지/재시작
5. **연결 테스트** - Aggregator 연결 상태 확인

---

## 2. 아키텍처

```
설비 PC (예: AOI-001)
┌─────────────────────────────────────────────┐
│                                             │
│  Vector Agent (:8686 GraphQL API)           │
│    ├── health 체크                           │
│    ├── component_errors_total 메트릭         │
│    └── uptime, events_in/out 등              │
│                                             │
│  Agent Monitor (:9090)                      │
│    ├── Fastify 서버                          │
│    ├── 정적 HTML/JS/CSS 서빙                 │
│    ├── Vector GraphQL API 프록시             │
│    ├── TOML 파일 읽기/쓰기                   │
│    └── Vector 프로세스 제어                   │
│                                             │
│  브라우저 → http://localhost:9090            │
└─────────────────────────────────────────────┘
         │
         │ gRPC (:6000)
         ▼
   중앙 Aggregator 서버
```

### 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 서버 프레임워크 | Fastify | 메인 프로젝트와 동일 (코드/패턴 공유) |
| 프론트엔드 | 단일 HTML + Tailwind CDN + vanilla JS | 빌드 불필요, 설치 최소화 |
| Vector 연동 | GraphQL over HTTP (localhost:8686) | Vector 기본 내장 API |
| 설정 관리 | fs 모듈로 TOML 직접 읽기/쓰기 | 외부 의존성 없음 |
| 프로세스 제어 | child_process | Vector 바이너리 직접 실행 |

---

## 3. 디렉토리 구조

```
agent-monitor/
├── package.json           # 최소 의존성: fastify, @fastify/static
├── src/
│   └── server.ts          # Fastify 서버 + 모든 라우트 (단일 파일)
├── public/
│   └── index.html         # 단일 페이지 UI (HTML + Tailwind CDN + JS)
└── README.md              # 설치/실행 가이드
```

### 배포 방식
1. `agent-monitor/` 폴더를 설비 PC에 복사
2. `npm install` 실행
3. `node dist/server.js` 또는 Windows 서비스로 등록

---

## 4. API 설계

### 4.1 상태 조회

| 엔드포인트 | 메서드 | 응답 |
|-----------|--------|------|
| `/api/status` | GET | Vector health, PID, uptime, version |
| `/api/metrics` | GET | events_in/out, errors, buffer 사용량 |

`/api/status` 응답 예시:
```json
{
  "running": true,
  "pid": 12345,
  "uptime": "2h 35m",
  "version": "0.45.0",
  "apiReachable": true,
  "memory": "45MB"
}
```

`/api/metrics` 응답 예시:
```json
{
  "eventsIn": 1234,
  "eventsOut": 1230,
  "errors": 4,
  "bufferUsed": "12MB",
  "bufferMax": "256MB",
  "bufferPercent": 4.7,
  "sinkHealth": "healthy"
}
```

### 4.2 설정 관리

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/config` | GET | 현재 TOML 설정 파일 내용 (raw text) |
| `/api/config` | PUT | TOML 설정 저장 (.bak 백업 후 덮어쓰기) |

### 4.3 프로세스 제어

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/vector/start` | POST | Vector Agent 시작 |
| `/api/vector/stop` | POST | Vector Agent 중지 |
| `/api/vector/restart` | POST | Vector Agent 재시작 |
| `/api/vector/test-connection` | POST | Aggregator 연결 테스트 |

### 4.4 로그 미리보기

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/logs/recent` | GET | 감시 중인 로그 파일 목록 + 최근 변경 시간 |

---

## 5. UI 설계

### 5.1 레이아웃

단일 페이지, 4개 섹션으로 구성. 디자인은 메인 대시보드의 색상 시스템(oklch) 및 컴포넌트 패턴을 참고하되, Tailwind CDN + vanilla JS로 독립 구현.

```
┌──────────────────────────────────────────────────┐
│  ● AOI-001 Agent Monitor            v0.45  [🌙] │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ ● Running │ │ Uptime   │ │ Memory   │         │
│  │ PID 12345│ │ 2h 35m   │ │ 45MB     │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                  │
│  ┌─── 전송 현황 ──────────────────────────┐      │
│  │  Events In:   1,234  (최근 5분)        │      │
│  │  Events Out:  1,230                    │      │
│  │  Errors:      4                        │      │
│  │  Sink:        ● healthy                │      │
│  │  Buffer:  ━━━━░░░░░░░░░░░  12/256MB   │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  ┌─── TOML 설정 ─────────────────────────┐      │
│  │  [sources.work_logs]                   │      │
│  │    type = "file"                       │      │
│  │    include = ["C:\\logs\\aoi\\*.csv"]  │      │
│  │    ...                                 │      │
│  │                      [저장] [되돌리기] │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  ┌─── 최근 감시 파일 ───────────────────┐       │
│  │  14:23:05 | aoi_result_001.csv   ✓    │       │
│  │  14:23:02 | aoi_result_002.csv   ✓    │       │
│  │  14:22:58 | aoi_alarm_003.csv    ✗    │       │
│  └───────────────────────────────────────┘       │
│                                                  │
│  [시작] [중지] [재시작] [Aggregator 연결 테스트] │
└──────────────────────────────────────────────────┘
```

### 5.2 디자인 시스템

메인 대시보드의 DESIGN_GUIDELINE.md에서 핵심 요소를 차용:

- **색상**: oklch() 기반 CSS 변수 (--primary, --accent, --success, --error 등)
- **다크모드**: `.dark` 클래스 토글, localStorage 저장
- **폰트**: Outfit (Google Fonts CDN), Fira Code (코드 에디터)
- **아이콘**: Material Symbols Outlined
- **둥근 모서리**: rounded-xl (카드), rounded-lg (버튼)
- **그림자**: shadow-sm ~ shadow-lg

### 5.3 자동 새로고침

- 5초 간격으로 `/api/status` + `/api/metrics` 폴링
- 상태 변화 시 시각적 피드백 (색상 전환 애니메이션)

---

## 6. Vector GraphQL API 활용

Vector Agent는 기본적으로 포트 8686에서 GraphQL API를 제공:

```graphql
# 헬스 체크
query { health }

# 컴포넌트 상태
query {
  components {
    sources { componentId componentType }
    transforms { componentId }
    sinks { componentId }
  }
}

# 메트릭
query {
  componentErrorsTotal { componentId metric { counter { value } } }
  sourcesThroughputBytes { componentId throughput { bytes } }
}
```

Agent Monitor 서버가 이 API를 프록시하여 프론트엔드에 가공된 JSON으로 전달.

---

## 7. 설정 파일 관리

### TOML 경로 결정
- 환경변수 `VECTOR_CONFIG_PATH` 또는 기본값 `C:\vector\config\vector.toml`
- Agent Monitor 시작 시 설정 파일 경로를 콘솔에 출력

### 저장 프로세스
1. 기존 파일을 `.bak` 확장자로 백업
2. 새 내용을 원본 파일에 덮어쓰기
3. Vector 재시작은 사용자가 명시적으로 버튼 클릭 시에만 수행

---

## 8. 프로세스 제어

### Vector 시작
```bash
vector --config C:\vector\config\vector.toml
```

### Vector 중지
- PID 파일 또는 프로세스 목록에서 vector 프로세스 찾아 kill

### Aggregator 연결 테스트
- TOML에서 sink address(Aggregator IP:6000) 파싱
- TCP 소켓 연결 시도로 reachability 확인

---

## 9. 제약사항 & 고려사항

1. **Node.js 필수**: 설비 PC에 Node.js 18+ 설치 필요
2. **단일 사용자**: 설비 PC 로컬에서만 접속 (보안 고려 불필요)
3. **경량**: 의존성 최소화 (fastify, @fastify/static 정도)
4. **Vector API 의존**: Vector Agent가 실행 중이어야 상태/메트릭 조회 가능
5. **빌드 불필요**: HTML은 정적 파일로 제공, TypeScript는 tsc로 단순 컴파일

---

> **문서 생성일**: 2026-02-20
> **관련 문서**: docs/ARCHITECTURE.md, docs/DESIGN_GUIDELINE.md
