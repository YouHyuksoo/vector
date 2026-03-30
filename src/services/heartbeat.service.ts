/**
 * @file src/services/heartbeat.service.ts
 * @description 인메모리 Map 기반 장비 하트비트 TTL 관리 (Redis 대체)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Map + setTimeout으로 TTL 관리, TTL 만료 시 자동 삭제 = 오프라인 판정
 * 2. **키 형식**: equipment_id → { data, timer }
 * 3. **전체 조회**: Map.values()로 일괄 조회
 */

import { env } from '../config/env.js';
import type { EquipmentStatus } from '../types/index.js';

interface HeartbeatEntry {
  equipment_id: string;
  last_seen: string;
  metadata?: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout>;
}

const store = new Map<string, HeartbeatEntry>();

class HeartbeatService {
  update(
    equipmentId: string,
    data?: { timestamp?: string; metadata?: Record<string, unknown> },
  ): void {
    const existing = store.get(equipmentId);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      store.delete(equipmentId);
    }, env.HEARTBEAT_TTL_SECONDS * 1000);

    store.set(equipmentId, {
      equipment_id: equipmentId,
      last_seen: new Date().toISOString(),
      metadata: data?.metadata,
      timer,
    });
  }

  getStatus(equipmentId: string): EquipmentStatus | null {
    const entry = store.get(equipmentId);
    if (!entry) return null;

    return {
      equipment_id: equipmentId,
      online: true,
      last_seen: entry.last_seen,
      metadata: (entry.metadata ?? {}) as Record<string, string>,
    };
  }

  getAllStatuses(): EquipmentStatus[] {
    return Array.from(store.values()).map(entry => ({
      equipment_id: entry.equipment_id,
      online: true,
      last_seen: entry.last_seen,
      metadata: (entry.metadata ?? {}) as Record<string, string>,
    }));
  }
}

export const heartbeatService = new HeartbeatService();
