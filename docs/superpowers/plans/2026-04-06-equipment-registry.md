# Equipment Registry 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JSON 파일 기반 설비 레지스트리를 만들어 (1) 하트비트 수신 시 자동 등록 + last_seen 갱신 (2) 장비 대시보드에서 오프라인 장비도 항상 표시 (3) 특정 설비의 파이프라인(DB INSERT) 배제 기능 제공

**Architecture:** `data/equipment-registry.json`에 설비 목록을 영속 저장. `EquipmentRegistryService`가 CRUD + 파일 I/O 담당. 하트비트 수신 시 자동 등록/갱신. log-ingest에서 excluded 설비는 파일 저장만 하고 DB INSERT 스킵. 프론트엔드 CollectorGrid에서 레지스트리 기준 표시 + 배제 토글.

**Tech Stack:** TypeScript (Fastify backend), Next.js (frontend), JSON file storage

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/services/equipment-registry.service.ts` | JSON 파일 CRUD, 메모리 캐시, 자동 등록 |
| Create | `data/equipment-registry.json` | 설비 레지스트리 데이터 (초기: `{}`) |
| Modify | `src/types/index.ts` | `EquipmentRegistryEntry` 타입 추가 |
| Modify | `src/server/routes/heartbeat.route.ts` | 하트비트 수신 시 레지스트리 자동 등록/갱신 |
| Modify | `src/server/routes/log-ingest.route.ts` | excluded 설비 DB INSERT 스킵 |
| Modify | `src/server/routes/monitor.route.ts` | 레지스트리 API 3개 추가 (목록/수정/삭제), overview에서 레지스트리 기반 장비 목록 반환 |
| Modify | `src/services/heartbeat.service.ts` | TTL 만료 시 삭제 대신 online 플래그만 변경 |
| Modify | `frontend/src/app/dashboard/components/CollectorGrid.tsx` | 배제 토글 UI, 오프라인 장비 항상 표시 |

---

### Task 1: EquipmentRegistryEntry 타입 정의

**Files:**
- Modify: `src/types/index.ts:40-45`

- [ ] **Step 1: 타입 추가**

`src/types/index.ts` 파일 끝에 추가:

```typescript
/** 설비 레지스트리 항목 (data/equipment-registry.json) */
export interface EquipmentRegistryEntry {
  equipment_type: string;
  line_code: string;
  description: string;
  registered_at: string;
  last_seen: string;
  excluded: boolean;
  metadata?: Record<string, string>;
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/types/index.ts
git commit -m "feat: EquipmentRegistryEntry 타입 정의"
```

---

### Task 2: EquipmentRegistryService 구현

**Files:**
- Create: `src/services/equipment-registry.service.ts`
- Create: `data/equipment-registry.json`

- [ ] **Step 1: 빈 JSON 파일 생성**

`data/equipment-registry.json`:
```json
{}
```

- [ ] **Step 2: 서비스 구현**

`src/services/equipment-registry.service.ts`:

```typescript
/**
 * @file src/services/equipment-registry.service.ts
 * @description JSON 파일 기반 설비 레지스트리 — 등록/조회/수정/배제 관리
 *
 * 초보자 가이드:
 * 1. 메모리에 캐시, 변경 시 JSON 파일에 즉시 저장 (debounce 적용)
 * 2. 하트비트 수신 시 upsert() 호출 → 신규면 자동 등록, 기존이면 last_seen 갱신
 * 3. excluded=true인 설비는 파이프라인(DB INSERT)에서 제외
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { logger, localISOString } from '../utils/logger.js';
import type { EquipmentRegistryEntry } from '../types/index.js';

const REGISTRY_PATH = join(process.cwd(), 'data', 'equipment-registry.json');

type Registry = Record<string, EquipmentRegistryEntry>;

class EquipmentRegistryService {
  private cache: Registry = {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  /** 파일에서 레지스트리 로드 */
  private load(): void {
    try {
      if (existsSync(REGISTRY_PATH)) {
        const raw = readFileSync(REGISTRY_PATH, 'utf-8');
        this.cache = JSON.parse(raw);
        logger.info({ count: Object.keys(this.cache).length }, 'Equipment registry loaded');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load equipment registry, starting empty');
      this.cache = {};
    }
  }

  /** 디바운스로 파일 저장 (500ms) */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const dir = dirname(REGISTRY_PATH);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(REGISTRY_PATH, JSON.stringify(this.cache, null, 2), 'utf-8');
        logger.debug('Equipment registry saved');
      } catch (err) {
        logger.error({ err }, 'Failed to save equipment registry');
      }
    }, 500);
  }

  /** 하트비트 수신 시 호출 — 신규 등록 or last_seen 갱신 */
  upsert(
    equipmentId: string,
    meta?: { equipment_type?: string; line_code?: string; description?: string; [k: string]: unknown },
  ): void {
    const now = localISOString();
    const existing = this.cache[equipmentId];

    if (existing) {
      existing.last_seen = now;
      if (meta?.equipment_type) existing.equipment_type = meta.equipment_type;
      if (meta?.line_code) existing.line_code = meta.line_code;
      if (meta?.description) existing.description = meta.description;
    } else {
      this.cache[equipmentId] = {
        equipment_type: (meta?.equipment_type as string) || '',
        line_code: (meta?.line_code as string) || '',
        description: (meta?.description as string) || '',
        registered_at: now,
        last_seen: now,
        excluded: false,
      };
      logger.info({ equipmentId }, 'New equipment registered');
    }
    this.scheduleSave();
  }

  /** 전체 레지스트리 조회 */
  getAll(): Registry {
    return { ...this.cache };
  }

  /** 특정 설비 조회 */
  get(equipmentId: string): EquipmentRegistryEntry | undefined {
    return this.cache[equipmentId];
  }

  /** 설비 정보 수정 (description, excluded 등) */
  update(equipmentId: string, patch: Partial<Pick<EquipmentRegistryEntry, 'description' | 'excluded'>>): boolean {
    const entry = this.cache[equipmentId];
    if (!entry) return false;
    if (patch.description !== undefined) entry.description = patch.description;
    if (patch.excluded !== undefined) entry.excluded = patch.excluded;
    this.scheduleSave();
    return true;
  }

  /** 설비 삭제 */
  remove(equipmentId: string): boolean {
    if (!this.cache[equipmentId]) return false;
    delete this.cache[equipmentId];
    this.scheduleSave();
    return true;
  }

  /** 해당 설비가 파이프라인에서 배제되는지 */
  isExcluded(equipmentId: string): boolean {
    return this.cache[equipmentId]?.excluded === true;
  }
}

