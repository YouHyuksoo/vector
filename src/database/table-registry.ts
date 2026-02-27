/**
 * @file src/database/table-registry.ts
 * @description 로컬 JSON 파일 기반 동적 테이블 매핑 (핵심 파일 #4)
 *
 * 초보자 가이드:
 * 1. config/table-registry.json에서 테이블별 컬럼 정보를 로딩하여 INSERT SQL 자동 생성
 * 2. DB 의존 없이 로컬 파일로 스키마 관리 — 새 테이블 추가 시 JSON만 수정하면 됨
 * 3. 5분 TTL 메모리 캐시로 파일 I/O 최소화
 * 4. 사용: `await tableRegistry.getSchema('LOG_SPI')` → { tableName, columns, insertSql }
 */

import { getTableColumns, type RegistryColumn } from '../config/local-registry.js';
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

    const schema = this.loadSchema(tableName);
    this.cache.set(tableName, {
      schema,
      expiresAt: Date.now() + REGISTRY_CACHE_TTL_MS,
    });

    return schema;
  }

  private loadSchema(tableName: string): TableSchema {
    const registryColumns = getTableColumns(tableName);

    if (registryColumns.length === 0) {
      throw new Error(`No schema found for table: ${tableName}`);
    }

    const columns: TableColumnInfo[] = registryColumns.map((col: RegistryColumn) => ({
      TABLE_NAME: tableName,
      COLUMN_NAME: col.COLUMN_NAME,
      DATA_TYPE: col.DATA_TYPE,
      SOURCE_FIELD: col.SOURCE_FIELD || col.COLUMN_NAME,
      IS_REQUIRED: col.IS_REQUIRED || 'N',
      COLUMN_ORDER: col.COLUMN_ORDER,
    }));

    const columnNames = columns.map((c) => c.COLUMN_NAME);
    const bindNames = columns.map((_, i) => `:b${i}`);
    const insertSql = `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${bindNames.join(', ')})`;

    logger.info({ tableName, columnCount: columnNames.length }, 'Table schema loaded from local config');

    return { tableName, columns, insertSql };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Table registry cache cleared');
  }
}

export const tableRegistry = new TableRegistry();
