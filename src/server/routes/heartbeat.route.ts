/**
 * @file src/server/routes/heartbeat.route.ts
 * @description 장비 하트비트 수신 엔드포인트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Agent TOML의 static_metrics 소스가 30초마다 하트비트를 Aggregator로 전송
 * 2. **데이터 흐름**: Agent(static_metrics) → Aggregator(route) → Node.js(여기) → Redis SETEX
 * 3. **형식 지원**: 표준 heartbeat JSON + Vector static_metrics 메트릭 원본 형식 모두 처리
 * 4. **동작**: TTL 내 하트비트 없으면 자동으로 오프라인 판정
 */

import { FastifyPluginAsync } from 'fastify';
import { heartbeatSchema } from '../../schemas/log-ingest.schema.js';
import { heartbeatService } from '../../redis/heartbeat.service.js';
import { logger } from '../../utils/logger.js';

/** Vector static_metrics 형식에서 heartbeat 데이터 추출 */
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
      ...(ip ? { ip } : {}),
      source: 'vector_static_metrics',
    },
  };
}

export const heartbeatRoute: FastifyPluginAsync = async (app) => {
  app.post('/heartbeat', async (request, reply) => {
    const items = Array.isArray(request.body) ? request.body : [request.body];
    const clientIp = request.ip;
    let processed = 0;

    for (const item of items as Record<string, unknown>[]) {
      // 1) 표준 heartbeat 형식 시도
      const parsed = heartbeatSchema.safeParse(item);
      if (parsed.success) {
        const { equipment_id, timestamp, metadata } = parsed.data;
        const metaWithIp = { ...metadata, ...(clientIp ? { ip: clientIp } : {}) };
        await heartbeatService.update(equipment_id, { timestamp, metadata: metaWithIp });
        logger.debug({ equipment_id }, 'Heartbeat received');
        processed++;
        continue;
      }

      // 2) Vector static_metrics 메트릭 형식 시도
      const metric = extractFromMetric(item, clientIp);
      if (metric) {
        await heartbeatService.update(metric.equipment_id, {
          timestamp: metric.timestamp,
          metadata: metric.metadata,
        });
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