export const equipmentRegistry = new EquipmentRegistryService();
```

- [ ] **Step 3: 커밋**

```bash
git add data/equipment-registry.json src/services/equipment-registry.service.ts
git commit -m "feat: equipment-registry 서비스 + JSON 파일 생성"
```

---

### Task 3: 하트비트 수신 시 레지스트리 자동 등록

**Files:**
- Modify: `src/server/routes/heartbeat.route.ts`

- [ ] **Step 1: import 추가**

`heartbeat.route.ts` 상단에 추가:

```typescript
import { equipmentRegistry } from '../../services/equipment-registry.service.js';
```

- [ ] **Step 2: 표준 heartbeat 처리 부분에 upsert 추가**

`heartbeatService.update()` 호출 직후 (약 L53), 다음 줄 추가:

```typescript
        equipmentRegistry.upsert(equipment_id, metadata as Record<string, string>);
```

- [ ] **Step 3: Vector metric 형식 처리 부분에도 upsert 추가**

`heartbeatService.update()` 호출 직후 (약 L62), 다음 줄 추가:

```typescript
        equipmentRegistry.upsert(metric.equipment_id, metric.metadata as Record<string, string>);
```

- [ ] **Step 4: 커밋**

```bash
git add src/server/routes/heartbeat.route.ts
git commit -m "feat: 하트비트 수신 시 equipment-registry 자동 등록"
```

---

### Task 4: log-ingest에서 excluded 설비 DB INSERT 스킵

**Files:**
- Modify: `src/server/routes/log-ingest.route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { equipmentRegistry } from '../../services/equipment-registry.service.js';
```

- [ ] **Step 2: DB INSERT 전에 배제 체크 추가**

`log-ingest.route.ts`의 `// 3단계: DB INSERT` 부분 (L98~) 을 다음으로 교체:

