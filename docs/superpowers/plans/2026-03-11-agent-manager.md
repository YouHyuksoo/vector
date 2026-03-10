# Vector Agent Manager 구현 계획서

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 agent-monitor를 Vector Agent Manager로 확장하여 설치/설정/모니터링/제어/서비스 등록을 단일 exe로 제공

**Architecture:** Fastify API 서버에 4개 신규 라우트(setup, install, update, service)를 추가하고, 바닐라 JS 웹 UI를 3-탭 구조(상태/설정/관리)로 전면 개편. 마스터 서버에 vector.exe 다운로드 API를 추가.

**Tech Stack:** TypeScript, Fastify 5, esbuild + pkg (exe 빌드), Tailwind CDN, 바닐라 JS

---

## 파일 구조

### 기존 유지 (수정)
- `agent-monitor/src/server.ts` → 신규 라우트 등록 + 콘솔 로그 이름 변경
- `agent-monitor/src/routes/status.ts` → 기존 유지
- `agent-monitor/src/routes/config.ts` → 기존 유지
- `agent-monitor/src/routes/control.ts` → 기존 유지
- `agent-monitor/src/routes/logs.ts` → 기존 유지
- `agent-monitor/public/index.html` → 탭 기반 UI로 전면 개편
- `agent-monitor/public/app.js` → 3-탭 로직으로 전면 개편
- `agent-monitor/build-exe.mjs` → exe 이름 변경 (agent-manager.exe)
- `agent-monitor/.env.example` → MASTER_SERVER_URL 추가
- `agent-monitor/package.json` → name 변경

### 신규 생성
- `agent-monitor/src/routes/setup.ts` — 설비 정보 TOML 반영 API
- `agent-monitor/src/routes/install.ts` — Vector 다운로드/설치 API
- `agent-monitor/src/routes/update.ts` — Vector 업데이트 확인/실행 API
- `agent-monitor/src/routes/service.ts` — Windows 서비스 등록/해제 API

### 마스터 서버 (신규 라우트)
- `src/server/routes/agent-download.route.ts` — vector.exe 다운로드 + 버전 API
- `src/server/app.ts` — 신규 라우트 등록

---

## Chunk 1: 백엔드 신규 라우트 (setup, install, update, service)

### Task 1: setup.ts — 설비 정보 TOML 반영 API

**Files:**
- Create: `agent-monitor/src/routes/setup.ts`
- Modify: `agent-monitor/src/server.ts`

- [ ] **Step 1: setup.ts 생성**

```typescript
/**
 * @file agent-monitor/src/routes/setup.ts
 * @description 설비 정보 조회/수정 API — TOML의 heartbeat tags + add_metadata 동시 반영
 *
 * 초보자 가이드:
 * 1. GET /api/setup  - 현재 TOML에서 설비 정보(equipment_id, equipment_type, ip 등) 추출
 * 2. PUT /api/setup  - 폼에서 입력한 값을 TOML에 반영 (heartbeat tags + add_metadata 동기화)
 * 3. agent-toml-helpers.ts의 getMeta/setMeta/syncHeartbeatTags 로직을 직접 구현 (프론트 의존성 없이)
 */

import { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ENV } from '../server.js';

/** 설비 정보 필드 */
interface SetupFields {
  equipment_id: string;
  equipment_type: string;
  ip: string;
  line_code: string;
  log_type: string;
  include_paths: string;
  sink_address: string;
  sink_port: string;
}

/** VRL source에서 .key = "value" 추출 */
function getMeta(content: string, key: string): string {
  const m = content.match(new RegExp(`\\.${key}\\s*=\\s*"([^"]*)"`));
  return m?.[1] ?? '';
}

/** VRL source에서 .key = "value" 교체 */
function setMeta(content: string, key: string, value: string): string {
  return content.replace(
    new RegExp(`(\\.${key}\\s*=\\s*")([^"]*)(")`, 'm'),
    `$1${value}$3`,
  );
}

