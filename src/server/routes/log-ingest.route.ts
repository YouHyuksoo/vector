/**
 * @file src/server/routes/log-ingest.route.ts
 * @description Vector 데이터 수신 진입점 (핵심 파일 #5)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Vector HTTP sink가 보내는 배치 JSON을 수신 → 원본 파일 저장 → Oracle INSERT
 * 2. **데이터 흐름**: POST /api/logs → zod 검증 → 원본 파일 저장 → processLogBatch() → 202 응답
 * 3. **Vector 호환**: Vector는 JSON 배열로 전송, 수동 테스트는 { logs: [...] } 형식 지원
 * 4. **파일 저장**: 누적형 설비(SELECTIVE 등)는 append로 이어쓰고, 그 외는 덮어쓰기
 */

import { FastifyPluginAsync } from 'fastify';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import { join, dirname } from 'path';
import { logBatchSchema } from '../../schemas/log-ingest.schema.js';
import { logIngestService } from '../../services/log-ingest.service.js';
import { errorLogRepository } from '../../database/repositories/error-log.repository.js';
import { equipmentRegistry } from '../../services/equipment-registry.service.js';
import { env } from '../../config/env.js';
import { logger, localISOString } from '../../utils/logger.js';
import type { LogRecord } from '../../types/index.js';

const RAW_LOG_BASE = env.RAW_LOG_BASE_PATH;

// 누적형 로그(append 모드) 설비 유형 — 최초 전체 + 이후 delta가 같은 파일에 쌓여야 함
const APPEND_EQUIPMENT_TYPES = new Set<string>(['SELECTIVE']);

// Per-filePath promise chain — 같은 파일에 대한 write는 직렬화.
// 다른 파일은 병렬. 동시 HTTP 요청(Vector concurrency=8) 간 race 방지.
const fileWriteChains = new Map<string, Promise<void>>();

async function performRawWrite(log: LogRecord, filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  if (APPEND_EQUIPMENT_TYPES.has(log.equipment_type!)) {
    const separator = log.raw_message!.endsWith('\n') ? '' : '\n';
    await appendFile(filePath, log.raw_message! + separator, 'utf-8');
  } else {
    await writeFile(filePath, log.raw_message!, 'utf-8');
  }
}

/**
 * 원본 로그 파일을 디스크에 저장 — fs.promises + per-filePath promise chain.
 * - 같은 filePath에 대한 호출은 모두 직렬 (다른 HTTP 요청, retry 포함 전역 보장)
 * - 다른 filePath는 병렬 (성능 유지)
 * - chain 끝에 cleanup으로 메모리 누수 방지
 *
 * retry API에서도 같은 저장 흐름을 쓰도록 export.
 */
export async function saveRawLogFile(log: LogRecord): Promise<void> {
  if (!log.raw_message || !log.filename || !log.equipment_type) return;

  const today = new Date();
  const dateDir = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const filePath = join(RAW_LOG_BASE, log.equipment_type, log.equipment_id, dateDir, log.filename);
  // Windows는 경로 대소문자 비구분 — Map key를 lower-case로 정규화해 case 흔들림 방지
  const chainKey = filePath.toLowerCase();

  const prev = fileWriteChains.get(chainKey) ?? Promise.resolve();
  const next = prev.then(() => performRawWrite(log, filePath));
  // 다음 호출이 prev로 잡을 promise. catch로 chain breaking 방지 (한 write 실패해도 후속 진행).
  const chained = next.catch(() => undefined);
  fileWriteChains.set(chainKey, chained);
  try {
    await next; // 호출자에겐 원래 에러 그대로 전파
  } finally {
    // 내 chain이 여전히 끝점이면 cleanup. 후속 호출이 이미 set했으면 그쪽이 cleanup.
    if (fileWriteChains.get(chainKey) === chained) {
      fileWriteChains.delete(chainKey);
    }
  }
}

