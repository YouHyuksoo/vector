/**
 * @file src/queue/producers/log.producer.ts
 * @description BullMQ 큐에 로그 작업 배치 적재
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 수신된 로그를 BullMQ 큐에 작업(Job)으로 적재
 * 2. **우선순위**: ALARM 로그는 priority 1 (최우선), 나머지는 5
 * 3. **재시도**: 실패 시 지수 백오프로 3회 자동 재시도
 */

import { getQueue } from '../queue.manager.js';
import { QUEUE_NAMES, BULLMQ_DEFAULTS, LOG_TYPES } from '../../config/constants.js';
import type { LogRecord } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

class LogProducer {
  private get queue() {
    return getQueue(QUEUE_NAMES.LOG_INSERT);
  }

  async addBulk(logs: LogRecord[]): Promise<void> {
    const jobs = logs.map((log) => ({
      name: `insert-${log.target_table}`,
      data: log,
      opts: {
        priority: log.log_type === LOG_TYPES.ALARM ? 1 : 5,
        attempts: BULLMQ_DEFAULTS.MAX_RETRIES,
        backoff: {
          type: BULLMQ_DEFAULTS.BACKOFF_TYPE,
          delay: BULLMQ_DEFAULTS.BACKOFF_DELAY,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }));

    await this.queue.addBulk(jobs);
    logger.debug({ count: logs.length }, 'Jobs added to queue');
  }
}

export const logProducer = new LogProducer();