/** heartbeat tags에서 키 값 추출 */
function getHeartbeatTag(content: string, key: string): string {
  const m = content.match(new RegExp(
    `\\[sources\\.heartbeat\\.metrics\\.tags\\][\\s\\S]*?${key}\\s*=\\s*"([^"]*)"`,
  ));
  return m?.[1] ?? '';
}

/** heartbeat tags에서 키 값 교체 */
function setHeartbeatTag(content: string, key: string, value: string): string {
  const tagRegex = new RegExp(
    `(\\[sources\\.heartbeat\\.metrics\\.tags\\][\\s\\S]*?)${key}\\s*=\\s*"[^"]*"`,
  );
  if (tagRegex.test(content)) {
    return content.replace(tagRegex, `$1${key} = "${value}"`);
  }
  return content;
}

/** sink address 추출 */
function getSinkAddr(content: string): [string, string] {
  const m = content.match(/\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*"([^:]+):(\d+)"/);
  return m ? [m[1], m[2]] : ['', ''];
}

/** sink address 교체 */
function setSinkAddr(content: string, ip: string, port: string): string {
  return content.replace(
    /(\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*")[^"]*(")/,
    `$1${ip}:${port}$2`,
  );
}

/** include 배열 추출 */
function getInclude(content: string): string {
  const m = content.match(/include\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return '';
  return m[1].split('\n').map(l => l.replace(/[",]/g, '').trim())
    .filter(Boolean).map(p => p.replace(/\\\\/g, '\\')).join('\n');
}

export default async function setupRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/setup — 현재 설비 정보 추출 */
  app.get('/api/setup', async (_req, reply) => {
    const configPath = ENV.VECTOR_CONFIG_PATH;
    if (!existsSync(configPath)) {
      return reply.status(404).send({ error: 'Config file not found' });
    }

    const content = readFileSync(configPath, 'utf-8');
    const [sinkIp, sinkPort] = getSinkAddr(content);

    const fields: SetupFields = {
      equipment_id: getMeta(content, 'equipment_id'),
      equipment_type: getMeta(content, 'equipment_type'),
      ip: getHeartbeatTag(content, 'ip'),
      line_code: getMeta(content, 'line_code'),
      log_type: getMeta(content, 'log_type'),
      include_paths: getInclude(content),
      sink_address: sinkIp,
      sink_port: sinkPort,
    };
    return reply.send(fields);
  });

  /** PUT /api/setup — 설비 정보를 TOML에 반영 */
  app.put<{ Body: Partial<SetupFields> }>('/api/setup', async (req, reply) => {
    const configPath = ENV.VECTOR_CONFIG_PATH;
    if (!existsSync(configPath)) {
      return reply.status(404).send({ error: 'Config file not found' });
    }

    let content = readFileSync(configPath, 'utf-8');
    const fields = req.body;

    /* .bak 백업 */
    copyFileSync(configPath, configPath + '.bak');

    /* add_metadata VRL source + heartbeat tags 동시 반영 */
    const metaKeys = ['equipment_id', 'equipment_type', 'line_code', 'log_type'] as const;
    for (const key of metaKeys) {
      if (fields[key] !== undefined) {
        content = setMeta(content, key, fields[key]!);
        content = setHeartbeatTag(content, key, fields[key]!);
      }
    }

    /* ip는 heartbeat tags에만 */
    if (fields.ip !== undefined) {
      content = setHeartbeatTag(content, 'ip', fields.ip);
    }

    /* sink address */
    if (fields.sink_address !== undefined || fields.sink_port !== undefined) {
      const [curIp, curPort] = getSinkAddr(content);
      content = setSinkAddr(
        content,
        fields.sink_address ?? curIp,
        fields.sink_port ?? curPort,
      );
    }

    writeFileSync(configPath, content, 'utf-8');
    return reply.send({ success: true, message: '설비 정보가 TOML에 반영되었습니다.' });
  });
}
```

- [ ] **Step 2: server.ts에 setup 라우트 등록**

`agent-monitor/src/server.ts`에 추가:
```typescript
import setupRoutes from './routes/setup.js';
// ... 기존 라우트 등록 아래에
await app.register(setupRoutes);
```

- [ ] **Step 3: 커밋**

```bash
git add agent-monitor/src/routes/setup.ts agent-monitor/src/server.ts
git commit -m "feat(agent-manager): add setup route for equipment TOML config"
```

---

### Task 2: install.ts — Vector 다운로드/설치 API

**Files:**
- Create: `agent-monitor/src/routes/install.ts`
- Modify: `agent-monitor/src/server.ts`
- Modify: `agent-monitor/.env.example`

- [ ] **Step 1: .env.example에 MASTER_SERVER_URL 추가**

```
# 마스터 서버 주소 (Vector 다운로드/업데이트용)
MASTER_SERVER_URL=http://20.10.30.112:3100
```

- [ ] **Step 2: server.ts ENV에 MASTER_SERVER_URL 추가**

```typescript
export const ENV = {
  PORT: Number(process.env.PORT) || 9090,
  VECTOR_API_URL: process.env.VECTOR_API_URL || 'http://127.0.0.1:8686',
  VECTOR_CONFIG_PATH: process.env.VECTOR_CONFIG_PATH || 'C:\\vector\\config\\vector.toml',
  VECTOR_BIN_PATH: process.env.VECTOR_BIN_PATH || 'C:\\vector\\bin\\vector.exe',
  MASTER_SERVER_URL: process.env.MASTER_SERVER_URL || 'http://20.10.30.112:3100',
};
```

- [ ] **Step 3: install.ts 생성**

```typescript
/**
 * @file agent-monitor/src/routes/install.ts
 * @description Vector 바이너리 다운로드/설치 API
 *
 * 초보자 가이드:
 * 1. GET /api/install/status  - Vector 설치 여부 확인 (바이너리 + 설정 파일 존재)
 * 2. POST /api/install        - 마스터 서버에서 vector.exe 다운로드 + 기본 TOML 생성
 * 3. 다운로드 URL: MASTER_SERVER_URL/api/monitor/agent-download/vector
 */

import { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, writeFileSync, createWriteStream } from 'fs';
import { dirname } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { ENV } from '../server.js';

/** 기본 TOML 템플릿 (초기 설치용) */
const DEFAULT_TOML = `# ── Vector Agent 설정 ──
# 이 파일은 Agent Manager가 자동 생성했습니다.
# 설정 탭의 폼 모드에서 설비 정보를 입력하세요.

data_dir = "C:\\\\vector\\\\data"

[api]
enabled = true
address = "0.0.0.0:8686"

# ── [로그 수집] 파일 감시 ──
[sources.work_logs]
type = "file"
include = [
  "C:\\\\logs\\\\*.log",
]

# ── [메타데이터 추가] 설비 정보 삽입 ──
[transforms.add_metadata]
type = "remap"
inputs = ["work_logs"]
source = """
.equipment_type = "UNKNOWN"
.equipment_id = "UNKNOWN"
.line_code = "LINE-01"
.log_type = "INSPECTION"
"""

# ── [하트비트] 주기적 상태 전송 (30초 간격) ──
[sources.heartbeat]
type = "static_metrics"
interval_secs = 30
namespace = "agent"

[[sources.heartbeat.metrics]]
name = "heartbeat"
kind = "absolute"

[sources.heartbeat.metrics.value.gauge]
value = 1

[sources.heartbeat.metrics.tags]
equipment_type = "UNKNOWN"
equipment_id = "UNKNOWN"
line_code = "LINE-01"
log_type = "INSPECTION"
ip = ""

# ── [전송] Aggregator로 전송 ──
[sinks.to_aggregator]
type = "vector"
inputs = ["add_metadata", "heartbeat"]
address = "20.10.30.112:9000"
`;

export default async function installRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/install/status — 설치 상태 확인 */
  app.get('/api/install/status', async (_req, reply) => {
    const binaryExists = existsSync(ENV.VECTOR_BIN_PATH);
    const configExists = existsSync(ENV.VECTOR_CONFIG_PATH);
    return reply.send({
      installed: binaryExists && configExists,
      binaryExists,
      configExists,
      binaryPath: ENV.VECTOR_BIN_PATH,
      configPath: ENV.VECTOR_CONFIG_PATH,
    });
  });

  /** POST /api/install — Vector 다운로드 + 기본 TOML 생성 */
  app.post('/api/install', async (_req, reply) => {
    try {
      /* 디렉토리 생성 */
      const binDir = dirname(ENV.VECTOR_BIN_PATH);
      const configDir = dirname(ENV.VECTOR_CONFIG_PATH);
      if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });
      if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

      /* 마스터 서버에서 vector.exe 다운로드 */
      const downloadUrl = `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/vector`;
      const res = await fetch(downloadUrl);
      if (!res.ok || !res.body) {
        return reply.status(502).send({
          success: false,
          error: `다운로드 실패: HTTP ${res.status}`,
        });
      }

      const ws = createWriteStream(ENV.VECTOR_BIN_PATH);
      await pipeline(Readable.fromWeb(res.body as any), ws);

      /* 기본 TOML 생성 (이미 있으면 건드리지 않음) */
      if (!existsSync(ENV.VECTOR_CONFIG_PATH)) {
        writeFileSync(ENV.VECTOR_CONFIG_PATH, DEFAULT_TOML, 'utf-8');
      }

      /* data 디렉토리 생성 */
      const dataDir = 'C:\\vector\\data';
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

      return reply.send({
        success: true,
        message: 'Vector가 설치되었습니다. 설정 탭에서 설비 정보를 입력하세요.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
```

- [ ] **Step 4: server.ts에 install 라우트 등록**

```typescript
import installRoutes from './routes/install.js';
await app.register(installRoutes);
```

- [ ] **Step 5: 커밋**

```bash
git add agent-monitor/src/routes/install.ts agent-monitor/src/server.ts agent-monitor/.env.example
git commit -m "feat(agent-manager): add install route for Vector download"
```

---

### Task 3: update.ts — Vector 업데이트 확인/실행 API

**Files:**
- Create: `agent-monitor/src/routes/update.ts`
- Modify: `agent-monitor/src/server.ts`

- [ ] **Step 1: update.ts 생성**

```typescript
/**
 * @file agent-monitor/src/routes/update.ts
 * @description Vector 업데이트 확인 및 실행 API
 *
 * 초보자 가이드:
 * 1. GET /api/update/check     - 마스터 서버의 최신 버전과 현재 로컬 버전 비교
 * 2. POST /api/update/execute  - 새 vector.exe 다운로드 후 교체 (Vector 중지 → 교체 → 재시작)
 * 3. 로컬 버전은 `vector.exe --version` 명령으로 확인
 * 4. 서버 버전은 MASTER_SERVER_URL/api/monitor/agent-download/version 으로 확인
 */

import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { existsSync, renameSync, unlinkSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { ENV } from '../server.js';

/** 로컬 Vector 버전 조회 */
function getLocalVersion(): string | null {
  try {
    if (!existsSync(ENV.VECTOR_BIN_PATH)) return null;
    const out = execSync(`"${ENV.VECTOR_BIN_PATH}" --version`, {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });
    const m = out.match(/vector\s+(\S+)/i);
    return m?.[1] ?? out.trim();
  } catch {
    return null;
  }
}

/** Vector PID 찾기 */
function findVectorPid(): number | null {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq vector.exe" /FO CSV /NH', {
      encoding: 'utf-8', timeout: 3000, windowsHide: true,
    });
    const m = out.match(/"vector\.exe","(\d+)"/i);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

export default async function updateRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/update/check — 버전 비교 */
  app.get('/api/update/check', async (_req, reply) => {
    const localVersion = getLocalVersion();

    let serverVersion: string | null = null;
    try {
      const res = await fetch(
        `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/version`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = await res.json() as { version?: string };
        serverVersion = data.version ?? null;
      }
    } catch { /* 서버 연결 불가 */ }

    const updateAvailable = !!(
      localVersion && serverVersion && localVersion !== serverVersion
    );

    return reply.send({
      localVersion,
      serverVersion,
      updateAvailable,
    });
  });

  /** POST /api/update/execute — Vector 업데이트 실행 */
  app.post('/api/update/execute', async (_req, reply) => {
    try {
      /* 1. Vector 프로세스 중지 */
      const pid = findVectorPid();
      if (pid) {
        execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, windowsHide: true });
        await new Promise(r => setTimeout(r, 2000));
      }

      /* 2. 기존 바이너리 백업 */
      const backupPath = ENV.VECTOR_BIN_PATH + '.old';
      if (existsSync(ENV.VECTOR_BIN_PATH)) {
        if (existsSync(backupPath)) unlinkSync(backupPath);
        renameSync(ENV.VECTOR_BIN_PATH, backupPath);
      }

      /* 3. 새 바이너리 다운로드 */
      const downloadUrl = `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/vector`;
      const res = await fetch(downloadUrl);
      if (!res.ok || !res.body) {
        /* 다운로드 실패 시 백업 복원 */
        if (existsSync(backupPath)) renameSync(backupPath, ENV.VECTOR_BIN_PATH);
        return reply.status(502).send({
          success: false,
          error: `다운로드 실패: HTTP ${res.status}`,
        });
      }

      const ws = createWriteStream(ENV.VECTOR_BIN_PATH);
      await pipeline(Readable.fromWeb(res.body as any), ws);

      /* 4. 새 버전 확인 */
      const newVersion = getLocalVersion();

      return reply.send({
        success: true,
        version: newVersion,
        message: '업데이트 완료. 관리 탭에서 Vector를 시작하세요.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
```

- [ ] **Step 2: server.ts에 update 라우트 등록**

```typescript
import updateRoutes from './routes/update.js';
await app.register(updateRoutes);
```

- [ ] **Step 3: 커밋**

```bash
git add agent-monitor/src/routes/update.ts agent-monitor/src/server.ts
git commit -m "feat(agent-manager): add update route for Vector binary updates"
```

---

### Task 4: service.ts — Windows 서비스 등록/해제 API

**Files:**
- Create: `agent-monitor/src/routes/service.ts`
- Modify: `agent-monitor/src/server.ts`

- [ ] **Step 1: service.ts 생성**

```typescript
/**
 * @file agent-monitor/src/routes/service.ts
 * @description Windows 서비스 등록/해제/상태 API
 *
 * 초보자 가이드:
 * 1. GET /api/service/status     - VectorAgent + VectorAgentManager 서비스 상태
 * 2. POST /api/service/install   - sc create로 Windows 서비스 등록
 * 3. POST /api/service/uninstall - sc delete로 Windows 서비스 해제
 * 4. 관리자 권한이 필요합니다 — 권한 부족 시 에러 반환
 */

import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { ENV } from '../server.js';

const SVC_VECTOR = 'VectorAgent';
const SVC_MANAGER = 'VectorAgentManager';

/** 서비스 상태 조회 (sc query) */
function getServiceState(name: string): string {
  try {
    const out = execSync(`sc query "${name}"`, {
      encoding: 'utf-8', timeout: 5000, windowsHide: true,
    });
    const m = out.match(/STATE\s*:\s*\d+\s+(\w+)/);
    return m?.[1] ?? 'UNKNOWN';
  } catch {
    return 'NOT_INSTALLED';
  }
}

/** sc create 실행 */
function installService(name: string, binPath: string): { success: boolean; error?: string } {
  try {
    execSync(`sc create "${name}" binPath= "${binPath}" start= auto`, {
      encoding: 'utf-8', timeout: 10000, windowsHide: true,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Access is denied')) {
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }
    return { success: false, error: message };
  }
}

/** sc delete 실행 */
function uninstallService(name: string): { success: boolean; error?: string } {
  try {
    /* 먼저 중지 시도 */
    try { execSync(`sc stop "${name}"`, { timeout: 10000, windowsHide: true }); } catch { /* 이미 중지 */ }
    execSync(`sc delete "${name}"`, {
      encoding: 'utf-8', timeout: 10000, windowsHide: true,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Access is denied')) {
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }
    return { success: false, error: message };
  }
}

export default async function serviceRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/service/status — 서비스 상태 조회 */
  app.get('/api/service/status', async (_req, reply) => {
    return reply.send({
      vector: {
        name: SVC_VECTOR,
        state: getServiceState(SVC_VECTOR),
      },
      manager: {
        name: SVC_MANAGER,
        state: getServiceState(SVC_MANAGER),
      },
    });
  });

  /** POST /api/service/install — 서비스 등록 */
  app.post<{ Body: { target: 'vector' | 'manager' | 'both' } }>(
    '/api/service/install', async (req, reply) => {
      const { target = 'both' } = req.body || {};
      const results: Record<string, any> = {};

      if (target === 'vector' || target === 'both') {
        const binPath = `${ENV.VECTOR_BIN_PATH} --config ${ENV.VECTOR_CONFIG_PATH}`;
        results.vector = installService(SVC_VECTOR, binPath);
      }
      if (target === 'manager' || target === 'both') {
        const exePath = process.execPath;
        results.manager = installService(SVC_MANAGER, exePath);
      }

      const allSuccess = Object.values(results).every((r: any) => r.success);
      return reply.status(allSuccess ? 200 : 500).send(results);
    },
  );

  /** POST /api/service/uninstall — 서비스 해제 */
  app.post<{ Body: { target: 'vector' | 'manager' | 'both' } }>(
    '/api/service/uninstall', async (req, reply) => {
      const { target = 'both' } = req.body || {};
      const results: Record<string, any> = {};

      if (target === 'vector' || target === 'both') {
        results.vector = uninstallService(SVC_VECTOR);
      }
      if (target === 'manager' || target === 'both') {
        results.manager = uninstallService(SVC_MANAGER);
      }

      const allSuccess = Object.values(results).every((r: any) => r.success);
      return reply.status(allSuccess ? 200 : 500).send(results);
    },
  );
}
```

- [ ] **Step 2: server.ts 최종 — 모든 신규 라우트 등록 + 이름 변경**

`agent-monitor/src/server.ts` 수정 사항:
```typescript
// 상단 import 추가
import setupRoutes from './routes/setup.js';
import installRoutes from './routes/install.js';
import updateRoutes from './routes/update.js';
import serviceRoutes from './routes/service.js';

// ENV에 MASTER_SERVER_URL 추가
export const ENV = {
  PORT: Number(process.env.PORT) || 9090,
  VECTOR_API_URL: process.env.VECTOR_API_URL || 'http://127.0.0.1:8686',
  VECTOR_CONFIG_PATH: process.env.VECTOR_CONFIG_PATH || 'C:\\vector\\config\\vector.toml',
  VECTOR_BIN_PATH: process.env.VECTOR_BIN_PATH || 'C:\\vector\\bin\\vector.exe',
  MASTER_SERVER_URL: process.env.MASTER_SERVER_URL || 'http://20.10.30.112:3100',
};

// 기존 라우트 등록 아래에 신규 라우트 등록
await app.register(setupRoutes);
await app.register(installRoutes);
await app.register(updateRoutes);
await app.register(serviceRoutes);

// 콘솔 로그 변경
console.log(`\n  Agent Manager running at http://localhost:${ENV.PORT}\n`);
console.log(`  Master server: ${ENV.MASTER_SERVER_URL}`);
```

- [ ] **Step 3: package.json name 변경**

```json
"name": "vector-agent-manager"
```

- [ ] **Step 4: 커밋**

```bash
git add agent-monitor/src/routes/service.ts agent-monitor/src/server.ts agent-monitor/.env.example agent-monitor/package.json
git commit -m "feat(agent-manager): add service, install, update routes + rename to agent-manager"
```

---

## Chunk 2: 마스터 서버 vector.exe 다운로드 API

### Task 5: agent-download.route.ts — 바이너리 호스팅 API

**Files:**
- Create: `src/server/routes/agent-download.route.ts`
- Modify: `src/server/app.ts`

- [ ] **Step 1: vector-bin 디렉토리 생성**

```bash
mkdir -p vector-bin
```

마스터 서버의 `vector-bin/` 디렉토리에 vector.exe를 수동으로 배치.
`vector-bin/version.json`에 버전 정보:
```json
{ "version": "0.45.0", "updatedAt": "2026-03-11" }
```

- [ ] **Step 2: agent-download.route.ts 생성**

```typescript
/**
 * @file src/server/routes/agent-download.route.ts
 * @description Vector 바이너리 다운로드 + 버전 정보 API
 *
 * 초보자 가이드:
 * 1. GET /api/monitor/agent-download/vector  — vector.exe 바이너리 스트림 다운로드
 * 2. GET /api/monitor/agent-download/version — vector-bin/version.json 반환
 * 3. vector-bin/ 디렉토리에 vector.exe + version.json을 수동 배치
 */

import { FastifyPluginAsync } from 'fastify';
import { existsSync, readFileSync, createReadStream, statSync } from 'fs';
import { join } from 'path';

const VECTOR_BIN_DIR = join(process.cwd(), 'vector-bin');

export const agentDownloadRoute: FastifyPluginAsync = async (app) => {
  /** GET /api/monitor/agent-download/version — 버전 정보 */
  app.get('/api/monitor/agent-download/version', async (_req, reply) => {
    const versionPath = join(VECTOR_BIN_DIR, 'version.json');
    if (!existsSync(versionPath)) {
      return reply.status(404).send({ error: 'version.json not found' });
    }
    const data = JSON.parse(readFileSync(versionPath, 'utf-8'));
    return reply.send(data);
  });

  /** GET /api/monitor/agent-download/vector — vector.exe 다운로드 */
  app.get('/api/monitor/agent-download/vector', async (_req, reply) => {
    const binaryPath = join(VECTOR_BIN_DIR, 'vector.exe');
    if (!existsSync(binaryPath)) {
      return reply.status(404).send({ error: 'vector.exe not found in vector-bin/' });
    }

    const stat = statSync(binaryPath);
    const stream = createReadStream(binaryPath);

    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', 'attachment; filename="vector.exe"')
      .header('Content-Length', stat.size)
      .send(stream);
  });
};
```

- [ ] **Step 3: app.ts에 라우트 등록**

```typescript
import { agentDownloadRoute } from './routes/agent-download.route.js';
await app.register(agentDownloadRoute);
```

- [ ] **Step 4: 커밋**

```bash
git add src/server/routes/agent-download.route.ts src/server/app.ts
git commit -m "feat(server): add agent-download route for Vector binary hosting"
```

---

## Chunk 3: 웹 UI 전면 개편 (탭 기반 대시보드)

### Task 6: index.html — 3탭 구조 (상태/설정/관리)

**Files:**
- Modify: `agent-monitor/public/index.html` (전면 개편)

- [ ] **Step 1: index.html 전면 재작성**

탭 구조:
1. **상태 탭**: 기존 상태 카드 + 메트릭 + 최근 파일 (기존 UI 유지)
2. **설정 탭**: 폼 모드 (설비 정보 입력) + TOML 직접 편집 모드 전환
3. **관리 탭**: 시작/중지/재시작, 연결 테스트, 서비스 등록/해제, 설치, 업데이트

핵심 변경사항:
- 헤더 타이틀: "Agent Monitor" → "Agent Manager"
- 탭 네비게이션 바 추가 (3탭)
- 기존 콘텐츠를 탭별 `<div>` 안에 배치
- 설정 탭: 폼/TOML 토글 버튼 + 설비 정보 폼 필드
- 관리 탭: 기존 액션 버튼 이동 + 서비스/설치/업데이트 섹션 추가

HTML은 500줄 이하로 유지 (기존 329줄 → 약 480줄).

구체적인 HTML 구조는 기존 index.html의 스타일 시스템(oklch, Tailwind config, Material Symbols)을 그대로 유지하면서 탭 레이아웃만 변경.

- [ ] **Step 2: 커밋**

```bash
git add agent-monitor/public/index.html
git commit -m "feat(agent-manager): redesign web UI with 3-tab dashboard layout"
```

---

### Task 7: app.js — 탭 전환 + 신규 API 연동 로직

**Files:**
- Modify: `agent-monitor/public/app.js` (전면 개편)

- [ ] **Step 1: app.js를 탭 모듈 구조로 개편**

app.js 500줄 이하로 유지하면서 추가할 기능:
- 탭 전환 로직 (`switchTab('status' | 'settings' | 'management')`)
- 설정 탭: 폼 모드 ↔ TOML 편집 모드 전환
  - `loadSetup()` — GET /api/setup으로 폼 필드 채우기
  - `saveSetup()` — PUT /api/setup으로 폼 데이터 전송
  - 기존 `loadConfig()` / `saveConfig()` — TOML 직접 편집
- 관리 탭:
  - `checkInstall()` — GET /api/install/status
  - `installVector()` — POST /api/install
  - `checkUpdate()` — GET /api/update/check
  - `executeUpdate()` — POST /api/update/execute
  - `loadServiceStatus()` — GET /api/service/status
  - `installService(target)` — POST /api/service/install
  - `uninstallService(target)` — POST /api/service/uninstall
- 기존 시작/중지/재시작/연결테스트 로직은 관리 탭으로 이동

기존 유틸리티 함수(fetchJSON, formatBytes, formatDate, formatNum, esc, showToast, darkMode)는 그대로 유지.

- [ ] **Step 2: 커밋**

```bash
git add agent-monitor/public/app.js
git commit -m "feat(agent-manager): implement tab logic + setup/install/update/service APIs"
```

---

## Chunk 4: 빌드 + 통합 확인

### Task 8: build-exe.mjs 수정 + exe 빌드

**Files:**
- Modify: `agent-monitor/build-exe.mjs`

- [ ] **Step 1: build-exe.mjs에서 exe 이름 변경**

```javascript
// 기존: agent-monitor.exe → 변경: agent-manager.exe
`npx pkg ${join(DIST, 'entry.cjs')} --targets node20-win-x64 --output ${join(DIST, 'agent-manager.exe')} --compress GZip`
```

콘솔 로그도 변경:
```javascript
console.log('  Files:  agent-manager.exe + server.mjs + public/ + .env');
```

- [ ] **Step 2: exe 빌드 실행**

```bash
cd agent-monitor && node build-exe.mjs
```

- [ ] **Step 3: 로컬 테스트**

```bash
cd dist-exe && ./agent-manager.exe
```

브라우저에서 `http://localhost:9090` 접속하여 3개 탭 동작 확인:
- 상태 탭: Vector 상태/메트릭 표시
- 설정 탭: 폼 모드로 설비 정보 입력/저장, TOML 편집 모드 전환
- 관리 탭: 시작/중지/재시작, 서비스 상태, 설치/업데이트 상태

- [ ] **Step 4: 최종 커밋**

```bash
git add agent-monitor/build-exe.mjs agent-monitor/dist-exe/
git commit -m "build(agent-manager): rename exe + rebuild agent-manager.exe"
```
