/**
 * @file src/utils/logger.ts
 * @description Pino 기반 구조화 로거
 *
 * 초보자 가이드:
 * 1. **주요 개념**: pino는 고성능 JSON 로거. dev 환경에서는 pino-pretty로 가독성 향상
 * 2. **사용 방법**: `import { logger } from './utils/logger.js'` → `logger.info({}, 'message')`
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: true,
    },
  },
});

export type Logger = typeof logger;
