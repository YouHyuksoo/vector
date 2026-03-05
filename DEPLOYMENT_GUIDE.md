# Vector Log Collector — 배포 가이드

## 목차
1. [아키텍처 개요](#1-아키텍처-개요)
2. [신규 서버 사전 준비](#2-신규-서버-사전-준비)
3. [GitHub Actions 자동 배포](#3-github-actions-자동-배포)
4. [배포 후 최초 1회 수동 작업](#4-배포-후-최초-1회-수동-작업)
5. [트러블슈팅](#5-트러블슈팅)
6. [포트 목록](#6-포트-목록)
7. [유용한 명령어](#7-유용한-명령어)

---

## 1. 아키텍처 개요

```
[개발 PC] --git push--> [GitHub] --Actions--> [MesServer] (라벨: MesServer)
                                           └-> [LogServer] (라벨: LogServer)
```

- **Backend**: Fastify + TypeScript (포트 3110)
- **Frontend**: Next.js (포트 3100)
- **프로세스 관리**: PM2 (`ecosystem.config.cjs`)
- **배포 방식**: GitHub Actions → robocopy로 `DEPLOY_DIR`에 동기화 → PM2 reload

---

## 2. 신규 서버 사전 준비

새 서버에 배포하려면 아래를 **한 번만** 설정합니다.

### 2-1. 필수 소프트웨어 설치

| 소프트웨어 | 설치 방법 | 비고 |
|-----------|----------|------|
| **Node.js 24+** | https://nodejs.org 에서 MSI 설치 | |
| **PM2** | `npm install -g pm2 pm2-windows-startup` | 관리자 PowerShell |
| **Redis 5.0+** | https://github.com/tporadowski/redis/releases 에서 MSI 설치 | 3.x 버전은 BullMQ 미지원 |
| **Git** | https://git-scm.com 에서 설치 | |

> **Oracle Instant Client는 필요 없습니다.** `oracledb` npm 패키지가 Thin 모드로 직접 접속합니다.

### 2-2. PowerShell 실행 정책 변경

Windows 기본 정책이 `Restricted`이면 npm, PM2 등 스크립트 실행이 차단됩니다.

```powershell
# 관리자 PowerShell에서 실행
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2-3. GitHub Actions Self-hosted Runner 설치

1. GitHub repo → **Settings** → **Actions** → **Runners** → **New self-hosted runner**
2. Windows 선택, 안내에 따라 설치
3. 서비스로 등록: `.\svc.cmd install`
4. **라벨 추가**: Settings → Actions → Runners → 해당 runner 클릭 → Labels에 서버명 추가
   - 예: `MesServer`, `LogServer`
5. `deploy.yml`의 matrix에 해당 라벨 추가:
   ```yaml
   strategy:
     matrix:
       server: [MesServer, LogServer, 새서버라벨]
   ```

### 2-4. DEPLOY_DIR 시스템 환경변수 설정

배포할 경로를 시스템 환경변수로 등록합니다.

```powershell
# 관리자 PowerShell에서 실행 (경로는 서버에 맞게 변경)
[System.Environment]::SetEnvironmentVariable('DEPLOY_DIR', 'C:\Project\vector', 'Machine')
```

> 환경변수 설정 후 **runner 서비스를 재시작**해야 반영됩니다.
> ```powershell
> Restart-Service actions.runner.*
> ```

### 2-5. vector-bin 폴더 복사

Vector 실행파일(`vector.exe`)은 배포에서 제외됩니다. 기존 서버에서 복사하세요.

```
기존서버\vector-bin\ → 새서버\{DEPLOY_DIR}\vector-bin\
```

### 2-6. .env 파일 배치

`.env` 파일도 배포에서 제외됩니다. 기존 서버의 `.env`를 복사한 뒤 DB 접속정보 등을 수정하세요.

```
{DEPLOY_DIR}\.env
```

---

## 3. GitHub Actions 자동 배포

`main` 브랜치에 push하면 자동 실행됩니다.

### 배포 흐름
1. Checkout → Node.js 설치 → npm ci → 빌드 (백엔드 + 프론트엔드)
2. PM2 stop → robocopy로 `DEPLOY_DIR`에 동기화 → PM2 reload/start
3. Health check (백엔드 3110, 프론트엔드 3100)

### robocopy 제외 항목
배포 시 다음 파일/폴더는 동기화에서 **제외**됩니다:
- `.env` — 서버별 설정이 다름
- `.git` — Git 메타데이터
- `vector-config/aggregator/backups` — 백업 데이터
- `data`, `logs` — 런타임 데이터
- `vector-bin` — Vector 실행파일
- `vector-data`, `vector-data-agent` — Vector 런타임 데이터

### 수동 배포 트리거
GitHub repo → **Actions** → **Deploy to Production** → **Run workflow**

---

## 4. 배포 후 최초 1회 수동 작업

첫 배포가 완료된 후 서버에 로그인하여 **한 번만** 실행합니다:

```powershell
cd C:\Project\vector   # DEPLOY_DIR 경로
pm2 start ecosystem.config.cjs
pm2 save
```

> 이후 배포부터는 GitHub Actions가 자동으로 PM2 reload합니다.
> 수동 restart 필요 없습니다.

---

## 5. 트러블슈팅

### 5-1. PowerShell 스크립트 실행 차단
```
running scripts is disabled on this system
```
**원인**: PowerShell ExecutionPolicy가 Restricted
**해결**: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
**배포 파이프라인**: `deploy.yml`에 `-ExecutionPolicy Bypass` 이미 적용됨

### 5-2. TOML 파싱 오류 (CRLF)
```
invalid multiline literal string
```
**원인**: Git이 Windows에서 checkout할 때 TOML 파일을 CRLF로 변환하면 Vector가 파싱 실패
**해결**: `.gitattributes`에 `*.toml text eol=lf` 설정 완료. 만약 재발 시:
```powershell
# PowerShell에서 CRLF → LF 강제 변환
$file = "{DEPLOY_DIR}\vector-config\aggregator\vector-aggregator.toml"
(Get-Content $file -Raw) -replace "`r`n", "`n" | Set-Content $file -NoNewline -Encoding UTF8
pm2 restart vector-backend
```

### 5-3. VRL replace() 오류
```
update the expression to be infallible by adding a `!`: `replace!(...)`
```
**원인**: VRL에서 `.file` 타입이 `any`일 때 `replace()`는 fallible
**해결**: `replace(.file, ...)` → `replace!(to_string!(.file), ...)` 로 수정 완료

### 5-4. Redis 버전 오류
```
Redis version needs to be greater or equal than 5.0.0 Current: 3.0.504
```
**원인**: BullMQ는 Redis 5.0 이상 필요
**해결**: Redis 5.0 이상 설치 (https://github.com/tporadowski/redis/releases)

### 5-5. vector.exe 없음 (ENOENT)
```
Error: spawn C:\Project\vector\vector-bin\bin\vector.exe ENOENT
```
**원인**: `vector-bin` 폴더가 배포에서 제외되므로 신규 서버에 없음
**해결**: 기존 서버에서 `vector-bin` 폴더 전체를 복사

### 5-6. npm ci 파일 잠김 (EPERM)
```
EPERM: operation not permitted, unlink '...node.napi.node'
```
**원인**: PM2가 해당 파일을 사용 중
**해결**: `pm2 stop all` → `npm ci` → `pm2 restart all`

### 5-7. gzip 미설치 (npm 캐시 경고)
```
/bin/sh: line 1: gzip: command not found
```
**원인**: Windows self-hosted runner에 gzip이 없어서 npm 캐시 저장 실패
**해결**: `setup-node`에서 `cache: 'npm'` 제거 완료. 동작에 영향 없음

### 5-8. Agent TOML 환경변수 오류 ($NEVER_MATCH)
```
Configuration error. error=Missing environment variable in config. name = "NEVER_MATCH"
```
**원인**: multiline의 `condition_pattern = "^$NEVER_MATCH"` 에서 Vector가 `$NEVER_MATCH`를 환경변수로 해석.
Vector는 TOML 파싱 **전에** 텍스트 레벨에서 `$VAR`를 환경변수 치환함. 홑따옴표/쌍따옴표 무관.
**해결**: `$$`로 이스케이프 → `condition_pattern = '^$$NEVER_MATCH'`

### 5-9. Agent 파일 감지는 되지만 데이터가 서버에 안 올라옴
**증상**: `Found new file to watch` 또는 `Resuming to watch file` 로그는 나오지만 서버에 데이터 없음
**원인 1 — 체크포인트**: Vector는 읽은 위치를 `data_dir`에 기록함. 이전 실행에서 이미 끝까지 읽은 파일은 재시작해도 다시 안 읽음.
**해결**:
```powershell
# 1. Vector 중지 (반드시 먼저!)
stop-vector.bat

# 2. data_dir 삭제 (체크포인트 초기화)
rd /s /q C:\vector-data-{설비명}

# 3. Vector 재시작 (data_dir은 start-vector.bat이 자동 생성)
start-vector.bat
```
> **주의**: Vector 실행 중에 data_dir을 삭제하면 안 됨!

**원인 2 — Aggregator 포트**: Agent의 `address`가 Aggregator 수신 포트(6000)가 아닌 다른 포트(예: 3100)로 설정됨
**해결**: `[sinks.to_aggregator]`의 `address`가 `서버IP:6000`인지 확인

### 5-10. Agent 전송 확인 방법 (GraphQL API)
Agent가 데이터를 실제로 전송했는지 확인하려면:
```powershell
# Agent 측 (로컬 PC) — 소스별 이벤트 수
curl http://127.0.0.1:8686/graphql -H "Content-Type: application/json" -d "{\"query\":\"{ sources { edges { node { componentId metrics { sentEventsTotal { sentEventsTotal } } } } } }\"}"

# Aggregator 측 (서버) — Sink별 전송 수
curl http://서버IP:8687/graphql -H "Content-Type: application/json" -d "{\"query\":\"{ sinks { edges { node { componentId metrics { sentEventsTotal { sentEventsTotal } } } } } }\"}"
```
- `work_logs.sentEventsTotal = 0` → multiline이 파일을 묶고 있는 중이거나 체크포인트 문제
- Agent는 전송했는데 서버 `to_api = null` → Aggregator VRL 파싱 실패 (데이터 구조 불일치)

### 5-11. PM2 wmic ENOENT
```
Error: spawn wmic ENOENT
```
**원인**: 최신 Windows에서 wmic 제거됨. PM2 모니터링 관련
**해결**: 동작에 영향 없음. 무시 가능

### 5-9. PM2 프론트엔드 SyntaxError
```
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")
SyntaxError: missing ) after argument list
```
**원인**: `ecosystem.config.cjs`의 script 경로가 `node_modules/.bin/next` (bash 스크립트)를 가리킴
**해결**: `node_modules/next/dist/bin/next` 경로로 수정 완료. PM2 캐시 문제 시:
```powershell
pm2 delete all
pm2 start ecosystem.config.cjs
pm2 save
```

---

## 6. 포트 목록

| 포트 | 서비스 | 비고 |
|------|--------|------|
| 3100 | Frontend (Next.js) | |
| 3110 | Backend (Fastify) | |
| 6000 | Vector Aggregator (수신) | 에이전트 → 수신기 |
| 6379 | Redis | BullMQ 큐 |
| 8686 | Vector Agent API | 에이전트 상태 확인 |
| 8687 | Vector Aggregator API | 수신기 상태 확인 |
| 1588 | Oracle DB | 외부 서버 접속 |

---

## 7. 유용한 명령어

### PM2
```powershell
pm2 list                    # 프로세스 목록
pm2 restart all              # 전체 재시작
pm2 restart vector-backend   # 백엔드만 재시작
pm2 logs                     # 실시간 로그
pm2 logs --lines 50          # 최근 50줄
pm2 show vector-backend      # 상세 정보 (포트, 경로 등)
pm2 flush                    # 로그 파일 비우기
pm2 save                     # 현재 프로세스 목록 저장
pm2 monit                    # 실시간 모니터링 대시보드
```

### 관리 도구
```powershell
# manager.bat 사용 (프로젝트 루트에서)
.\manager.bat
```

### GitHub Actions 배포 확인
```powershell
# GitHub CLI로 최근 배포 상태 확인
gh run list --limit 5
gh run view <run-id> --log-failed
```
