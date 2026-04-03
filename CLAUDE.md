# Vector Log Collection System
<!-- 최종 갱신: 2026-04-02 -->

## 데이터 흐름
```
설비 Agent(.toml/.conf) → port 6000 → Aggregator VRL 파싱 → HTTP sink
→ POST /api/logs (port 3110) → log-ingest.service → Oracle DB INSERT
```

## 서버 정보
- 운영 서버: 20.10.30.112 (SSH: administrator / 1234)
- 서버 프로젝트 경로: C:\Project\vector
- Backend: Fastify + TypeScript (port 3100, 내부 3110)
- Frontend: Next.js (frontend/ 디렉토리)
- 배포: GitHub Actions → git push 시 서버 자동 배포

---

## 대용량 파일 (200줄+)

| 파일 | 줄수 | 비고 |
|------|------|------|
| src/server/routes/monitor.route.ts | 3409 | 엔드포인트 72개 (아래 인덱스) |
| frontend/src/app/dashboard/log-files/page.tsx | 660 | 파일탐색+수동투입 |
| frontend/src/app/dashboard/receiver/components/VrlSimulator.tsx | 648 | |
| frontend/src/app/dashboard/vrl-mapping/page.tsx | 495 | |
| frontend/src/app/dashboard/mapping/components/AutoCreateModal.tsx | 374 | |
| frontend/src/app/dashboard/retry/page.tsx | 361 | |
| src/database/oracle-ddl.ts | 342 | DDL 빌더 |
| frontend/src/app/dashboard/vrl-mapping/components/AiVrlGenerator.tsx | 338 | |
| src/database/repositories/error-log.repository.ts | 291 | |
| frontend/src/app/dashboard/upload/page.tsx | 285 | |
| frontend/src/app/dashboard/sender/page.tsx | 283 | |
| frontend/src/app/dashboard/settings/components/AiModelConfig.tsx | 279 | |
| frontend/src/app/dashboard/sender/components/FluentConfigPanel.tsx | 278 | |
| frontend/src/app/dashboard/errors/page.tsx | 278 | |
| src/database/dynamic-insert.ts | 275 | |
| frontend/src/app/dashboard/mapping/page.tsx | 270 | |
| frontend/src/app/dashboard/receiver/components/AdvancedOptions.tsx | 269 | |
| frontend/src/app/dashboard/receiver/components/AggregatorConfigForm.tsx | 267 | |
| frontend/src/app/dashboard/components/RetryLogPanel.tsx | 262 | |
| frontend/src/app/dashboard/settings/page.tsx | 255 | |
| frontend/src/app/dashboard/system-logs/page.tsx | 240 | |
| frontend/src/app/dashboard/components/CollectorGrid.tsx | 233 | |
| frontend/src/components/pipeline/EquipmentSidePanel.tsx | 224 | |
| frontend/src/app/dashboard/sender/components/agent-toml-helpers.ts | 221 | |
| frontend/src/app/dashboard/receiver/components/BackupHistory.tsx | 219 | |
| frontend/src/app/dashboard/components/Pm2LogPanel.tsx | 216 | |

---

## monitor.route.ts 엔드포인트 인덱스 (72개)

### Vector 프로세스
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 93 | GET | /api/monitor/overview | 통합 상태 |
| 130 | GET | /api/monitor/vector | Vector 상태 |
| 136 | POST | /api/monitor/vector/start | Vector 시작 |
| 151 | POST | /api/monitor/vector/stop | Vector 중지 |
| 166 | POST | /api/monitor/vector/reload | Vector 리로드 |

### Aggregator 설정
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 187 | GET | /api/monitor/aggregator/config | TOML 조회 |
| 198 | PUT | /api/monitor/aggregator/config | TOML 저장 |
| 265 | GET | /api/monitor/aggregator/backups | 백업 목록 |
| 292 | GET | /api/monitor/aggregator/backups/:name | 백업 내용 |
| 311 | POST | /api/monitor/aggregator/backups/:name/restore | 백업 복원 |

