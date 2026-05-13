/**
 * @file src/config/env.ts
 * @description 환경 변수 검증 및 타입 안전한 설정 관리
 *
 * 초보자 가이드:
 * 1. **주요 개념**: zod 스키마로 .env 파일의 값을 검증하고 타입을 부여
 * 2. **사용 방법**: `import { env } from './config/env.js'` 후 `env.PORT` 등으로 접근
 * 3. **환경 변수 추가**: envSchema에 필드 추가 → .env.example 업데이트
 */

import { z } from 'zod';
import { config } from 'dotenv';

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3110),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  ORACLE_USER: z.string(),
  ORACLE_PASSWORD: z.string(),
  ORACLE_CONNECT_STRING: z.string(),
  ORACLE_POOL_MIN: z.coerce.number().default(8),
  ORACLE_POOL_MAX: z.coerce.number().default(40),

  RAW_LOG_BASE_PATH: z.string().default('C:\\data\\raw-logs'),

  HEARTBEAT_TTL_SECONDS: z.coerce.number().default(60),
  AGENT_MONITOR_PORT: z.coerce.number().default(9090),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/**
 * env 객체의 특정 키를 런타임에 업데이트 (즉시 반영)
 * zod 스키마를 통해 타입 변환(coerce) 후 메모리 + process.env 동시 반영
 */
export function updateEnvValue(key: keyof Env, value: string): void {
  const shape = envSchema.shape[key];
  const result = shape.safeParse(value);
  if (result.success) {
    (env as Record<string, unknown>)[key] = result.data;
    process.env[key] = value;
  }
}
