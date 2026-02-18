/**
 * @file src/server/routes/status.route.ts
 * @description 장비 온/오프라인 상태 조회 엔드포인트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Redis에 저장된 하트비트 TTL로 장비 온라인 여부 판단
 * 2. **사용 방법**: GET /api/status → 전체 장비 상태, GET /api/status/:equipmentId → 개별 조회
 */

import { FastifyPluginAsync } from 'fastify';
import { heartbeatService } from '../../redis/heartbeat.service.js';

export const statusRoute: FastifyPluginAsync = async (app) => {
  app.get('/status', async (_request, reply) => {
    const statuses = await heartbeatService.getAllStatuses();
    return reply.status(200).send({ equipments: statuses });
  });

  app.get('/status/:equipmentId', async (request, reply) => {
    const { equipmentId } = request.params as { equipmentId: string };
    const status = await heartbeatService.getStatus(equipmentId);

    if (!status) {
      return reply.status(404).send({ error: 'Equipment not found' });
    }

    return reply.status(200).send(status);
  });
};
