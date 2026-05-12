/**
 * @file src/services/heartbeat.service.ts
 * @description 인메모리 + 디스크 스냅샷 기반 장비 하트비트 관리
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 한 번 등록된 설비 정보(IP/metadata)는 절대 삭제하지 않는다.
 *    TTL 만료 시 `online: false`로만 표시하고 last_seen / metadata는 유지.
 * 2. **디스크 영속화**: heartbeat가 들어올 때마다 `data/heartbeat-snapshot.json`에
 *    스냅샷 저장(1초 debounce). PM2 reload / 서버 재시작 후에도 마지막 IP를 복원.
 * 3. **online 판정**: TTL 내 heartbeat 있으면 true, 없으면 false. 화면에서는
 *    online 상태만 회색/녹색으로 구분하고 IP 표시는 그대로 유지.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { env } from '../config/env.js';
import { logger, localISOString } from '../utils/logger.js';
import type { EquipmentStatus } from '../types/index.js';

interface HeartbeatEntry {
  equipment_id: string;
  last_seen: string;
  online: boolean;
  metadata?: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout> | null;
}

interface SnapshotEntry {
  last_seen: string;
  metadata?: Record<string, unknown>;
}

const SNAPSHOT_PATH = join(process.cwd(), 'data', 'heartbeat-snapshot.json');
const store = new Map<string, HeartbeatEntry>();

function loadSnapshot(): Record<string, SnapshotEntry> {
  try {
    if (!existsSync(SNAPSHOT_PATH)) return {};
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
  } catch (err) {
    logger.warn({ err: String(err) }, 'heartbeat snapshot load failed — starting empty');
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const snapshot: Record<string, SnapshotEntry> = {};
    for (const [id, entry] of store) {
      snapshot[id] = { last_seen: entry.last_seen, metadata: entry.metadata };
    }
    try {
      const dir = dirname(SNAPSHOT_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      logger.warn({ err: String(err) }, 'heartbeat snapshot save failed');
    }
  }, 1000);
}

class HeartbeatService {
  constructor() {
    const snap = loadSnapshot();
    let restored = 0;
    for (const [id, e] of Object.entries(snap)) {
      store.set(id, {
        equipment_id: id,
        last_seen: e.last_seen,
        online: false,
        metadata: e.metadata,
        timer: null,
      });
      restored++;
    }
    if (restored > 0) {
      logger.info({ restored }, 'Heartbeat snapshot restored (online=false until next heartbeat)');
    }
  }

  update(
    equipmentId: string,
    data?: { timestamp?: string; metadata?: Record<string, unknown> },
  ): void {
    const existing = store.get(equipmentId);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      const entry = store.get(equipmentId);
      if (entry) {
        entry.online = false;
        entry.timer = null;
      }
    }, env.HEARTBEAT_TTL_SECONDS * 1000);

    store.set(equipmentId, {
      equipment_id: equipmentId,
      last_seen: localISOString(),
      online: true,
      metadata: { ...(existing?.metadata ?? {}), ...(data?.metadata ?? {}) },
      timer,
    });

    scheduleSave();
  }

  getStatus(equipmentId: string): EquipmentStatus | null {
    const entry = store.get(equipmentId);
    if (!entry) return null;

    return {
      equipment_id: equipmentId,
      online: entry.online,
      last_seen: entry.last_seen,
      metadata: (entry.metadata ?? {}) as Record<string, string>,
    };
  }

  getAllStatuses(): EquipmentStatus[] {
    return Array.from(store.values()).map(entry => ({
      equipment_id: entry.equipment_id,
      online: entry.online,
      last_seen: entry.last_seen,
      metadata: (entry.metadata ?? {}) as Record<string, string>,
    }));
  }
}

export const heartbeatService = new HeartbeatService();
