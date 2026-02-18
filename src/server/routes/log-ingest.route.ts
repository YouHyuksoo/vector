/**
 * @file src/server/routes/log-ingest.route.ts
 * @description Vector 데이터 수신 진입점 (핵심 파일 #5)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Vector HTTP sink가 보내는 배치 JSON을 수신 → BullMQ 큐에 적재
 * 2. **데이터 흐름**: POST /api/logs → zod 검증 → logProducer.addBulk() → 202 응답
 * 3. **Vector 호환**: Vector는 JSON 배열로 전송, 수동 테스트는 { logs: [...] } 형식 지원
 */

import { FastifyPluginAsync } from 'fastify';
import { logBatchSchema } from '../../schemas/log-ingest.schema.js';
import { logProducer } from '../../queue/producers/log.producer.js';
import { logger } from '../../utils/logger.js';
import type { LogRecord } from '../../types/index.js';

export const logIngestRoute: FastifyPluginAsync = async (app) => {
  app.post('/logs', async (request, reply) => {
    const parsed = logBatchSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    // Vector는 배열로, 수동 호출은 { logs: [...] } 형식으로 올 수 있음
    const logs: LogRecord[] = Array.isArray(parsed.data)
      ? parsed.data
      : parsed.data.logs;

    try {
      await logProducer.addBulk(logs);
      logger.info({ count: logs.length }, 'Logs queued for processing');

      return reply.status(202).send({
        accepted: logs.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to queue logs');
      throw err;
    }
  });
};