### Agent 설정 (Vector)
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 563 | GET | /api/monitor/agent/configs | Agent 목록 |
| 588 | GET | /api/monitor/agent/config/:name | Agent 조회 |
| 602 | PUT | /api/monitor/agent/config/:name | Agent 저장 |
| 654 | POST | /api/monitor/agent/configs | Agent 생성 |
| 676 | PUT | /api/monitor/agent/description/:name | 설명 수정 |
| 694 | DELETE | /api/monitor/agent/config/:name | Agent 삭제 |
| 715 | POST | /api/monitor/agent/config/:name/validate | Agent 검증 |
| 740 | GET | /api/monitor/agent/config/:name/download | Agent 다운로드 |

### Agent 설정 (Fluent Bit)
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 418 | GET | /api/monitor/agent-fluent/configs | Fluent 목록 |
| 431 | GET | /api/monitor/download/agent-fluent/:name | Fluent 다운로드 |
| 456 | GET | /api/monitor/agent-fluent/config/:name | Fluent 조회 |
| 470 | PUT | /api/monitor/agent-fluent/config/:name | Fluent 저장 |
| 491 | POST | /api/monitor/agent-fluent/configs | Fluent 생성 |
| 507 | DELETE | /api/monitor/agent-fluent/config/:name | Fluent 삭제 |

### 다운로드
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 334 | GET | /api/monitor/download/vector-zip | Vector ZIP |
| 356 | GET | /api/monitor/download/agent-manager | Agent Manager |
| 377 | GET | /api/monitor/download/agent/:name | Agent TOML |
| 399 | GET | /api/monitor/download/fluent-bit | Fluent Bit ZIP |

### Oracle 테이블/프로시져
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 757 | GET | /api/monitor/tables/oracle | 등록 테이블 목록 |
| 775 | GET | /api/monitor/tables/oracle/all | 전체 Oracle 테이블 |
| 790 | POST | /api/monitor/tables/oracle/create | 테이블 자동생성 (L851: 트리거 복구) |
| 908 | GET | /api/monitor/tables/oracle/:name/columns | 컬럼 조회 |
| 929 | GET | /api/monitor/registry | 매핑 레지스트리 |
| 962 | GET | /api/monitor/registry-keys | 레지스트리 키 목록 |
| 970 | POST | /api/monitor/registry | 매핑 저장 |
| 1025 | GET | /api/monitor/procedures/oracle/all | 전체 프로시져 |
| 1052 | POST | /api/monitor/procedures/oracle/create | 프로시져 자동생성 |
| 1122 | GET | /api/monitor/procedures/oracle/:name/arguments | 프로시져 파라미터 |
| 1149 | GET | /api/monitor/procedures | 매핑된 프로시져 |
| 1163 | GET | /api/monitor/procedures/:key | 프로시져 상세 |
| 1175 | POST | /api/monitor/procedures | 프로시져 매핑 저장 |
| 1226 | DELETE | /api/monitor/procedures/:key | 프로시져 매핑 삭제 |

### 로그/에러/재시도
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 1237 | GET | /api/monitor/logs | 처리 로그 조회 |
| 1288 | GET | /api/monitor/errors | 에러 로그 조회 |
| 1308 | DELETE | /api/monitor/errors | 에러 삭제 |
| 1321 | POST | /api/monitor/retry | 에러 재처리 |
| 1359 | POST | /api/monitor/retry/all | 전체 재처리 |

### 원본 로그 파일
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 1393 | GET | /api/monitor/log-files | 디렉토리 탐색 |
| 1422 | GET | /api/monitor/log-files/read | 파일 내용 읽기 |
| 1466 | GET | /api/monitor/log-files/download | 파일 다운로드 |
| 1494 | DELETE | /api/monitor/log-files | 파일 삭제 |