export const logIngestRoute: FastifyPluginAsync = async (app) => {
  app.post('/logs', async (request, reply) => {
    const parsed = logBatchSchema.safeParse(request.body);

    if (!parsed.success) {
      // 검증 실패한 배치에서 설비 정보 + null 항목을 개별 추출하여 구체적으로 기록
      const body = request.body as unknown;
      const items = Array.isArray(body) ? body : [];

      if (items.length > 0) {
        const nullIndices: { idx: number; equipmentId: string; equipmentType: string }[] = [];
        const equipmentIds = new Set<string>();

        for (let i = 0; i < items.length; i++) {
          const item = items[i] as Record<string, unknown> | null;
          const eqId = (item?.equipment_id as string) || 'UNKNOWN';
          const eqType = (item?.equipment_type as string) || '';
          equipmentIds.add(eqId);

          if (!item?.target_type || !item?.target_table || !item?.data) {
            nullIndices.push({ idx: i, equipmentId: eqId, equipmentType: eqType });
          }
        }

        // null 항목이 있으면 설비별로 구체적 에러 기록
        if (nullIndices.length > 0) {
          const grouped = new Map<string, number[]>();
          for (const n of nullIndices) {
            const key = n.equipmentId;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(n.idx);
          }
          for (const [eqId, indices] of grouped) {
            const eqType = nullIndices.find(n => n.equipmentId === eqId)?.equipmentType || '';
            await errorLogRepository.record({
              source_table: 'VRL_PARSE_FAIL',
              equipment_id: eqId,
              error_message: `VRL 파싱 실패 — 배치 ${items.length}건 중 ${indices.length}건의 필수 필드(target_type/target_table/data)가 null. 인덱스: [${indices.join(', ')}]. equipment_type=${eqType}`,
              raw_data: JSON.stringify(items[indices[0]]).substring(0, 4000),
              stage: 'VRL_PARSE',
            });
          }
        } else {
          // null은 없지만 다른 이유로 검증 실패
          await errorLogRepository.record({
            source_table: 'LOG_INGEST',
            equipment_id: [...equipmentIds].join(', ').substring(0, 200),
            error_message: `Validation failed: ${parsed.error.message}`.substring(0, 4000),
            raw_data: JSON.stringify(items[0]).substring(0, 4000),
            stage: 'HTTP_RECEIVE',
          });
        }
      } else {
        // 배열이 아닌 경우 기존 방식
        await errorLogRepository.record({
          source_table: 'LOG_INGEST',
          equipment_id: 'UNKNOWN',
          error_message: `Validation failed: ${parsed.error.message}`.substring(0, 4000),
          raw_data: JSON.stringify(body).substring(0, 4000),
          stage: 'HTTP_RECEIVE',
        });
      }

      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const logs: LogRecord[] = Array.isArray(parsed.data)
      ? parsed.data
      : 'logs' in parsed.data
        ? parsed.data.logs
        : [parsed.data];

    const routeStart = Date.now();

    // 1단계: 원본 파일 저장 (saveRawLogFile 내부 per-filePath chain이 동시 요청 간 race 방지).
    // 호출자는 단순 Promise.all로 병렬화 — 다른 파일은 진짜 병렬, 같은 파일은 chain으로 직렬.
    const rawSaveStart = Date.now();
    await Promise.all(logs.map(async (log) => {
      try { await saveRawLogFile(log); }
      catch (err) { logger.warn({ err, filename: log.filename }, 'Failed to save raw log file'); }
    }));
    const rawSaveMs = Date.now() - rawSaveStart;

    // 2단계: 파일 수신 + HTTP 수신 성공 로그 (메모리 push만, 디스크 write는 background)
    const receiveLogStart = Date.now();
    for (const log of logs) {
      if (log.filename) {
        errorLogRepository.success('FILE_RECEIVE', log.log_type, log.equipment_id, `파일 수신: ${log.filename}`);
      }
      errorLogRepository.success('HTTP_RECEIVE', log.target_table, log.equipment_id, `HTTP 수신 완료 (${logs.length}건 배치)`);
    }
    const receiveLogMs = Date.now() - receiveLogStart;

    // 3단계: DB INSERT (excluded 설비 제외)
    const logsToInsert = logs.filter(log => {
      if (equipmentRegistry.isExcluded(log.equipment_id)) {
        logger.info({ equipment_id: log.equipment_id, target_table: log.target_table }, 'Pipeline excluded — skip DB insert');
        errorLogRepository.success('PIPELINE_SKIP', log.target_table, log.equipment_id, '파이프라인 배제 설비 — DB INSERT 스킵');
        return false;
      }
      return true;
    });

    if (logsToInsert.length === 0) {
      const routeTotalMs = Date.now() - routeStart;
      logger.info({ batchSize: logs.length, rawSaveMs, receiveLogMs, routeTotalMs, accepted: 0, skipped: logs.length }, 'Logs processed (all skipped)');
      return reply.status(202).send({
        accepted: 0, failed: 0, skipped: logs.length,
        timestamp: localISOString(),
      });
    }

    try {
      const batchStart = Date.now();
      const result = await logIngestService.processLogBatch(logsToInsert);
      const processBatchMs = Date.now() - batchStart;
      const routeTotalMs = Date.now() - routeStart;

      logger.info({
        batchSize: logs.length,
        toInsert: logsToInsert.length,
        skipped: logs.length - logsToInsert.length,
        rawSaveMs, receiveLogMs, processBatchMs, routeTotalMs,
        accepted: result.accepted, failed: result.failed,
      }, 'Logs processed');

      return reply.status(202).send({
        accepted: result.accepted, failed: result.failed,
        skipped: logs.length - logsToInsert.length,
        timestamp: localISOString(),
      });
    } catch (err) {
      logger.error({ err, rawSaveMs, receiveLogMs, routeTotalMs: Date.now() - routeStart }, 'Failed to process logs');

      for (const log of logsToInsert) {
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