```typescript
    // 3단계: DB INSERT (excluded 설비 제외)
    const logsToInsert = logs.filter(log => {
      if (equipmentRegistry.isExcluded(log.equipment_id)) {
        logger.info({ equipment_id: log.equipment_id, target_table: log.target_table }, 'Pipeline excluded — skip DB insert');
        errorLogRepository.success('PIPELINE_SKIP', log.target_table, log.equipment_id, '파이프라인 배제 설비 — DB INSERT 스킵');
        return false;
      }
      return true;
    });

    if (logsToInsert.length === 0) {
      return reply.status(202).send({
        accepted: 0,
        failed: 0,
        skipped: logs.length,
        timestamp: localISOString(),
      });
    }

    try {
      const result = await logIngestService.processLogBatch(logsToInsert);
      logger.info({ count: logsToInsert.length, skipped: logs.length - logsToInsert.length }, 'Logs processed');

      return reply.status(202).send({
        accepted: result.accepted,
        failed: result.failed,
        skipped: logs.length - logsToInsert.length,
        timestamp: localISOString(),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to process logs');

      for (const log of logsToInsert) {
        await errorLogRepository.record({
          source_table: log.target_table,
          equipment_id: log.equipment_id,
          error_message: err instanceof Error ? err.message : String(err),
          raw_data: JSON.stringify(log),
          stage: 'TABLE_INSERT',
        });
      }

      throw err;
    }
```

- [ ] **Step 3: 커밋**

```bash
git add src/server/routes/log-ingest.route.ts
git commit -m "feat: excluded 설비는 파일 저장만, DB INSERT 스킵"
```

---

### Task 5: monitor.route에 레지스트리 API 추가

**Files:**
- Modify: `src/server/routes/monitor.route.ts`

- [ ] **Step 1: import 추가**

`monitor.route.ts` 상단 import에 추가:

```typescript
import { equipmentRegistry } from '../../services/equipment-registry.service.js';
```

- [ ] **Step 2: overview 엔드포인트에서 레지스트리 기반 장비 목록 반환**

`/api/monitor/overview` (L92~) 에서 기존 `heartbeatService.getAllStatuses()` 결과를 레지스트리와 병합하도록 수정.

기존 응답의 `equipments` 부분 (L120~121):
```typescript
      equipments: equipments.status === 'fulfilled'
        ? mergeEquipmentDescriptions(equipments.value) : [],
```

다음으로 교체:
```typescript
      equipments: (() => {
        const heartbeats = equipments.status === 'fulfilled' ? equipments.value : [];
        const heartbeatMap = new Map(heartbeats.map(h => [h.equipment_id, h]));
        const registry = equipmentRegistry.getAll();
        const ttlMs = env.HEARTBEAT_TTL_SECONDS * 1000;
        const now = Date.now();
        const result: EquipmentStatus[] = [];

        // 레지스트리 기준으로 전체 장비 표시
        for (const [id, entry] of Object.entries(registry)) {
          const hb = heartbeatMap.get(id);
          const online = hb ? hb.online : (now - new Date(entry.last_seen).getTime() < ttlMs);
          result.push({
            equipment_id: id,
            online,
            last_seen: hb?.last_seen || entry.last_seen,
            metadata: {
              equipment_type: entry.equipment_type,
              line_code: entry.line_code,
              description: entry.description,
              excluded: String(entry.excluded),
              registered_at: entry.registered_at,
              ...(hb?.metadata || {}),
            },
          });
          heartbeatMap.delete(id);
        }

        // 레지스트리에 없는 하트비트만 남은 것 추가 (자동 등록은 heartbeat.route에서 처리)
        for (const hb of heartbeatMap.values()) {
          result.push(hb);
        }

        return mergeEquipmentDescriptions(result);
      })(),
```

