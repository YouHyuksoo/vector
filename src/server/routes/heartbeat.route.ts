/**
 * @file src/server/routes/heartbeat.route.ts
 * @description 장비 하트비트 수신 엔드포인트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 설비 PC가 주기적으로 POST → Redis SETEX로 TTL 갱신
 * 2. **동작**: TTL 내 하트비트 없으면 자동으로 오프라인 판정
 */

import { FastifyPluginAsync } from 'fastify';
import { heartbeatSchema } from '../../schemas/log-ingest.schema.js';
import { heartbeatService } from '../../redis/heartbeat.service.js';
import { logger } from '../../utils/logger.js';

export const heartbeatRoute: FastifyPluginAsync = async (app) => {
  app.post('/heartbeat', async (request, reply) => {
    const parsed = heartbeatSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { equipment_id, timestamp, metadata } = parsed.data;

    await heartbeatService.update(equipment_id, { timestamp, metadata });
    logger.debug({ equipment_id }, 'Heartbeat received');

    return reply.status(200).send({ status: 'ok' });
  });
};