### 파싱 룰
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 1534 | GET | /api/monitor/parse-rules | 파싱 룰 조회 |
| 1544 | POST | /api/monitor/parse-rules | 파싱 룰 저장 |
| 1569 | DELETE | /api/monitor/parse-rules/:type | 파싱 룰 삭제 |
| 1584 | POST | /api/monitor/parse-rules/sync | VRL→파싱룰 동기화 |

### AI
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 1653 | GET | /api/monitor/ai/config | AI 설정 조회 |
| 1663 | PUT | /api/monitor/ai/config | AI 설정 저장 |
| 1684 | POST | /api/monitor/ai/test | AI 연결 테스트 |
| 1769 | GET | /api/monitor/ai/models | 모델 목록 |
| 1778 | GET | /api/monitor/ai/system-prompt | 시스템 프롬프트 |
| 1786 | PUT | /api/monitor/ai/system-prompt | 프롬프트 저장 |
| 1793 | DELETE | /api/monitor/ai/system-prompt | 프롬프트 삭제 |
| 1799 | POST | /api/monitor/ai/generate-vrl | VRL 자동 생성 |

### VRL
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 1920 | GET | /api/monitor/vrl/target-map | 설비→테이블 매핑 |
| 1948 | GET | /api/monitor/vrl/code/:type | 설비별 VRL 코드 |
| 1972 | POST | /api/monitor/vrl/simulate | VRL 시뮬레이션 |
| 2080 | POST | /api/monitor/vrl/manual-ingest | 수동 로그 투입 |
| 2211 | POST | /api/monitor/vrl/validate | VRL 문법 검증 |
| 2257 | POST | /api/monitor/vrl/apply | VRL TOML 반영 |

### 시스템 설정/상태
| 줄 | 메서드 | 경로 | 설명 |
|-----|--------|------|------|
| 2318 | PUT | /api/monitor/config | 설정 저장 |
| 2368 | POST | /api/monitor/test-connection | DB 연결 테스트 |
| 2394 | GET | /api/monitor/config | 설정 조회 |
| 2434 | GET | /api/monitor/pipeline-status | 파이프라인 상태 |
| 2555 | GET | /api/monitor/system-logs | 시스템 로그 |
| 2582 | GET | /api/monitor/pm2-logs | PM2 로그 |
| 2616 | GET | /api/monitor/pm2-logs/files | PM2 로그 파일 목록 |

---

## VRL 설비 블록 인덱스 (vector-aggregator.toml)

| 설비 | 시작줄 | target_table |
|------|--------|-------------|
| SP | L204 | LOG_{log_type} |
| SPI | L216 | LOG_SPI |
| AOI | L273 | LOG_AOI |
| ICT | L325 | LOG_ICT |
| FCT | L360 | LOG_FCT |
| EOL | L408 | LOG_EOL |
| MOUNTER | L458 | LOG_MOUNTER |
| VISION_LEGACY | L543 | LOG_VISION_LEGACY |
| VISION_NATIVE | L606 | LOG_VISION_NATIVE |
| DOWNLOAD | L657 | LOG_DOWNLOAD |
| LOWCURRENT | L717 | LOG_LOWCURRENT |
| COATING1 | L746 | LOG_COATING1 |
| COATING2 | L782 | LOG_COATING2 |
| COATINGVISION | L804 | LOG_COATINGVISION |
| COATINGREVIEW | L829 | LOG_COATINGREVIEW |
| MARKING | L867 | LOG_MARKING |
| SELECTIVE | L893 | LOG_SELECTIVE |
| REFLOW | L922 | LOG_REFLOW_01 |
| REFLOW2 | L1013 | LOG_REFLOW_02 |

---

## table-registry 등록 테이블

LOG_AOI, LOG_COATINGREVIEW, LOG_COATINGVISION, LOG_DOWNLOAD, LOG_EOL, LOG_FCT, LOG_ICT, LOG_LOWCURRENT, LOG_MARKING, LOG_MOUNTER, LOG_SELECTIVE, LOG_SPI, LOG_VISION_LEGACY, LOG_VISION_NATIVE