- [ ] **Step 3: 레지스트리 CRUD API 3개 추가**

`monitor.route.ts`에 적절한 위치 (시스템 설정 섹션 근처, L2300쯤)에 추가:

```typescript
  /** 설비 레지스트리 전체 목록 */
  app.get('/api/monitor/equipment-registry', async (_request, reply) => {
    return reply.send(equipmentRegistry.getAll());
  });

  /** 설비 정보 수정 (description, excluded 등) */
  app.put('/api/monitor/equipment-registry/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { description?: string; excluded?: boolean };
    const ok = equipmentRegistry.update(id, body);
    if (!ok) return reply.status(404).send({ error: 'Equipment not found' });
    return reply.send({ success: true });
  });

  /** 설비 삭제 */
  app.delete('/api/monitor/equipment-registry/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = equipmentRegistry.remove(id);
    if (!ok) return reply.status(404).send({ error: 'Equipment not found' });
    return reply.send({ success: true });
  });
```

- [ ] **Step 4: EquipmentStatus import 확인**

`monitor.route.ts` 상단에 `EquipmentStatus` 타입이 이미 import 되어있는지 확인. 없으면 추가:

```typescript
import type { EquipmentStatus } from '../../types/index.js';
```

- [ ] **Step 5: 커밋**

```bash
git add src/server/routes/monitor.route.ts
git commit -m "feat: 레지스트리 기반 장비 목록 + CRUD API 추가"
```

---

### Task 6: CollectorGrid에 배제 토글 UI 추가

**Files:**
- Modify: `frontend/src/app/dashboard/components/CollectorGrid.tsx`

- [ ] **Step 1: Equipment 인터페이스에 excluded 반영**

CollectorGrid.tsx의 Equipment 인터페이스(L33):

기존:
```typescript
interface Equipment { equipment_id: string; online: boolean; last_seen: string; metadata: Record<string, string> }
```

변경 없음 — `excluded`는 `metadata.excluded`로 이미 전달됨. metadata에서 읽으면 됨.

- [ ] **Step 2: 배제 토글 핸들러 추가**

`CollectorGrid` 함수 안, `const [selectedId, setSelectedId]` 다음에 추가:

```typescript
  const handleToggleExclude = async (equipmentId: string, currentExcluded: boolean) => {
    try {
      const res = await fetch(`/api/monitor/equipment-registry/${equipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded: !currentExcluded }),
      });
      if (res.ok) {
        // useMonitor가 자동 갱신하므로 별도 처리 불필요
      }
    } catch { /* 무시 */ }
  };
```

- [ ] **Step 3: 카드에 배제 표시 + 토글 버튼 추가**

카드 렌더링에서 `const ok = eq.online;` 다음에 추가:

```typescript
            const excluded = m.excluded === 'true';
```

카드의 헤더 영역 (상태 dot 바로 앞)에 배제 아이콘 추가. 기존 상태 dot:
```tsx
                    <span className={`size-2 rounded-full shrink-0 ${
                      ok ? 'bg-primary shadow-[0_0_4px_var(--primary)]' : 'bg-destructive'
                    }`} />
```

다음으로 교체:
```tsx
                    {excluded && (
                      <span className="text-[10px] font-mono px-1 py-px rounded bg-warning/10 text-warning border border-warning/20"
                        title="파이프라인 배제됨">
                        SKIP
                      </span>
                    )}
                    <span className={`size-2 rounded-full shrink-0 ${
                      excluded ? 'bg-warning' : ok ? 'bg-primary shadow-[0_0_4px_var(--primary)]' : 'bg-destructive'
                    }`} />
```

- [ ] **Step 4: 카드 border 색상에 excluded 반영**

기존 border 조건:
```tsx
                    ${ok ? 'border-border dark:border-border-dark' : 'border-destructive/30 dark:border-destructive/30'}
