/**
 * @file src/redis/heartbeat.service.ts
 * @description Redis SETEX 기반 장비 하트비트 TTL 관리
 *
 * 초보자 가이드:
 * 1. **주요 개념**: SETEX로 키에 TTL 설정 → TTL 만료 시 자동 삭제 = 오프라인 판정
 * 2. **키 형식**: `heartbeat:{equipment_id}` → JSON 값 (last_seen, metadata)
 * 3. **전체 조회**: KEYS + pipeline으로 일괄 조회 (장비 수가 많으면 SCAN으로 전환 권장)
 */

import { getRedisClient } from './redis.client.js';
import { env } from '../config/env.js';
import type { EquipmentStatus } from '../types/index.js';

const HEARTBEAT_PREFIX = 'heartbeat:';

class HeartbeatService {
  private get redis() {
    return getRedisClient();
  }

  async update(
    equipmentId: string,
    data?: { timestamp?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const key = `${HEARTBEAT_PREFIX}${equipmentId}`;
    const value = JSON.stringify({
      equipment_id: equipmentId,
      last_seen: data?.timestamp ?? new Date().toISOString(),
      metadata: data?.metadata,
    });

    await this.redis.setex(key, env.HEARTBEAT_TTL_SECONDS, value);
  }

  async getStatus(equipmentId: string): Promise<EquipmentStatus | null> {
    const key = `${HEARTBEAT_PREFIX}${equipmentId}`;
    const value = await this.redis.get(key);

    if (!value) return null;

    const parsed = JSON.parse(value);
    return {
      equipment_id: equipmentId,
      online: true,
      last_seen: parsed.last_seen,
      metadata: parsed.metadata ?? {},
    };
  }

  async getAllStatuses(): Promise<EquipmentStatus[]> {
    const keys = await this.redis.keys(`${HEARTBEAT_PREFIX}*`);
    if (keys.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }

    const results = await pipeline.exec();
    if (!results) return [];

    return results
      .map(([err, value], index) => {
        if (err || !value) return null;
        const parsed = JSON.parse(value as string);
        const equipmentId = keys[index].replace(HEARTBEAT_PREFIX, '');
        return {
          equipment_id: equipmentId,
          online: true,
          last_seen: parsed.last_seen,
          metadata: parsed.metadata ?? {},
        } as EquipmentStatus;
      })
      .filter((s): s is EquipmentStatus => s !== null);
  }
}

export const heartbeatService = new HeartbeatService();
