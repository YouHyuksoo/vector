/**
 * @file src/utils/logger.ts
 * @description Pino 기반 구조화 로거 (multistream: stdout + 메모리 링버퍼)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: pino는 고성능 JSON 로거. dev 환경에서는 pino-pretty로 가독성 향상
 * 2. **사용 방법**: `import { logger } from './utils/logger.js'` → `logger.info({}, 'message')`
 * 3. **링버퍼 연동**: 모든 로그가 stdout + 메모리 버퍼에 동시 기록됨
 *    - GET /api/monitor/system-logs API로 최근 로그 조회 가능
 */

import pino from 'pino';
import { createLogBufferStream } from './log-buffer.js';

/**
 * 로그 버퍼 스트림: JSON 형태의 로그를 메모리 링버퍼에 저장
 * pino-pretty는 stdout에만 적용하고, 버퍼에는 raw JSON을 기록
 */
const bufferStream = createLogBufferStream();

/**
 * pino multistream 구성:
 * - stream 1: pino-pretty → stdout (사람이 읽기 좋은 포맷)
 * - stream 2: logBuffer (메모리 링버퍼, API 조회용)
 */
export const logger = pino(
  {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
  pino.multistream([
    {
      level: 'debug',
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      }),
    },
    {
      level: 'debug',
      stream: bufferStream,
    },
  ]),
);

export type Logger = typeof logger;
