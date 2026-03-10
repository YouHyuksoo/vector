# Vector Agent Manager 설계 문서

## 개요

기존 agent-monitor를 **Vector Agent Manager**로 확장. 단일 exe로 장비 PC에서 Vector Agent의 설치/설정/모니터링/제어를 모두 수행. Node.js 설치 불필요.

## 주요 기능

| 기능 | 설명 |
|------|------|
| **설치** | 마스터 서버에서 vector.exe 다운로드 + 기본 TOML 생성 |
| **초기 설정** | 설비 정보(ID/타입/IP/라인/로그경로/서버주소) 입력 → TOML 자동 생성 |
| **설정 편집** | 폼 모드 (필드별 입력) + TOML 직접 편집 모드 |
| **모니터링** | Vector 실행 상태, PID, uptime, 전송 메트릭 표시 |
| **프로세스 제어** | Vector 시작/중지/재시작, 연결 테스트 |
| **서비스 등록** | Vector + agent-manager를 Windows 서비스로 등록/해제 (`sc create`) |
| **업데이트** | 마스터 서버에서 최신 vector.exe 버전 확인 + 다운로드 교체 |
| **원격 관리** | 마스터 서버 Equipment 페이지에서 프록시로 원격 제어 |

## 아키텍처

```
agent-manager.exe (포트 9090)
├── API 서버 (Fastify)
│   ├── /api/status          — Vector 상태 (기존)
│   ├── /api/metrics         — 전송 메트릭 (기존)
│   ├── /api/config          — TOML 읽기/쓰기 (기존)
│   ├── /api/vector/*        — 프로세스 제어 (기존)
│   ├── /api/logs/recent     — 감시 파일 목록 (기존)
│   ├── /api/setup           — 초기 설정 + 설비 정보 편집 (신규)
│   ├── /api/install         — Vector 다운로드/설치 (신규)
│   ├── /api/update          — Vector 업데이트 확인/실행 (신규)
│   └── /api/service/*       — Windows 서비스 등록/해제 (신규)
├── 웹 UI (public/)
│   ├── 상태 탭              — 실행 상태 + 메트릭 (자동 갱신)
│   ├── 설정 탭              — 폼 모드 + TOML 직접 편집 모드
│   └── 관리 탭              — 서비스 등록, 업데이트, 설치, 제어
└── .env                     — 로컬 환경 설정
```

## 마스터 서버 추가 API

```
GET /api/monitor/agent-download/vector     — vector.exe 바이너리 다운로드
GET /api/monitor/agent-download/version    — 현재 제공 중인 vector.exe 버전 정보
```

서버의 `vector-bin/` 디렉토리에 vector.exe를 호스팅.

## 웹 UI (public/) 구성

단일 HTML + JS. 프레임워크 없이 바닐라로 유지 (exe 크기 최소화).

### 상태 탭
- Vector 실행 여부 (ON/OFF), PID, uptime, version
- 전송 메트릭: 수신/전송 이벤트 수, 에러 수
- 10초 자동 갱신

### 설정 탭
- **폼 모드**: equipment_id, equipment_type, IP, line_code, log_type, 로그 경로, 서버 주소/포트 입력 → TOML 자동 반영 (heartbeat tags + add_metadata 동시 동기화)
- **TOML 편집 모드**: 원본 TOML 텍스트 직접 편집
- 저장 시 .bak 백업 + "재시작 필요" 안내

### 관리 탭
- Vector 시작/중지/재시작 버튼
- Aggregator 연결 테스트
- Windows 서비스 등록/해제 (Vector + agent-manager)
- Vector 설치: 마스터 서버에서 다운로드 + 경로 설정
- Vector 업데이트: 버전 확인 + 다운로드 교체

## Windows 서비스 등록

```powershell
sc create VectorAgentManager binPath= "C:\vector\agent-manager.exe" start= auto
sc create VectorAgent binPath= "C:\vector\bin\vector.exe --config C:\vector\config\vector.toml" start= auto
```

API: `POST /api/service/install`, `POST /api/service/uninstall`, `GET /api/service/status`

## 파일 구조

```
agent-manager/  (agent-monitor에서 이름 변경)
├── src/
│   ├── server.ts              (기존 유지, 이름만 변경)
│   └── routes/
│       ├── status.ts          (기존 유지)
│       ├── config.ts          (기존 유지)
│       ├── control.ts         (기존 유지)
│       ├── logs.ts            (기존 유지)
│       ├── setup.ts           (신규) 초기 설정 + 설비 정보 TOML 반영
│       ├── install.ts         (신규) Vector 다운로드/설치
│       ├── update.ts          (신규) Vector 업데이트 확인/실행
│       └── service.ts         (신규) Windows 서비스 등록/해제
├── public/
│   ├── index.html             (전면 개편) 탭 기반 대시보드
│   └── app.js                 (전면 개편) API 호출 + UI 렌더링
├── build-exe.mjs              (기존 유지)
├── .env.example
└── package.json
```

## 설정 폼 → TOML 반영 로직

폼에서 변경된 값을 TOML 문자열 내 두 곳에 동시 반영:
1. `[sources.heartbeat.metrics.tags]` — heartbeat에 포함되는 메타데이터
2. `[transforms.add_metadata]` source — 로그에 붙는 메타데이터

기존 Sender 페이지의 `syncHeartbeatTags()` 로직과 동일한 정규식 치환 방식 사용.
