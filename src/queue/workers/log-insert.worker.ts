/**
 * @file src/queue/workers/log-insert.worker.ts
 * @description BullMQ Worker - 큐에서 로그 소비 → Oracle DB 삽입 (핵심 파일 #2)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: BullMQ 큐에서 작업을 꺼내 DynamicInsert로 Oracle DB에 삽입
 * 2. **에러 처리**: 삽입 실패 시 LOG_ERROR 테이블에 기록 후 BullMQ가 재시도 관리
 * 3. **동시성**: env.QUEUE_CONCURRENCY만큼 병렬 처리
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionConfig } from '../../redis/redis.client.js';
import { QUEUE_NAMES } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { dynamicInsert } from '../../database/dynamic-insert.js';
import { errorLogRepository } from '../../database/repositories/error-log.repository.js';
import { registerWorker } from '../queue.manager.js';
import { logger } from '../../utils/logger.js';
import type { LogRecord } from '../../types/index.js';

async function processLogInsert(job: Job<LogRecord>): Promise<void> {
  const { equipment_id, target_table, data, timestamp } = job.data;

  try {
    await dynamicInsert.insert(target_table, {
      ...data,
      EQUIPMENT_ID: equipment_id,
      LOG_TIMESTAMP: timestamp,
      CREATED_AT: new Date().toISOString(),
    });

    logger.debug(
      { jobId: job.id, table: target_table, equipment_id },
      'Log inserted successfully',
    );
  } catch (err) {
    logger.error(
      { err, jobId: job.id, table: target_table, equipment_id },
      'Log insert failed',
    );

    await errorLogRepository.record({
      source_table: target_table,
      equipment_id,
      error_message: err instanceof Error ? err.message : String(err),
      raw_data: JSON.stringify(job.data),
    });

    throw err; // BullMQ가 재시도 처리
  }
}

export function startLogInsertWorker(): Worker {
  const worker = new Worker(QUEUE_NAMES.LOG_INSERT, processLogInsert, {
    connection: getRedisConnectionConfig(),
    concurrency: env.QUEUE_CONCURRENCY,
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  registerWorker(QUEUE_NAMES.LOG_INSERT, worker);
  return worker;
}
