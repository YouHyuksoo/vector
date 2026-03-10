# Equipment 페이지 원격 장비 관리 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Equipment 페이지에서 장비 카드 클릭 시 원격 agent-monitor(9090)에 프록시 접속하여 상태/설정/제어/로그를 관리하는 기능 구현

**Architecture:** 마스터 서버 백엔드에 프록시 라우트를 추가하여 heartbeat에서 수집한 IP로 원격 agent-monitor에 중계. 프론트엔드 Equipment 페이지의 장비 카드 클릭 시 기존 처리내역 외에 상태/설정/제어/로그 탭을 추가.

**Tech Stack:** Fastify (백엔드 프록시), Next.js React (프론트엔드 탭 UI), agent-monitor REST API (포트 9090)

---

## 파일 구조

### 백엔드 (신규)
- `src/server/routes/remote-agent.route.ts` — 원격 agent-monitor 프록시 라우트

### 프론트엔드 (신규)
- `frontend/src/app/dashboard/equipment/components/RemoteTabPanel.tsx` — 탭 컨테이너 (처리내역/상태/설정/제어/로그)
- `frontend/src/app/dashboard/equipment/components/RemoteStatusTab.tsx` — 상태+메트릭 탭
- `frontend/src/app/dashboard/equipment/components/RemoteConfigTab.tsx` — TOML 설정 탭
- `frontend/src/app/dashboard/equipment/components/RemoteControlTab.tsx` — 제어 탭
- `frontend/src/app/dashboard/equipment/components/RemoteLogsTab.tsx` — 로그 파일 탭

### 프론트엔드 (수정)
- `frontend/src/app/dashboard/components/CollectorGrid.tsx` — 카드 클릭 시 RemoteTabPanel 렌더링
- `frontend/src/locales/ko.json` — remote 관련 번역 키 추가
- `frontend/src/locales/en.json` — remote 관련 번역 키 추가
- `frontend/src/locales/es.json` — remote 관련 번역 키 추가

### 백엔드 (수정)
- `src/config/env.ts` — AGENT_MONITOR_PORT 환경변수 추가

---

## Chunk 1: 백엔드 프록시 라우트

### Task 1: 환경변수에 AGENT_MONITOR_PORT 추가

**Files:**
- Modify: `src/config/env.ts:16-30`

- [ ] **Step 1: env.ts에 AGENT_MONITOR_PORT 추가**

`envSchema`에 필드 추가:

```typescript
AGENT_MONITOR_PORT: z.coerce.number().default(9090),
```

`HEARTBEAT_TTL_SECONDS` 아래에 추가.

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/config/env.ts
git commit -m "feat: add AGENT_MONITOR_PORT env variable (default 9090)"
```

---

### Task 2: 원격 agent-monitor 프록시 라우트 생성

**Files:**
- Create: `src/server/routes/remote-agent.route.ts`
- Modify: `src/server/index.ts` 또는 라우트 등록 파일

- [ ] **Step 1: remote-agent.route.ts 생성**

```typescript
/**
 * @file src/server/routes/remote-agent.route.ts
 * @description 원격 장비 agent-monitor(9090) 프록시 라우트
 *
 * 초보자 가이드:
 * 1. 프론트엔드 → 마스터서버 → agent-monitor로 요청 중계
 * 2. heartbeat store에서 equipmentId로 장비 IP 조회
 * 3. IP:9090으로 HTTP 요청을 보내고 응답을 그대로 반환
 */

