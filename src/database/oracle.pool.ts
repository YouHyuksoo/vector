/**
 * @file src/database/oracle.pool.ts
 * @description Oracle 커넥션 풀 관리 (Thin 모드)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: Thin 모드는 Oracle Client 설치 없이 순수 JS로 DB 연결
 * 2. **커넥션 풀**: min~max 범위로 커넥션을 미리 생성/재사용하여 성능 최적화
 * 3. **사용 방법**: `await initOraclePool()` 후 `await getConnection()` → 사용 후 `conn.close()`
 */

import oracledb, { type Pool, type Connection } from 'oracledb';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let pool: Pool | null = null;

export async function initOraclePool(): Promise<Pool> {
  if (pool) return pool;

  try {
    pool = await oracledb.createPool({
      user: env.ORACLE_USER,
      password: env.ORACLE_PASSWORD,
      connectString: env.ORACLE_CONNECT_STRING,
      poolMin: env.ORACLE_POOL_MIN,
      poolMax: env.ORACLE_POOL_MAX,
      poolIncrement: 1,
    });

    oracledb.fetchAsString = [oracledb.DB_TYPE_CLOB, oracledb.DB_TYPE_TIMESTAMP, oracledb.DB_TYPE_DATE];
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

    logger.info(
      { min: env.ORACLE_POOL_MIN, max: env.ORACLE_POOL_MAX },
      'Oracle connection pool initialized',
    );

    return pool;
  } catch (err) {
    logger.error({ err }, 'Failed to initialize Oracle pool');
    throw err;
  }
}

export async function getConnection(): Promise<Connection> {
  if (!pool) {
    await initOraclePool();
  }
  return pool!.getConnection();
}

export async function closeOraclePool(): Promise<void> {
  if (pool) {
    await pool.close(10); // 10초 drain timeout
    pool = null;
    logger.info('Oracle connection pool closed');
  }
}