```

교체:
```tsx
                    ${excluded ? 'border-warning/40 dark:border-warning/40' : ok ? 'border-border dark:border-border-dark' : 'border-destructive/30 dark:border-destructive/30'}
```

- [ ] **Step 5: RemoteTabPanel 영역에 배제 토글 버튼 추가**

`{isSelected && (` 블록 안, `<RemoteTabPanel` 앞에 추가:

```tsx
                  <div className="flex items-center gap-2 px-3 py-2 mt-1 rounded-t-lg border border-b-0 border-border dark:border-border-dark bg-secondary/30">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleExclude(eq.equipment_id, excluded); }}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        excluded
                          ? 'bg-warning/20 text-warning hover:bg-warning/30'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      <Icon name={excluded ? 'play_arrow' : 'block'} size="xs" />
                      {excluded ? '파이프라인 활성화' : '파이프라인 배제'}
                    </button>
                    {excluded && (
                      <span className="text-xs text-warning/80">파일 저장은 계속되며, DB INSERT만 스킵됩니다</span>
                    )}
                  </div>
```

- [ ] **Step 6: SKIP을 metadata 필터에 추가**

`SKIP` Set(L37)에 `'excluded'`와 `'registered_at'` 추가:

```typescript
const SKIP = new Set([
  'equipment_id', 'equipment_type', 'line_code', 'log_type',
  'description', 'last_seen', 'source', 'ip',
  'excluded', 'registered_at',
]);
```

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/app/dashboard/components/CollectorGrid.tsx
git commit -m "feat: 장비 카드에 파이프라인 배제 토글 UI 추가"
```

---

### Task 7: .gitignore에 equipment-registry.json 추가 검토

**Files:**
- Check: `.gitignore`

- [ ] **Step 1: equipment-registry.json을 gitignore에 추가하지 않음**

이 파일은 초기값 `{}`으로 커밋하되, 서버에서 런타임에 갱신되므로 `.gitignore`에 추가하지 않음. 배포 시 기존 데이터를 덮어쓰지 않도록 배포 스크립트에서 처리(기존 xd 디렉토리 보호 패턴과 동일).

- [ ] **Step 2: 확인 후 필요 시 배포 설정 조정**

GitHub Actions 배포 시 `data/equipment-registry.json`을 보호 대상에 추가해야 할 수 있음. 기존 배포 보호 패턴 확인.

- [ ] **Step 3: 커밋 (변경 있는 경우만)**

---

### Task 8: 통합 테스트

- [ ] **Step 1: 백엔드 빌드 확인**

```bash
cd C:/Project/vector && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 2: 프론트엔드 빌드 확인**

```bash
cd C:/Project/vector/frontend && npx next build
```

Expected: 빌드 성공

- [ ] **Step 3: 수동 테스트 — 하트비트 수신 → 레지스트리 등록**

```bash
curl -X POST http://localhost:3100/api/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"equipment_id":"TEST_AOI_01","metadata":{"equipment_type":"AOI","line_code":"LINE1"}}'
```

`data/equipment-registry.json`에 TEST_AOI_01이 등록되었는지 확인.

- [ ] **Step 4: 수동 테스트 — 배제 설정**

```bash
curl -X PUT http://localhost:3100/api/monitor/equipment-registry/TEST_AOI_01 \
  -H "Content-Type: application/json" \
  -d '{"excluded": true}'
```

- [ ] **Step 5: 수동 테스트 — 배제된 설비 로그 전송 시 DB INSERT 스킵 확인**

로그 전송 후 응답에 `skipped: 1`이 포함되는지 확인.

- [ ] **Step 6: 프론트엔드 대시보드에서 배제 토글 동작 확인**

`http://localhost:3000/dashboard/equipment`에서:
- 등록된 장비가 오프라인이어도 표시되는지
- SKIP 배지 표시되는지
- 배제 토글 버튼 동작하는지