import { FastifyPluginAsync } from 'fastify';
import { heartbeatService } from '../../services/heartbeat.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/** agent-monitor에 HTTP 요청을 보내는 공통 함수 */
async function proxyToAgent(
  ip: string,
  path: string,
  method: 'GET' | 'PUT' | 'POST' = 'GET',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `http://${ip}:${env.AGENT_MONITOR_PORT}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    logger.warn({ ip, path, error: String(err) }, 'Agent-monitor proxy failed');
    return { ok: false, status: 0, data: { error: 'Agent monitor unreachable', detail: String(err) } };
  } finally {
    clearTimeout(timeout);
  }
}

/** equipmentId로 IP를 조회하는 공통 함수 */
function resolveIp(equipmentId: string): string | null {
  const status = heartbeatService.getStatus(equipmentId);
  if (!status) return null;
  const ip = (status.metadata as Record<string, string>)?.ip;
  return ip || null;
}

export const remoteAgentRoute: FastifyPluginAsync = async (app) => {

  /** 원격 장비 상태 조회 */
  app.get('/api/monitor/remote/:equipmentId/status', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline', reachable: false });

    const result = await proxyToAgent(ip, '/api/status');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip, error: 'Agent monitor unreachable' });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 메트릭 조회 */
  app.get('/api/monitor/remote/:equipmentId/metrics', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline' });

    const result = await proxyToAgent(ip, '/api/metrics');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 TOML 설정 조회 */
  app.get('/api/monitor/remote/:equipmentId/config', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline' });

    const result = await proxyToAgent(ip, '/api/config');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 TOML 설정 저장 */
  app.put('/api/monitor/remote/:equipmentId/config', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const { content } = request.body as { content: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline' });
    if (!content || typeof content !== 'string') {
      return reply.status(400).send({ error: 'Invalid content' });
    }

    const result = await proxyToAgent(ip, '/api/config', 'PUT', { content });
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 Vector 제어 (start / stop / restart / test-connection) */
  app.post('/api/monitor/remote/:equipmentId/control/:action', async (request, reply) => {
    const { equipmentId, action } = request.params as { equipmentId: string; action: string };
    const validActions = ['start', 'stop', 'restart', 'test-connection'];
    if (!validActions.includes(action)) {
      return reply.status(400).send({ error: `Invalid action: ${action}` });
    }
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline' });

    const result = await proxyToAgent(ip, `/api/vector/${action}`, 'POST');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });

  /** 원격 장비 감시 로그 파일 목록 */
  app.get('/api/monitor/remote/:equipmentId/logs', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const ip = resolveIp(equipmentId);
    if (!ip) return reply.status(404).send({ error: 'Equipment not found or offline' });

    const result = await proxyToAgent(ip, '/api/logs/recent');
    if (!result.ok && result.status === 0) {
      return reply.send({ reachable: false, ip });
    }
    return reply.status(result.status || 200).send({ reachable: true, ip, ...(result.data as object) });
  });
};
```

- [ ] **Step 2: 라우트를 서버에 등록**

서버 진입점 파일(app 생성 부분)에서 `remoteAgentRoute`를 등록. 기존 monitorRoute 등록 방식을 따른다.

```typescript
import { remoteAgentRoute } from './routes/remote-agent.route.js';
// ... 기존 등록 코드 아래에
app.register(remoteAgentRoute);
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/server/routes/remote-agent.route.ts src/server/index.ts src/config/env.ts
git commit -m "feat: add remote agent-monitor proxy routes"
```

---

## Chunk 2: 프론트엔드 i18n 번역 키 추가

### Task 3: 3개 언어 파일에 remote 관련 번역 키 추가

**Files:**
- Modify: `frontend/src/locales/ko.json`
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/es.json`

- [ ] **Step 1: ko.json에 remote 섹션 추가**

`collector` 섹션 뒤에 추가:

```json
"remote": {
  "tabs": {
    "activity": "처리내역",
    "status": "상태",
    "config": "설정",
    "control": "제어",
    "logs": "로그"
  },
  "status": {
    "title": "Vector 프로세스 상태",
    "running": "실행 중",
    "stopped": "중지됨",
    "pid": "PID",
    "uptime": "가동시간",
    "version": "버전",
    "apiReachable": "API 연결",
    "metrics": "전송 메트릭",
    "eventsIn": "수신 이벤트",
    "eventsOut": "전송 이벤트",
    "errors": "오류",
    "unreachable": "Agent Monitor에 연결할 수 없습니다",
    "offline": "장비가 오프라인입니다"
  },
  "config": {
    "title": "원격 TOML 설정",
    "load": "불러오기",
    "save": "저장",
    "saving": "저장 중...",
    "saved": "저장되었습니다",
    "saveFailed": "저장 실패",
    "restartHint": "설정 반영을 위해 제어 탭에서 재시작하세요",
    "noContent": "설정을 불러올 수 없습니다"
  },
  "control": {
    "title": "Vector 프로세스 제어",
    "start": "시작",
    "stop": "중지",
    "restart": "재시작",
    "testConnection": "연결 테스트",
    "starting": "시작 중...",
    "stopping": "중지 중...",
    "restarting": "재시작 중...",
    "testing": "테스트 중...",
    "connected": "연결 성공",
    "disconnected": "연결 실패",
    "confirmStop": "Vector를 중지하시겠습니까?",
    "confirmRestart": "Vector를 재시작하시겠습니까?"
  },
  "logs": {
    "title": "감시 대상 파일",
    "fileName": "파일명",
    "directory": "디렉토리",
    "size": "크기",
    "modified": "수정일",
    "watchPaths": "감시 경로",
    "noFiles": "감시 대상 파일 없음"
  }
}
```

- [ ] **Step 2: en.json에 remote 섹션 추가**

동일 구조의 영어 번역 추가.

- [ ] **Step 3: es.json에 remote 섹션 추가**

동일 구조의 스페인어 번역 추가.

- [ ] **Step 4: 빌드 확인**

Run: `cd frontend && npx next build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/locales/ko.json frontend/src/locales/en.json frontend/src/locales/es.json
git commit -m "feat: add remote agent management i18n keys (ko/en/es)"
```

---

## Chunk 3: 프론트엔드 탭 컴포넌트

### Task 4: RemoteTabPanel 탭 컨테이너 생성

**Files:**
- Create: `frontend/src/app/dashboard/equipment/components/RemoteTabPanel.tsx`

- [ ] **Step 1: RemoteTabPanel.tsx 생성**

탭 전환 로직 + 각 탭 컴포넌트 lazy import. props로 `equipmentId`, `logs`(기존 처리내역) 수신.

탭 목록: 처리내역 | 상태 | 설정 | 제어 | 로그

```typescript
/**
 * @file RemoteTabPanel.tsx — 원격 장비 관리 탭 컨테이너
 * @description 장비 카드 클릭 시 표시. 처리내역/상태/설정/제어/로그 탭 전환.
 *   초보자 가이드: Equipment 페이지에서 장비 선택 시 인라인으로 열리는 관리 패널입니다.
 */
'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { RemoteStatusTab } from './RemoteStatusTab';
import { RemoteConfigTab } from './RemoteConfigTab';
import { RemoteControlTab } from './RemoteControlTab';
import { RemoteLogsTab } from './RemoteLogsTab';

// ActivityPanel은 CollectorGrid에서 분리하여 import하거나 여기에 props로 받는다
interface LogEntry { LOG_ID?: number; SOURCE_TABLE?: string; EQUIPMENT_ID: string; MESSAGE?: string; STAGE?: string; STATUS: string; CREATED_AT?: string }

const TABS = ['activity', 'status', 'config', 'control', 'logs'] as const;
type Tab = typeof TABS[number];

const TAB_ICONS: Record<Tab, string> = {
  activity: 'history',
  status: 'monitor_heart',
  config: 'settings',
  control: 'power_settings_new',
  logs: 'folder_open',
};

interface Props {
  equipmentId: string;
  logs: LogEntry[];
  activityPanel: React.ReactNode;
}

export function RemoteTabPanel({ equipmentId, logs, activityPanel }: Props) {
  const [tab, setTab] = useState<Tab>('activity');
  const { t } = useI18n();

  return (
    <div className="mt-1 rounded-lg border border-primary/20 bg-white dark:bg-background-dark
      animate-in slide-in-from-top-1 duration-200">
      {/* 탭 헤더 */}
      <div className="flex border-b border-border/50 dark:border-border-dark/50 overflow-x-auto">
        {TABS.map(tb => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap
              transition-colors border-b-2
              ${tab === tb
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
          >
            <Icon name={TAB_ICONS[tb]} size="xs" />
            {t(`remote.tabs.${tb}`)}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="p-3">
        {tab === 'activity' && activityPanel}
        {tab === 'status' && <RemoteStatusTab equipmentId={equipmentId} />}
        {tab === 'config' && <RemoteConfigTab equipmentId={equipmentId} />}
        {tab === 'control' && <RemoteControlTab equipmentId={equipmentId} />}
        {tab === 'logs' && <RemoteLogsTab equipmentId={equipmentId} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/equipment/components/RemoteTabPanel.tsx
git commit -m "feat: add RemoteTabPanel tab container component"
```

---

### Task 5: RemoteStatusTab 상태 탭 생성

**Files:**
- Create: `frontend/src/app/dashboard/equipment/components/RemoteStatusTab.tsx`

- [ ] **Step 1: RemoteStatusTab.tsx 생성**

`/api/monitor/remote/:id/status` + `/api/monitor/remote/:id/metrics` 호출하여 표시.

표시 항목:
- 연결 상태 (reachable / unreachable)
- Vector 실행 여부, PID, uptime, version
- 전송 메트릭 (eventsIn, eventsOut, errors)

```typescript
/**
 * @file RemoteStatusTab.tsx — 원격 장비 상태 + 메트릭 탭
 * @description agent-monitor의 /api/status, /api/metrics를 프록시로 조회하여 표시.
 *   초보자 가이드: 원격 장비의 Vector 프로세스 상태와 전송 통계를 실시간으로 보여줍니다.
 */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface StatusData {
  reachable: boolean;
  running?: boolean;
  pid?: number | null;
  uptime?: string;
  version?: string;
  apiReachable?: boolean;
  ip?: string;
}

interface MetricsData {
  reachable: boolean;
  eventsIn?: number;
  eventsOut?: number;
  errors?: number;
}

export function RemoteStatusTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, mRes] = await Promise.all([
        fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/status`),
        fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/metrics`),
      ]);
      setStatus(await sRes.json());
      setMetrics(await mRes.json());
    } catch {
      setStatus({ reachable: false });
      setMetrics({ reachable: false });
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.reachable) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        <Icon name="cloud_off" size="lg" className="text-destructive mb-2 mx-auto block" />
        {t('remote.status.unreachable')}
        <button onClick={load} className="block mx-auto mt-2 text-xs text-primary hover:underline">
          {t('common.retry') || 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Vector 프로세스 상태 */}
      <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
        <span>{t('remote.status.title')}</span>
        <button onClick={load} className="p-1 hover:bg-surface dark:hover:bg-surface-dark rounded transition-colors">
          <Icon name="refresh" size="xs" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat
          label={t('remote.status.running')}
          value={status.running ? 'ON' : 'OFF'}
          color={status.running ? 'text-primary' : 'text-destructive'}
        />
        <Stat label={t('remote.status.pid')} value={status.pid ?? '—'} />
        <Stat label={t('remote.status.uptime')} value={status.uptime || '—'} />
        <Stat label={t('remote.status.version')} value={status.version || '—'} />
      </div>

      {/* 전송 메트릭 */}
      {metrics?.reachable && (
        <>
          <div className="text-xs font-semibold text-muted-foreground">{t('remote.status.metrics')}</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label={t('remote.status.eventsIn')} value={metrics.eventsIn ?? 0} color="text-primary" />
            <Stat label={t('remote.status.eventsOut')} value={metrics.eventsOut ?? 0} color="text-accent" />
            <Stat
              label={t('remote.status.errors')}
              value={metrics.errors ?? 0}
              color={(metrics.errors ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg bg-surface/50 dark:bg-surface-dark/50 p-2 text-center">
      <div className="text-[10px] text-muted-foreground/60 mb-0.5">{label}</div>
      <div className={`text-sm font-mono font-bold ${color || 'text-foreground dark:text-white'}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/equipment/components/RemoteStatusTab.tsx
git commit -m "feat: add RemoteStatusTab component"
```

---

### Task 6: RemoteConfigTab 설정 탭 생성

**Files:**
- Create: `frontend/src/app/dashboard/equipment/components/RemoteConfigTab.tsx`

- [ ] **Step 1: RemoteConfigTab.tsx 생성**

원격 TOML 조회/편집/저장. syncHeartbeatTags를 재활용하여 두 곳 동시 수정.

```typescript
/**
 * @file RemoteConfigTab.tsx — 원격 장비 TOML 설정 탭
 * @description agent-monitor의 /api/config를 프록시로 조회/저장.
 *   초보자 가이드: 원격 장비의 Vector TOML 설정을 웹에서 편집하고 저장할 수 있습니다.
 */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

export function RemoteConfigTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/config`);
      const data = await res.json();
      if (data.reachable === false) {
        setMsg({ type: 'err', text: t('remote.status.unreachable') });
        return;
      }
      setContent(data.content || '');
      setOriginal(data.content || '');
    } catch {
      setMsg({ type: 'err', text: t('remote.config.noContent') });
    } finally {
      setLoading(false);
    }
  }, [equipmentId, t]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setOriginal(content);
        setMsg({ type: 'ok', text: `${t('remote.config.saved')} — ${t('remote.config.restartHint')}` });
      } else {
        setMsg({ type: 'err', text: data.error || t('remote.config.saveFailed') });
      }
    } catch {
      setMsg({ type: 'err', text: t('remote.config.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== original;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{t('remote.config.title')}</span>
        <div className="flex items-center gap-1">
          <button onClick={load}
            className="p-1 hover:bg-surface dark:hover:bg-surface-dark rounded transition-colors">
            <Icon name="refresh" size="xs" />
          </button>
          <button onClick={handleSave} disabled={!hasChanges || saving}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors
              ${hasChanges ? 'bg-primary text-white hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
            {saving ? t('remote.config.saving') : t('remote.config.save')}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`text-xs px-2 py-1 rounded ${msg.type === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {msg.text}
        </div>
      )}

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        className="w-full h-64 text-xs font-mono p-2 rounded-lg border resize-y
          bg-background dark:bg-background-dark
          border-border dark:border-border-dark
          focus:ring-1 focus:ring-primary focus:outline-none"
        spellCheck={false}
      />
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/equipment/components/RemoteConfigTab.tsx
git commit -m "feat: add RemoteConfigTab component"
```

---

### Task 7: RemoteControlTab 제어 탭 생성

**Files:**
- Create: `frontend/src/app/dashboard/equipment/components/RemoteControlTab.tsx`

- [ ] **Step 1: RemoteControlTab.tsx 생성**

시작/중지/재시작 버튼 + 연결 테스트.

```typescript
/**
 * @file RemoteControlTab.tsx — 원격 장비 Vector 프로세스 제어 탭
 * @description agent-monitor의 /api/vector/start|stop|restart|test-connection 프록시 호출.
 *   초보자 가이드: 원격 장비의 Vector 프로세스를 웹에서 시작/중지/재시작할 수 있습니다.
 */
'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

type Action = 'start' | 'stop' | 'restart' | 'test-connection';

export function RemoteControlTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const execute = async (action: Action) => {
    if (action === 'stop' && !confirm(t('remote.control.confirmStop'))) return;
    if (action === 'restart' && !confirm(t('remote.control.confirmRestart'))) return;

    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/control/${action}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.reachable === false) {
        setResult({ type: 'err', text: t('remote.status.unreachable') });
      } else if (data.success || data.connected) {
        const msg = action === 'test-connection'
          ? `${t('remote.control.connected')} (${data.host}:${data.port})`
          : `${action} OK` + (data.pid ? ` (PID: ${data.pid})` : '');
        setResult({ type: 'ok', text: msg });
      } else {
        setResult({ type: 'err', text: data.error || 'Failed' });
      }
    } catch {
      setResult({ type: 'err', text: t('remote.status.unreachable') });
    } finally {
      setBusy(null);
    }
  };

  const btnClass = (color: string) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors ${color}`;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground">{t('remote.control.title')}</div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => execute('start')} disabled={busy !== null}
          className={btnClass('bg-primary hover:bg-primary/90 disabled:opacity-50')}>
          <Icon name="play_arrow" size="xs" />
          {busy === 'start' ? t('remote.control.starting') : t('remote.control.start')}
        </button>
        <button onClick={() => execute('stop')} disabled={busy !== null}
          className={btnClass('bg-destructive hover:bg-destructive/90 disabled:opacity-50')}>
          <Icon name="stop" size="xs" />
          {busy === 'stop' ? t('remote.control.stopping') : t('remote.control.stop')}
        </button>
        <button onClick={() => execute('restart')} disabled={busy !== null}
          className={btnClass('bg-warning hover:bg-warning/90 disabled:opacity-50')}>
          <Icon name="restart_alt" size="xs" />
          {busy === 'restart' ? t('remote.control.restarting') : t('remote.control.restart')}
        </button>
        <button onClick={() => execute('test-connection')} disabled={busy !== null}
          className={btnClass('bg-accent hover:bg-accent/90 disabled:opacity-50')}>
          <Icon name="cable" size="xs" />
          {busy === 'test-connection' ? t('remote.control.testing') : t('remote.control.testConnection')}
        </button>
      </div>

      {result && (
        <div className={`text-xs px-2 py-1.5 rounded font-mono
          ${result.type === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {result.text}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/equipment/components/RemoteControlTab.tsx
git commit -m "feat: add RemoteControlTab component"
```

---

### Task 8: RemoteLogsTab 로그 탭 생성

**Files:**
- Create: `frontend/src/app/dashboard/equipment/components/RemoteLogsTab.tsx`

- [ ] **Step 1: RemoteLogsTab.tsx 생성**

감시 대상 최근 파일 목록 표시.

```typescript
/**
 * @file RemoteLogsTab.tsx — 원격 장비 감시 로그 파일 탭
 * @description agent-monitor의 /api/logs/recent를 프록시로 조회하여 파일 목록 표시.
 *   초보자 가이드: 원격 장비에서 Vector가 감시 중인 로그 파일의 이름/크기/수정일을 보여줍니다.
 */
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface FileEntry {
  name: string;
  dir: string;
  modifiedAt: string;
  sizeBytes: number;
}

interface LogsData {
  reachable: boolean;
  files?: FileEntry[];
  watchPaths?: string[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RemoteLogsTab({ equipmentId }: { equipmentId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/monitor/remote/${encodeURIComponent(equipmentId)}/logs`);
      setData(await res.json());
    } catch {
      setData({ reachable: false });
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Icon name="progress_activity" size="md" className="animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.reachable) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        <Icon name="cloud_off" size="lg" className="text-destructive mb-2 mx-auto block" />
        {t('remote.status.unreachable')}
      </div>
    );
  }

  const files = data.files || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{t('remote.logs.title')}</span>
        <button onClick={load} className="p-1 hover:bg-surface dark:hover:bg-surface-dark rounded transition-colors">
          <Icon name="refresh" size="xs" />
        </button>
      </div>

      {data.watchPaths && data.watchPaths.length > 0 && (
        <div className="text-[10px] text-muted-foreground/60 font-mono">
          {t('remote.logs.watchPaths')}: {data.watchPaths.join(', ')}
        </div>
      )}

      {files.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground/50">{t('remote.logs.noFiles')}</div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted-foreground/60 border-b border-border/30 dark:border-border-dark/30">
                <th className="text-left py-1 pr-2">{t('remote.logs.fileName')}</th>
                <th className="text-right py-1 pr-2">{t('remote.logs.size')}</th>
                <th className="text-right py-1">{t('remote.logs.modified')}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i} className="border-b border-border/10 dark:border-border-dark/10 last:border-0">
                  <td className="py-1 pr-2 truncate max-w-[200px]" title={`${f.dir}\\${f.name}`}>{f.name}</td>
                  <td className="py-1 pr-2 text-right text-muted-foreground">{formatBytes(f.sizeBytes)}</td>
                  <td className="py-1 text-right text-muted-foreground whitespace-nowrap">
                    {new Date(f.modifiedAt).toLocaleString('ko-KR', {
                      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/equipment/components/RemoteLogsTab.tsx
git commit -m "feat: add RemoteLogsTab component"
```

---

## Chunk 4: CollectorGrid 통합

### Task 9: CollectorGrid에 RemoteTabPanel 연결

**Files:**
- Modify: `frontend/src/app/dashboard/components/CollectorGrid.tsx`

- [ ] **Step 1: ActivityPanel을 별도로 분리하고, RemoteTabPanel import**

기존 인라인 상세 패널(라인 201-211)을 `RemoteTabPanel`로 교체:

1. CollectorGrid 상단에 import 추가:
```typescript
import { RemoteTabPanel } from '../equipment/components/RemoteTabPanel';
```

2. 기존 ActivityPanel 컴포넌트는 그대로 유지 (RemoteTabPanel의 activityPanel prop으로 전달)

3. 라인 201-211의 기존 인라인 패널을 교체:

기존:
```tsx
{isSelected && (
  <div className="mt-1 rounded-lg border border-primary/20 bg-white dark:bg-background-dark p-3
    animate-in slide-in-from-top-1 duration-200">
    <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-foreground dark:text-white">
      <Icon name="history" size="xs" className="text-primary" />
      {t('collector.recentActivity')}
    </div>
    <ActivityPanel logs={selectedLogs} t={t} />
  </div>
)}
```

변경:
```tsx
{isSelected && (
  <RemoteTabPanel
    equipmentId={eq.equipment_id}
    logs={selectedLogs}
    activityPanel={
      <div>
        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-foreground dark:text-white">
          <Icon name="history" size="xs" className="text-primary" />
          {t('collector.recentActivity')}
        </div>
        <ActivityPanel logs={selectedLogs} t={t} />
      </div>
    }
  />
)}
```

- [ ] **Step 2: 빌드 확인**

Run: `cd frontend && npx next build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/dashboard/components/CollectorGrid.tsx
git commit -m "feat: integrate RemoteTabPanel into CollectorGrid equipment cards"
```

---

### Task 10: 최종 빌드 검증

- [ ] **Step 1: 백엔드 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 프론트엔드 빌드**

Run: `cd frontend && npx next build`
Expected: 빌드 성공

- [ ] **Step 3: 최종 커밋 (필요 시)**

누락된 파일이 있으면 추가 커밋.
