---
sources:
  - .github/workflows/deploy.yml
  - ecosystem.config.cjs
  - package.json
  - frontend/package.json
  - src/config/env.ts
  - src/index.ts
verifiedCommit: e736824
---

# Vector Log Collector 배포 가이드

최종 검증: 2026-07-18

## 1. 운영 구성

| 프로세스 | PM2 이름 | 포트 |
|---|---|---:|
| Fastify Backend | `vector-backend` | 3110 |
| Next.js Frontend | `vector-frontend` | 3100 |
| Vector Aggregator | Backend가 직접 관리 | 6000, 24224, 8687 |

배포는 GitHub Actions Windows self-hosted runner에서 수행한다. `main` push 또는 `workflow_dispatch`가 트리거다.

## 2. 서버 사전 준비

### 필수 소프트웨어

- Windows Server 또는 Windows 10/11
- Git
- Node.js 24
- PM2와 `pm2-windows-startup`
- GitHub Actions self-hosted runner (`LogServer` 라벨)

Oracle 연결은 node-oracledb Thin mode를 사용하므로 현재 기본 경로에는 Oracle Instant Client가 필요하지 않다.

```powershell
npm install -g pm2 pm2-windows-startup
```

### 배포 경로

관리자 PowerShell에서 시스템 환경변수를 등록하고 runner 서비스를 재시작한다.

```powershell
[System.Environment]::SetEnvironmentVariable('DEPLOY_DIR', 'C:\Project\vector', 'Machine')
```

## 3. 최초 배치 파일

배포 workflow는 운영 데이터 보호를 위해 다음 항목을 복사하지 않는다. 최초 배포에서는 서버에 직접 준비해야 한다.

```text
.env
ai-config.json
ai-system-prompt.txt
config/parse-fields.json
config/table-registry.json
vector-config/aggregator/
data/
logs/
vector-data/
vector-data-agent/
```

### `.env`

```dotenv
PORT=3110
HOST=0.0.0.0
NODE_ENV=production

ORACLE_USER=log_collector
ORACLE_PASSWORD=change-me
ORACLE_CONNECT_STRING=host:port/service
ORACLE_POOL_MIN=8
ORACLE_POOL_MAX=40

RAW_LOG_BASE_PATH=C:\data\raw-logs
HEARTBEAT_TTL_SECONDS=60
AGENT_MONITOR_PORT=9090
```

Redis와 BullMQ 환경변수는 현재 런타임에서 사용하지 않는다.

### Vector

- `vector-bin/vector-x64.zip`이 있으면 workflow가 `vector-bin/bin/vector.exe`로 압축 해제한다.
- 운영 Aggregator TOML은 `vector-config/aggregator/vector-aggregator.toml`에 직접 배치한다.
- `vector-data` 디렉터리는 HTTP sink disk buffer이므로 배포 동기화에서 보호한다.

## 4. 자동 배포 흐름

```text
main push / 수동 실행
  → DEPLOY_DIR 확인
  → checkout + Node.js 24
  → backend npm ci + tsc
  → frontend npm ci + next build
  → 기존 PM2 중지
  → robocopy /MIR (운영 파일 제외)
  → vector-x64.zip 압축 해제
  → TOML CRLF를 LF로 정규화
  → PM2 reload/start + save
  → 3110 orphan PID 확인
  → Backend/Frontend health check
```

Vector Aggregator를 workflow에서 별도 시작하지 않는다. PM2가 Backend를 시작하면 `src/index.ts`가 Aggregator의 8687 API를 확인하고 필요할 때 한 번만 spawn한다.

## 5. 수동 빌드와 기동

```powershell
Set-Location C:\Project\vector
npm ci
npm run build
npm ci --prefix frontend
npm run build:frontend
pm2 start ecosystem.config.cjs
pm2 save
```

이미 등록된 경우:

```powershell
pm2 reload ecosystem.config.cjs --update-env
```

## 6. 배포 검증

```powershell
Invoke-WebRequest http://localhost:3110/api/monitor/pipeline-status -UseBasicParsing
Invoke-WebRequest http://localhost:3100 -UseBasicParsing
Invoke-WebRequest http://localhost:8687/health -UseBasicParsing
pm2 status
```

추가 확인:

- `/dashboard/diagnose`: buffer, source/sink, Oracle pool과 지연
- `/dashboard/equipment`: Agent heartbeat
- `/dashboard/system-logs`: 배포 직후 오류

## 7. 포트와 방화벽

| 포트 | 방향 | 용도 |
|---:|---|---|
| 3100 | 사용자 → 서버 | Frontend |
| 3110 | Frontend/운영 → 서버 | Fastify API |
| 6000 | Vector Agent → 서버 | Vector protocol |
| 24224 | Fluent Bit → 서버 | forward protocol |
| 8687 | 서버 내부/운영 | Aggregator API |
| 9090 | 서버 → 설비 PC | Agent Manager 원격 관리 |
| Oracle listener | 서버 → DB | `ORACLE_CONNECT_STRING` 기준 |

## 8. 트러블슈팅

### TOML 파싱 오류

운영 TOML을 LF와 UTF-8 BOM 없음으로 저장한다.

```powershell
$p = 'C:\Project\vector\vector-config\aggregator\vector-aggregator.toml'
$c = [System.IO.File]::ReadAllText($p) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($p, $c, [System.Text.UTF8Encoding]::new($false))
```

### Backend `EADDRINUSE :3110`

PM2 PID와 실제 listen PID를 비교한다.

```powershell
pm2 jlist
netstat -ano | Select-String ':3110'
```

listen PID가 PM2 관리 PID와 다르면 orphan을 확인한 뒤 해당 PID만 종료하고 `pm2 restart vector-backend`를 실행한다.

### Vector 6000/8687/24224 충돌

Vector를 PM2나 별도 `Start-Process`로 중복 시작하지 않는다. Backend가 소유하도록 두고 다음 API로 다시 불러온다.

```powershell
Invoke-RestMethod -Method Post http://localhost:3110/api/monitor/vector/reload
```

### Agent는 온라인인데 데이터가 없음

1. 설비 PC TOML의 `include`/`exclude`, fingerprint, multiline 확인
2. `Test-NetConnection <server> -Port 6000`
3. 운영 진단 source/sink 이벤트 확인
4. 원본 로그 화면에서 파일 도착 확인

`data_dir` 삭제는 중복 전송을 만들 수 있으므로 마지막 복구 수단으로만 사용한다.

### Oracle 적재 오류

시스템 로그의 stage와 target을 확인하고, `config/table-registry.json`, VRL 결과와 실제 Oracle 스키마를 대조한다. 수정 후 저장된 `RAW_DATA`를 재처리한다.

## 9. PM2 명령

```powershell
pm2 status
pm2 logs
pm2 restart vector-backend
pm2 restart vector-frontend
pm2 reload ecosystem.config.cjs --update-env
pm2 save
```
