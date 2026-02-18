/**
 * @file src/services/log-ingest.service.ts
 * @description 로그 수집 비즈니스 로직 서비스
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 라우트 핸들러와 큐 프로듀서 사이의 비즈니스 로직 계층
 * 2. **현재 구조**: 단순 위임이지만, 추후 로그 필터링/변환 로직 추가 시 이 계층에서 처리
 */

import { logProducer } from '../queue/producers/log.producer.js';
import { logger } from '../utils/logger.js';
import type { LogRecord } from '../types/index.js';

class LogIngestService {
  async processLogBatch(logs: LogRecord[]): Promise<{ accepted: number }> {
    await logProducer.addBulk(logs);
    logger.info({ count: logs.length }, 'Log batch processed');
    return { accepted: logs.length };
  }
}

export const logIngestService = new LogIngestService();
