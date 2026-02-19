# Agent Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 설비 PC에서 Vector Agent의 상태/전송 현황/설정을 확인할 수 있는 독립형 로컬 웹 UI를 구축한다.

**Architecture:** `agent-monitor/` 디렉토리에 독립된 Fastify 서버를 구축. Vector의 내장 GraphQL API(포트 8686)를 프록시하여 상태/메트릭을 제공하고, 로컬 TOML 설정 파일을 읽기/쓰기하며, Vector 프로세스를 제어한다. 프론트엔드는 단일 HTML 파일로 Tailwind CDN + vanilla JS로 구현한다.

**Tech Stack:** Fastify 5, TypeScript 5, Tailwind CSS (CDN), Material Symbols (CDN), vanilla JS

**Design doc:** `docs/plans/2026-02-20-agent-monitor-design.md`

---

## Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `agent-monitor/package.json`
- Create: `agent-monitor/tsconfig.json`
- Create: `agent-monitor/.env.example`

**Step 1: package.json 생성**

```json
{
  "name": "vector-agent-monitor",
  "version": "1.0.0",
  "description": "Vector Agent local monitoring UI for equipment PCs",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.0",
    "@fastify/static": "^8.0.0",
    "dotenv": "^16.4.0",
    "fastify": "^5.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: tsconfig.json 생성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: .env.example 생성**

```env
# Agent Monitor 서버 포트
PORT=9090

# Vector Agent API 주소 (기본: 127.0.0.1:8686)
VECTOR_API_URL=http://127.0.0.1:8686

# Vector Agent 설정 파일 경로
VECTOR_CONFIG_PATH=C:\vector\config\vector.toml

# Vector 바이너리 경로
VECTOR_BIN_PATH=C:\vector\bin\vector.exe
```

**Step 4: npm install 실행**

Run: `cd agent-monitor && npm install`

**Step 5: 커밋**

```bash
git add agent-monitor/package.json agent-monitor/tsconfig.json agent-monitor/.env.example agent-monitor/package-lock.json
git commit -m "feat(agent-monitor): init project scaffolding"
```

---

## Task 2: Fastify 서버 + 환경변수

**Files:**
- Create: `agent-monitor/src/server.ts`

**Step 1: 서버 엔트리 포인트 작성**

`agent-monitor/src/server.ts` - Fastify 서버 부트스트랩, 환경변수 로드, 정적 파일 서빙, 기본 health 라우트.

```typescript
/**
 * @file agent-monitor/src/server.ts
 * @description Vector Agent Monitor - 설비 PC 로컬 모니터링 웹 서버
 *
 * 초보자 가이드:
 * 1. 이 파일은 Agent Monitor의 메인 엔트리 포인트입니다
 * 2. Fastify 서버를 시작하고 정적 파일(public/)을 서빙합니다
 * 3. /api/* 라우트로 Vector Agent 상태 조회, 설정 관리, 프로세스 제어를 제공합니다
 * 4. 환경변수: PORT, VECTOR_API_URL, VECTOR_CONFIG_PATH, VECTOR_BIN_PATH
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 환경변수 (기본값 포함) */
export const ENV = {
  PORT: Number(process.env.PORT) || 9090,
  VECTOR_API_URL: process.env.VECTOR_API_URL || 'http://127.0.0.1:8686',
  VECTOR_CONFIG_PATH: process.env.VECTOR_CONFIG_PATH || 'C:\\vector\\config\\vector.toml',
  VECTOR_BIN_PATH: process.env.VECTOR_BIN_PATH || 'C:\\vector\\bin\\vector.exe',
};

const app = Fastify({ logger: true });

await app.register(fastifyCors);
await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
});

/** Health check */
app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// --- 라우트는 이후 Task에서 추가 ---

