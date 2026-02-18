/**
 * @file src/utils/retry.ts
 * @description 지수 백오프 재시도 유틸리티
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 일시적 오류(네트워크, DB 커넥션)에 대해 자동 재시도
 * 2. **사용 방법**: `await withRetry(() => someAsyncFn(), { maxRetries: 3, baseDelay: 1000 })`
 */

import { logger } from './logger.js';

interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay = 30000, onRetry } = options;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt > maxRetries) {
        throw err;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const error = err instanceof Error ? err : new Error(String(err));

      logger.warn({ attempt, maxRetries, delay, error: error.message }, 'Retrying...');
      onRetry?.(error, attempt);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
