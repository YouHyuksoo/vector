/**
 * @file src/database/table-registry.ts
 * @description TABLE_COLUMN_REGISTRY 메타 테이블 기반 동적 매핑 (핵심 파일 #4)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: TABLE_COLUMN_REGISTRY에서 테이블별 컬럼 정보를 로딩하여
 *    INSERT SQL을 자동 생성. 새 로그 타입 추가 시 DB 메타데이터만 INSERT하면 코드 수정 불필요.
 * 2. **캐시**: 5분 TTL 메모리 캐시로 DB 조회 최소화
 * 3. **사용 방법**: `await tableRegistry.getSchema('LOG_INSPECTION')` → { tableName, columns, insertSql }
 */

import { getConnection } from './oracle.pool.js';
import { REGISTRY_CACHE_TTL_MS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import type { TableColumnInfo, TableSchema } from '../types/index.js';

class TableRegistry {
  private cache = new Map<string, { schema: TableSchema; expiresAt: number }>();

  async getSchema(tableName: string): Promise<TableSchema> {
    const cached = this.cache.get(tableName);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.schema;
    }

    const schema = await this.loadSchema(tableName);
    this.cache.set(tableName, {
      schema,
      expiresAt: Date.now() + REGISTRY_CACHE_TTL_MS,
    });

    return schema;
  }

  private async loadSchema(tableName: string): Promise<TableSchema> {
    const conn = await getConnection();

    try {
      const result = await conn.execute<TableColumnInfo>(
        `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_REQUIRED, COLUMN_ORDER
         FROM TABLE_COLUMN_REGISTRY
         WHERE TABLE_NAME = :tableName
         ORDER BY COLUMN_ORDER`,
        { tableName },
      );

      const columns = (result.rows ?? []) as unknown as TableColumnInfo[];

      if (columns.length === 0) {
        throw new Error(`No schema found for table: ${tableName}`);
      }

      const columnNames = columns.map((c) => c.COLUMN_NAME);
      const bindNames = columns.map((_, i) => `:b${i}`);
      const insertSql = `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${bindNames.join(', ')})`;

      logger.info({ tableName, columnCount: columnNames.length }, 'Table schema loaded');

      return { tableName, columns, insertSql };
    } finally {
      await conn.close();
    }
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Table registry cache cleared');
  }
}

export const tableRegistry = new TableRegistry();