try {
  await app.listen({ port: ENV.PORT, host: '0.0.0.0' });
  console.log(`\n  Agent Monitor running at http://localhost:${ENV.PORT}\n`);
  console.log(`  Vector API:    ${ENV.VECTOR_API_URL}`);
  console.log(`  Config path:   ${ENV.VECTOR_CONFIG_PATH}`);
  console.log(`  Vector binary: ${ENV.VECTOR_BIN_PATH}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

**Step 2: 빈 public 폴더 생성을 위한 placeholder**

Create: `agent-monitor/public/.gitkeep` (빈 파일)

**Step 3: 서버 실행 테스트**

Run: `cd agent-monitor && npx tsx src/server.ts`
Expected: `Agent Monitor running at http://localhost:9090` 출력 확인 후 Ctrl+C

**Step 4: 커밋**

```bash
git add agent-monitor/src/server.ts agent-monitor/public/.gitkeep
git commit -m "feat(agent-monitor): add Fastify server with static file serving"
```

---

## Task 3: Vector 상태 조회 API

**Files:**
- Modify: `agent-monitor/src/server.ts`

**Context:** 메인 프로젝트의 `src/services/vector-process.service.ts`에서 패턴을 차용한다. Vector Agent의 GraphQL API(포트 8686)에서 health, meta(uptime, version), 컴포넌트 상태를 조회한다.

**Step 1: /api/status 라우트 추가**

`// --- 라우트는 이후 Task에서 추가 ---` 주석 위치에 다음 코드 삽입:

```typescript
// ─── Vector 상태 조회 ──────────────────────────────────────────

interface VectorStatus {
  running: boolean;
  pid: number | null;
  apiReachable: boolean;
  uptime: string | null;
  version: string | null;
}

/** Vector GraphQL API 호출 헬퍼 */
async function queryVectorGraphQL<T>(query: string): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${ENV.VECTOR_API_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json() as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** 초(seconds)를 "Xh Ym Zs" 문자열로 변환 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

app.get('/api/status', async (): Promise<VectorStatus> => {
  // 1) health 체크
  let apiReachable = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${ENV.VECTOR_API_URL}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    apiReachable = res.ok;
  } catch { /* unreachable */ }

  if (!apiReachable) {
    return { running: false, pid: null, apiReachable: false, uptime: null, version: null };
  }

  // 2) meta 정보 (uptime, version)
  const meta = await queryVectorGraphQL<{ meta: { uptime: number; versionString: string } }>(
    '{ meta { uptime versionString } }'
  );

  return {
    running: true,
    pid: null, // Agent는 외부에서 시작되므로 PID 추적 불가
    apiReachable: true,
    uptime: meta?.meta?.uptime != null ? formatUptime(meta.meta.uptime) : null,
    version: meta?.meta?.versionString ?? null,
  };
});
```

**Step 2: 실행 테스트**

Run: `cd agent-monitor && npx tsx src/server.ts`
브라우저에서 `http://localhost:9090/api/status` 접속 → JSON 응답 확인
(Vector가 미실행 시 `{ "running": false, ... }`)

**Step 3: 커밋**

```bash
git add agent-monitor/src/server.ts
git commit -m "feat(agent-monitor): add /api/status route for Vector health check"
```

---

## Task 4: 전송 메트릭 API

**Files:**
- Modify: `agent-monitor/src/server.ts`

**Context:** Vector GraphQL API로 source throughput, sink throughput, 에러 수, 버퍼 상태를 조회한다.

**Step 1: /api/metrics 라우트 추가**

`/api/status` 라우트 아래에 추가:

```typescript
// ─── 전송 메트릭 조회 ──────────────────────────────────────────

interface TransferMetrics {
  eventsIn: number;
  eventsOut: number;
  errors: number;
  bufferUsedBytes: number;
  bufferMaxBytes: number;
  bufferPercent: number;
  components: {
    sources: string[];
    sinks: string[];
  };
}

app.get('/api/metrics', async (): Promise<TransferMetrics> => {
  const defaultMetrics: TransferMetrics = {
    eventsIn: 0, eventsOut: 0, errors: 0,
    bufferUsedBytes: 0, bufferMaxBytes: 268435488,
    bufferPercent: 0,
    components: { sources: [], sinks: [] },
  };

  // 컴포넌트 목록 + 에러 카운트
  const data = await queryVectorGraphQL<{
    sources: { edges: Array<{ node: { componentId: string; metrics: { receivedEventsTotal: { receivedEventsTotal: number } } } }> };
    sinks: { edges: Array<{ node: { componentId: string; metrics: { sentEventsTotal: { sentEventsTotal: number }; componentErrorsTotal: { componentErrorsTotal: number } } } }> };
  }>(`{
    sources {
      edges {
        node {
          componentId
          metrics { receivedEventsTotal { receivedEventsTotal } }
        }
      }
    }
    sinks {
      edges {
        node {
          componentId
          metrics {
            sentEventsTotal { sentEventsTotal }
            componentErrorsTotal { componentErrorsTotal }
          }
        }
      }
    }
  }`);

  if (!data) return defaultMetrics;

  const sources = data.sources?.edges?.map(e => e.node.componentId) ?? [];
  const sinks = data.sinks?.edges?.map(e => e.node.componentId) ?? [];

  let eventsIn = 0;
  for (const edge of data.sources?.edges ?? []) {
    eventsIn += edge.node.metrics?.receivedEventsTotal?.receivedEventsTotal ?? 0;
  }

  let eventsOut = 0;
  let errors = 0;
  for (const edge of data.sinks?.edges ?? []) {
    eventsOut += edge.node.metrics?.sentEventsTotal?.sentEventsTotal ?? 0;
    errors += edge.node.metrics?.componentErrorsTotal?.componentErrorsTotal ?? 0;
  }

  return {
    eventsIn,
    eventsOut,
    errors,
    bufferUsedBytes: 0, // Vector GraphQL에서 buffer 크기 직접 조회 어려움 - 파일 시스템 확인 필요
    bufferMaxBytes: 268435488,
    bufferPercent: 0,
    components: { sources, sinks },
  };
});
```

**Step 2: 실행 테스트**

Run: `http://localhost:9090/api/metrics` 접속 → JSON 확인

**Step 3: 커밋**

```bash
git add agent-monitor/src/server.ts
git commit -m "feat(agent-monitor): add /api/metrics route for transfer stats"
```

---

## Task 5: TOML 설정 관리 API

**Files:**
- Modify: `agent-monitor/src/server.ts`

**Step 1: /api/config GET/PUT 라우트 추가**

```typescript
// ─── TOML 설정 관리 ──────────────────────────────────────────

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';

app.get('/api/config', async (_, reply) => {
  try {
    if (!existsSync(ENV.VECTOR_CONFIG_PATH)) {
      return reply.status(404).send({ error: 'Config file not found', path: ENV.VECTOR_CONFIG_PATH });
    }
    const content = readFileSync(ENV.VECTOR_CONFIG_PATH, 'utf-8');
    return { content, path: ENV.VECTOR_CONFIG_PATH };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: msg });
  }
});

app.put<{ Body: { content: string } }>('/api/config', async (request, reply) => {
  try {
    const { content } = request.body;
    if (!content || typeof content !== 'string') {
      return reply.status(400).send({ error: 'content field is required (string)' });
    }

    // .bak 백업 생성
    if (existsSync(ENV.VECTOR_CONFIG_PATH)) {
      copyFileSync(ENV.VECTOR_CONFIG_PATH, `${ENV.VECTOR_CONFIG_PATH}.bak`);
    }

    writeFileSync(ENV.VECTOR_CONFIG_PATH, content, 'utf-8');
    return { success: true, message: 'Config saved (backup created as .bak)' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: msg });
  }
});
```

**Step 2: 커밋**

```bash
git add agent-monitor/src/server.ts
git commit -m "feat(agent-monitor): add /api/config routes for TOML management"
```

---

## Task 6: Vector 프로세스 제어 API

**Files:**
- Modify: `agent-monitor/src/server.ts`

**Step 1: /api/vector/start, stop, restart, test-connection 추가**

```typescript
// ─── Vector 프로세스 제어 ──────────────────────────────────────

import { spawn, execSync, ChildProcess } from 'child_process';
import { createConnection } from 'net';

let vectorProcess: ChildProcess | null = null;

app.post('/api/vector/start', async () => {
  // 이미 실행 중인지 확인
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${ENV.VECTOR_API_URL}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) return { success: false, message: 'Vector is already running' };
  } catch { /* not running, proceed */ }

  try {
    vectorProcess = spawn(ENV.VECTOR_BIN_PATH, ['--config', ENV.VECTOR_CONFIG_PATH], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    vectorProcess.on('exit', () => { vectorProcess = null; });
    vectorProcess.unref();

    await new Promise(r => setTimeout(r, 2000));
    return { success: true, message: `Vector started (PID: ${vectorProcess?.pid})` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
});

app.post('/api/vector/stop', async () => {
  if (vectorProcess?.pid) {
    try {
      process.kill(vectorProcess.pid, 'SIGTERM');
      vectorProcess = null;
      await new Promise(r => setTimeout(r, 1000));
      return { success: true, message: 'Vector stopped' };
    } catch { /* fallthrough to taskkill */ }
  }

  try {
    execSync('taskkill /F /IM vector.exe', { stdio: 'ignore' });
    vectorProcess = null;
    return { success: true, message: 'Vector stopped via taskkill' };
  } catch {
    return { success: false, message: 'Failed to stop Vector' };
  }
});

app.post('/api/vector/restart', async () => {
  // stop then start
  try { execSync('taskkill /F /IM vector.exe', { stdio: 'ignore' }); } catch { /* may not be running */ }
  vectorProcess = null;
  await new Promise(r => setTimeout(r, 1500));

  try {
    vectorProcess = spawn(ENV.VECTOR_BIN_PATH, ['--config', ENV.VECTOR_CONFIG_PATH], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    vectorProcess.on('exit', () => { vectorProcess = null; });
    vectorProcess.unref();
    await new Promise(r => setTimeout(r, 2000));
    return { success: true, message: 'Vector restarted' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
});

app.post('/api/vector/test-connection', async (_, reply) => {
  // TOML에서 aggregator 주소 파싱
  try {
    const content = readFileSync(ENV.VECTOR_CONFIG_PATH, 'utf-8');
    const addressMatch = content.match(/address\s*=\s*"([^"]+)"/);
    if (!addressMatch) {
      return reply.status(400).send({ error: 'Cannot find sink address in TOML' });
    }

    const [host, portStr] = addressMatch[1].split(':');
    const port = Number(portStr);

    const result = await new Promise<{ reachable: boolean; latencyMs: number }>((resolve) => {
      const start = Date.now();
      const socket = createConnection({ host, port, timeout: 5000 }, () => {
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({ reachable: true, latencyMs });
      });
      socket.on('error', () => resolve({ reachable: false, latencyMs: 0 }));
      socket.on('timeout', () => { socket.destroy(); resolve({ reachable: false, latencyMs: 0 }); });
    });

    return { address: `${host}:${port}`, ...result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: msg });
  }
});
```

**Step 2: 커밋**

```bash
git add agent-monitor/src/server.ts
git commit -m "feat(agent-monitor): add Vector process control routes"
```

---

## Task 7: 최근 감시 파일 API

**Files:**
- Modify: `agent-monitor/src/server.ts`

**Step 1: /api/logs/recent 라우트 추가**

TOML 설정에서 `include` 패턴을 파싱하여 감시 중인 디렉토리의 최근 파일 목록을 반환한다.

```typescript
// ─── 최근 감시 파일 ──────────────────────────────────────────

import { readdirSync, statSync } from 'fs';
import { basename, dirname } from 'path';
import { glob } from 'fs'; // Node 22+ fs.glob 또는 직접 구현

app.get('/api/logs/recent', async (_, reply) => {
  try {
    const content = readFileSync(ENV.VECTOR_CONFIG_PATH, 'utf-8');
    // include 배열에서 패턴 추출
    const includeMatch = content.match(/include\s*=\s*\[([\s\S]*?)\]/);
    if (!includeMatch) {
      return { files: [], watchPaths: [] };
    }

    // 문자열 패턴들 추출
    const patterns = [...includeMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const watchDirs = [...new Set(patterns.map(p => dirname(p.replace(/\\\\/g, '\\'))))];

    const files: Array<{ name: string; dir: string; modifiedAt: string; sizeBytes: number }> = [];

    for (const dir of watchDirs) {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries.slice(-20)) { // 최근 20개만
          try {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);
            if (stat.isFile()) {
              files.push({
                name: entry,
                dir,
                modifiedAt: stat.mtime.toISOString(),
                sizeBytes: stat.size,
              });
            }
          } catch { /* skip unreadable */ }
        }
      } catch { /* dir not found */ }
    }

    // 최신 순 정렬, 상위 20개
    files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    return { files: files.slice(0, 20), watchPaths: watchDirs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: msg });
  }
});
```

**Step 2: 커밋**

```bash
git add agent-monitor/src/server.ts
git commit -m "feat(agent-monitor): add /api/logs/recent for watched file listing"
```

---

## Task 8: 프론트엔드 HTML UI

**Files:**
- Create: `agent-monitor/public/index.html`

**Context:** 단일 HTML 파일. Tailwind CDN + Material Symbols CDN + vanilla JS. 메인 대시보드의 oklch 색상 시스템 + 다크모드를 차용한다. DESIGN_GUIDELINE.md 참조.

**Step 1: index.html 작성**

파일이 길어질 수 있으므로 주요 섹션별로 구현:

1. **`<head>`**: Tailwind CDN, Material Symbols CDN, Outfit/Fira Code 폰트, oklch CSS 변수
2. **헤더 바**: 설비명 + 버전 + 다크모드 토글
3. **상태 카드 그리드**: Running/Stopped, Uptime, Version (3열)
4. **전송 현황 섹션**: Events In/Out, Errors, Buffer 프로그레스 바
5. **TOML 설정 에디터**: `<textarea>` + 저장/되돌리기 버튼
6. **최근 감시 파일**: 파일 목록 테이블
7. **액션 버튼 바**: 시작/중지/재시작/연결 테스트
8. **`<script>`**: 5초 폴링 + API 호출 + DOM 업데이트 로직

디자인 핵심:
- oklch() 기반 CSS 변수 (라이트/다크)
- `rounded-xl` 카드, `rounded-lg` 버튼
- Material Symbols 아이콘 (`check_circle`, `error`, `settings`, `play_arrow`, `stop`, `restart_alt`)
- 상태 색상: success(`#22c55e`), error(`#ef4444`), warning(`#f59e0b`)
- 다크모드: `.dark` 클래스 토글, `localStorage("theme")` 저장

참고: 이 HTML 파일은 분량이 많으므로 구현 시 500줄 이하로 유지하되, UI가 부족하면 CSS를 inline `<style>`에서 분리하여 `public/style.css`로 분리 가능.

**Step 2: 브라우저 테스트**

Run: `cd agent-monitor && npx tsx src/server.ts`
브라우저에서 `http://localhost:9090` 접속 → UI 확인

**Step 3: 커밋**

```bash
git add agent-monitor/public/index.html
git commit -m "feat(agent-monitor): add single-page monitoring UI"
```

---

## Task 9: server.ts 파일 분리 (300줄 초과 시)

**Context:** `server.ts`가 300줄을 초과하면 라우트를 별도 파일로 분리한다.

**Files:**
- Create: `agent-monitor/src/routes/status.ts` (상태 + 메트릭 라우트)
- Create: `agent-monitor/src/routes/config.ts` (설정 관리 라우트)
- Create: `agent-monitor/src/routes/control.ts` (프로세스 제어 라우트)
- Create: `agent-monitor/src/routes/logs.ts` (로그 미리보기 라우트)
- Modify: `agent-monitor/src/server.ts` (라우트 import + register)

분리 기준:
- `server.ts`: 앱 부트스트랩 + 라우트 등록만 (100줄 이하)
- 각 라우트 파일: Fastify 플러그인 패턴으로 `export default async function(app)` 형태

**Step 1: 분리 구현**

(Task 3~7의 코드를 각 라우트 파일로 이동)

**Step 2: 커밋**

```bash
git add agent-monitor/src/
git commit -m "refactor(agent-monitor): split routes into separate files"
```

---

## Task 10: 통합 테스트 + README

**Files:**
- Create: `agent-monitor/README.md`

**Step 1: README 작성**

설치 가이드, 실행 방법, 환경변수 설명, 스크린샷 placeholder.

**Step 2: 전체 기능 수동 테스트**

1. 서버 시작: `cd agent-monitor && npx tsx src/server.ts`
2. `http://localhost:9090` 접속
3. 상태 카드 확인 (Vector 미실행 시 "Stopped" 표시)
4. TOML 설정 에디터에서 파일 내용 확인
5. 설정 수정 → 저장 → .bak 파일 생성 확인
6. 연결 테스트 버튼 클릭
7. 다크모드 토글 확인
8. 5초 자동 새로고침 동작 확인

**Step 3: 최종 커밋**

```bash
git add agent-monitor/
git commit -m "feat(agent-monitor): complete Agent Monitor with README"
```

---

## Task 순서 의존성

```
Task 1 (스캐폴딩)
  └── Task 2 (서버 기본)
       ├── Task 3 (상태 API)
       ├── Task 4 (메트릭 API)
       ├── Task 5 (설정 API)
       ├── Task 6 (프로세스 제어 API)
       └── Task 7 (로그 API)
            └── Task 8 (프론트엔드 HTML)
                 └── Task 9 (파일 분리, 필요 시)
                      └── Task 10 (테스트 + README)
```

Task 3~7은 서로 독립적이므로 **병렬 구현 가능**.
Task 8은 모든 API가 완성된 후 구현.
