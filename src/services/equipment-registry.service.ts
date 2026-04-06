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
