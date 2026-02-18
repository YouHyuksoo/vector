/**
 * @file src/queue/queue.manager.ts
 * @description BullMQ 큐 및 워커 중앙 관리자
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 큐와 워커를 Map으로 관리하여 생성/종료를 일원화
 * 2. **사용 방법**: `getQueue('log-insert')` → Queue 인스턴스 반환
 * 3. **Graceful Shutdown**: `closeAllQueues()`로 워커 → 큐 순서로 종료
 */

import { Queue, Worker } from 'bullmq';
import { getRedisConnectionConfig } from '../redis/redis.client.js';
import { logger } from '../utils/logger.js';

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnectionConfig(),
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

export function registerWorker(name: string, worker: Worker): void {
  workers.set(name, worker);
  logger.info({ queue: name }, 'Worker registered');
}

export async function closeAllQueues(): Promise<void> {
  for (const [name, worker] of workers) {
    await worker.close();
    logger.info({ queue: name }, 'Worker closed');
  }

  for (const [name, queue] of queues) {
    await queue.close();
    logger.info({ queue: name }, 'Queue closed');
  }

  queues.clear();
  workers.clear();
}
