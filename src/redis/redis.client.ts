/**
 * @file src/redis/redis.client.ts
 * @description IORedis 싱글턴 클라이언트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Redis 연결을 싱글턴으로 관리하여 커넥션 낭비 방지
 * 2. **BullMQ 호환**: maxRetriesPerRequest: null 필수 (BullMQ 요구사항)
 * 3. **사용 방법**: `getRedisClient()`로 클라이언트 획득, `closeRedis()`로 종료
 */

import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // BullMQ 필수 설정
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        logger.warn({ attempt: times, delay }, 'Redis reconnecting...');
        return delay;
      },
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error({ err }, 'Redis error'));
  }

  return redisClient;
}

/** BullMQ용 커넥션 설정 (ioredis 버전 충돌 방지) */
export function getRedisConnectionConfig() {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null as null,
  };
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}
