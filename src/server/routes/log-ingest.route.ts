/**
 * @file src/server/routes/log-ingest.route.ts
 * @description Vector 데이터 수신 진입점 (핵심 파일 #5)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Vector HTTP sink가 보내는 배치 JSON을 수신 → 직접 Oracle INSERT
 * 2. **데이터 흐름**: POST /api/logs → zod 검증 → logIngestService.processLogBatch() → 202 응답
 * 3. **Vector 호환**: Vector는 JSON 배열로 전송, 수동 테스트는 { logs: [...] } 형식 지원
 */

import { FastifyPluginAsync } from 'fastify';
import { logBatchSchema } from '../../schemas/log-ingest.schema.js';
import { logIngestService } from '../../services/log-ingest.service.js';
import { errorLogRepository } from '../../database/repositories/error-log.repository.js';
import { logger } from '../../utils/logger.js';
import type { LogRecord } from '../../types/index.js';

export const logIngestRoute: FastifyPluginAsync = async (app) => {
  /** Aggregator가 Agent로부터 파일 수신 시 알림 (파이프라인 1단계: FILE_RECEIVE) */
  app.post('/logs/file-received', async (request, reply) => {
    const body = request.body as Record<string, unknown> | Record<string, unknown>[];
    const items = Array.isArray(body) ? body : [body];

    for (const item of items) {
      const equipmentId = String(item.equipment_id || 'UNKNOWN');
      const filename = String(item.filename || '');
      const logType = String(item.log_type || '');

      errorLogRepository.success(
        'FILE_RECEIVE',
        logType,
        equipmentId,
        `파일 수신: ${filename}`,
      );
    }

    return reply.status(200).send({ received: items.length });
  });

  app.post('/logs', async (request, reply) => {
    const parsed = logBatchSchema.safeParse(request.body);

    if (!parsed.success) {
      const rawBody = JSON.stringify(request.body).substring(0, 4000);
      await errorLogRepository.record({
        source_table: 'LOG_INGEST',
        equipment_id: 'UNKNOWN',
        error_message: `Validation failed: ${parsed.error.message}`.substring(0, 4000),
        raw_data: rawBody,
        stage: 'HTTP_RECEIVE',
      });
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    // Vector는 단일 객체 또는 배열로, 수동 호출은 { logs: [...] } 형식으로 올 수 있음
    const logs: LogRecord[] = Array.isArray(parsed.data)
      ? parsed.data
      : 'logs' in parsed.data
        ? parsed.data.logs
        : [parsed.data];

    // HTTP 수신 성공 로그 기록 (validation 통과)
    for (const log of logs) {
      errorLogRepository.success(
        'HTTP_RECEIVE',
        log.target_table,
        log.equipment_id,
        `HTTP 수신 완료 (${logs.length}건 배치)`,
      );
    }

    try {
      const result = await logIngestService.processLogBatch(logs);
      logger.info({ count: logs.length }, 'Logs processed');

      return reply.status(202).send({
        accepted: result.accepted,
        failed: result.failed,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to process logs');

      for (const log of logs) {
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
  });
};
