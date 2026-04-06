/**
 * @file src/server/routes/heartbeat.route.ts
 * @description 장비 하트비트 수신 엔드포인트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Agent Manager가 30초마다 HTTP POST로 직접 하트비트 전송
 * 2. **데이터 흐름**: Agent Manager → Node.js(여기) → 인메모리 Map
 * 3. **형식 지원**: 표준 heartbeat JSON + Vector 메트릭 원본 형식(레거시 호환) 모두 처리
 * 4. **동작**: TTL 내 하트비트 없으면 자동으로 오프라인 판정
 */

import { FastifyPluginAsync } from 'fastify';
import { heartbeatSchema } from '../../schemas/log-ingest.schema.js';
import { heartbeatService } from '../../services/heartbeat.service.js';
import { equipmentRegistry } from '../../services/equipment-registry.service.js';
import { logger } from '../../utils/logger.js';

/** Vector internal_metrics 형식에서 heartbeat 데이터 추출 */
function extractFromMetric(item: Record<string, unknown>, ip?: string): {
  equipment_id: string; timestamp?: string; metadata?: Record<string, unknown>;
} | null {
  if (item.name !== 'heartbeat' || !item.tags) return null;
  const tags = item.tags as Record<string, string>;
  if (!tags.equipment_id) return null;
  return {
    equipment_id: tags.equipment_id,
    timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
    metadata: {
      equipment_type: tags.equipment_type,
      line_code: tags.line_code,
      log_type: tags.log_type,
      ...(tags.description ? { description: tags.description } : {}),
      ...(!tags.ip && ip ? { ip } : {}),
      ...(tags.ip ? { ip: tags.ip } : {}),
      source: 'vector_internal_metrics',
    },
  };
}

export const heartbeatRoute: FastifyPluginAsync = async (app) => {
  app.post('/heartbeat', async (request, reply) => {
    const items = Array.isArray(request.body) ? request.body : [request.body];
    const forwarded = request.headers['x-forwarded-for'];
    const clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded?.[0]?.trim())
      || (request.ip !== '127.0.0.1' ? request.ip : undefined);
    let processed = 0;

    for (const item of items as Record<string, unknown>[]) {
      // 1) 표준 heartbeat 형식 시도
      const parsed = heartbeatSchema.safeParse(item);
      if (parsed.success) {
        const { equipment_id, timestamp, metadata } = parsed.data;
        const metaWithIp = { ...metadata, ...(!metadata?.ip && clientIp ? { ip: clientIp } : {}) };
        await heartbeatService.update(equipment_id, { timestamp, metadata: metaWithIp });
        equipmentRegistry.upsert(equipment_id, metadata as Record<string, string>);
        logger.debug({ equipment_id }, 'Heartbeat received');
        processed++;
        continue;
      }

      // 2) Vector internal_metrics 메트릭 형식 시도
      const metric = extractFromMetric(item, clientIp);
      if (metric) {
        await heartbeatService.update(metric.equipment_id, {
          timestamp: metric.timestamp,
          metadata: metric.metadata,
        });
        equipmentRegistry.upsert(metric.equipment_id, metric.metadata as Record<string, string>);
        logger.debug({ equipment_id: metric.equipment_id }, 'Heartbeat received (metric)');
        processed++;
      }
    }

    if (processed === 0) {
      return reply.status(400).send({ error: 'No valid heartbeat data' });
    }

    return reply.status(200).send({ status: 'ok', processed });
  });
};
