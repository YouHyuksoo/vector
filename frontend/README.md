---
sources:
  - package.json
  - src/app/dashboard/
  - src/components/layout/Sidebar.tsx
  - src/docs/
verifiedCommit: e736824
---

# Vector Log Collector Frontend

Next.js 16 + React 19 기반 운영 대시보드다. Backend API는 기본 `http://localhost:3110`, Frontend는 `http://localhost:3100`에서 실행한다.

## 실행

저장소 루트에서 Backend와 함께 실행:

```powershell
npm run dev
```

Frontend만 실행:

```powershell
npm run dev --prefix frontend
```

프로덕션 빌드:

```powershell
npm run build --prefix frontend
```

## 주요 화면

| 경로 | 역할 |
|---|---|
| `/dashboard` | 중앙 서비스 흐름과 등록 타겟 |
| `/dashboard/equipment` | 장비 heartbeat, 수집 제외, 원격 관리 |
| `/dashboard/sender` | Vector/Fluent Agent 설정 |
| `/dashboard/receiver` | Aggregator TOML과 백업 |
| `/dashboard/vrl-mapping` | VRL 생성·시뮬레이션·적용과 Oracle 매핑 |
| `/dashboard/log-files` | raw 파일 조회·검색·다운로드·수동 투입 |
| `/dashboard/system-logs` | 오류, 재전송, 처리, 실시간, PM2 로그 |
| `/dashboard/diagnose` | buffer, 처리량, Oracle, 장비 종합 진단 |
| `/dashboard/upload` | 운영 파일 업로드 관리 |
| `/dashboard/download` | Vector, Agent Manager, Fluent Bit과 설정 다운로드 |
| `/dashboard/settings` | 서버, Oracle, 저장소, heartbeat와 AI 설정 |
| `/dashboard/help` | 한국어·영어·스페인어 내장 도움말 |

## 문서 구조

내장 도움말은 `src/docs/{ko,en,es}`에 있고 `src/docs/index.ts`가 토픽과 locale 매핑을 관리한다.

도움말 구조 검사:

```powershell
node --test src/docs/help-docs.check.mjs
```

## 검증

```powershell
npm run lint
npm run build
```