---

## 프론트엔드 페이지별 코드량

| 페이지 | 총 줄수 | 컴포넌트 수 |
|--------|---------|------------|
| receiver | 2202 | 7+ |
| mapping | 1951 | 6+ |
| sender | 1830 | 5+ |
| dashboard/components (공통) | 1506 | 5+ |
| vrl-mapping | 1159 | 4+ |
| log-files | 660 | 1 (단일 파일) |
| equipment | 603 | 3+ |
| settings | 534 | 2+ |
| retry | 361 | 1 |
| upload | 285 | 1 |
| errors | 278 | 1 |
| download | 241 | 1 |
| system-logs | 240 | 1 |
| help | 205 | 1 |
| logs | 140 | 1 |
| simulator | 74 | 1 |

---

## i18n 섹션 인덱스 (ko.json)

| 줄 | 섹션 키 | 줄 | 섹션 키 |
|-----|---------|-----|---------|
| 2 | nav | 202 | settings |
| 23 | header | 229 | receiver |
| 27 | dashboard | 339 | sender |
| 36 | equipmentDashboard | 468 | download |
| 40 | serviceFlow | 536 | aggregator |
| 61 | infra | 555 | backup |
| 82 | queue | 569 | logs |
| 89 | collector | 582 | vrlMapping |
| 104 | remote | 588 | mapping |
| 163 | errors | 709 | parseRule |
| 194 | error | 721 | ai |
| 775 | logFiles | 805 | vrlSim |
| 841 | systemLogs | 868 | upload |

---

## 최근 변경 핫스팟 (2주간)

| 변경횟수 | 파일 |
|----------|------|
| 41 | src/server/routes/monitor.route.ts |
| 39 | agent-manager-go/main.go |
| 29 | vector-config/aggregator/vector-aggregator.toml |
| 22 | vector-config/agent/REFLOW.toml |
| 22 | vector-config/agent/COATINGVISION.toml |
| 22 | vector-config/agent/COATING{1,2,REVIEW}.toml |
| 21 | vector-config/agent/MOUNTER.toml |

---

## Backend Services (src/services/)
| 파일 | 역할 |
|------|------|
| log-ingest.service.ts | processLogBatch() — ROWS 행별 INSERT |
| vector-process.service.ts | Vector 바이너리 제어 (VECTOR_BIN = vector-bin/bin/vector.exe) |
| heartbeat.service.ts | 설비 하트비트 관리 |

## Backend Core (src/)
| 파일 | 역할 |
|------|------|
| database/oracle.pool.ts | Oracle 커넥션 풀 |
| database/oracle-ddl.ts (342줄) | DDL 빌더 (CREATE TABLE/PROCEDURE) |
| database/dynamic-insert.ts (275줄) | 동적 INSERT 실행기 |
| config/env.ts | 환경변수 (RAW_LOG_BASE_PATH 등) |
| config/vrl-target-updater.ts | TOML VRL 타겟 업데이트 + 백업 |
| types/index.ts | LogRecord, TargetType 등 공유 타입 |
| schemas/log-ingest.schema.ts | zod 스키마 (수신 데이터 검증) |

## 자주 쓰는 API
```
# 운영 서버: http://20.10.30.112:3100  (배포 서버 — 테스트/검증용)
# 로컬 개발: http://localhost:3100

VRL 시뮬레이션:  POST /api/monitor/vrl/simulate
수동 로그 투입:  POST /api/monitor/vrl/manual-ingest
에러 로그 조회:  GET  /api/monitor/errors
테이블 컬럼:    GET  /api/monitor/tables/oracle/{TABLE}/columns
VRL 타겟 맵:   GET  /api/monitor/vrl/target-map
테이블 생성:    POST /api/monitor/tables/oracle/create
```
