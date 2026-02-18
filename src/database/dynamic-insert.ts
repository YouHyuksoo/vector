/**
 * @file src/database/dynamic-insert.ts
 * @description 동적 테이블 INSERT + executeMany() 벌크 삽입 (핵심 파일 #1)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: TableRegistry에서 가져온 스키마 정보로 동적 INSERT SQL 실행
 * 2. **단건 삽입**: `insert(tableName, data)` → Worker에서 개별 작업 처리용
 * 3. **벌크 삽입**: `insertMany(tableName, dataArray)` → executeMany()로 고성능 배치 처리
 * 4. **batchErrors**: 부분 실패 허용 - 일부 행 실패해도 나머지는 삽입됨
 */

import oracledb, { type ExecuteManyOptions } from 'oracledb';
import { getConnection } from './oracle.pool.js';
import { tableRegistry } from './table-registry.js';
import { logger } from '../utils/logger.js';

class DynamicInsert {
  async insert(
    tableName: string,
    data: Record<string, unknown>,
  ): Promise<number> {
    const schema = await tableRegistry.getSchema(tableName);

    if (!schema.insertSql) {
      throw new Error(`No INSERT SQL generated for table: ${tableName}`);
    }

    const bindValues = schema.columns.map((col) => {
      const value = data[col.COLUMN_NAME];
      if (value === undefined && col.IS_REQUIRED === 'Y') {
        throw new Error(
          `Required column ${col.COLUMN_NAME} missing for table ${tableName}`,
        );
      }
      return value ?? null;
    });

    const conn = await getConnection();
    try {
      const result = await conn.execute(schema.insertSql, bindValues, {
        autoCommit: true,
      });

      logger.debug(
        { tableName, rowsAffected: result.rowsAffected },
        'Single row inserted',
      );

      return result.rowsAffected ?? 0;
    } finally {
      await conn.close();
    }
  }

  async insertMany(
    tableName: string,
    dataArray: Record<string, unknown>[],
  ): Promise<number> {
    if (dataArray.length === 0) return 0;

    const schema = await tableRegistry.getSchema(tableName);

    if (!schema.insertSql) {
      throw new Error(`No INSERT SQL generated for table: ${tableName}`);
    }

    const bindRows = dataArray.map((data) =>
      schema.columns.map((col) => data[col.COLUMN_NAME] ?? null),
    );

    const conn = await getConnection();
    try {
      const options: ExecuteManyOptions = {
        autoCommit: true,
        batchErrors: true,
        bindDefs: schema.columns.map((col) => ({
          type: this.getOracleType(col.DATA_TYPE),
          maxSize: col.DATA_TYPE === 'VARCHAR2' ? 4000 : undefined,
        })),
      };

      const result = await conn.executeMany(schema.insertSql, bindRows, options);

      if (result.batchErrors && result.batchErrors.length > 0) {
        logger.warn(
          {
            tableName,
            totalRows: dataArray.length,
            errorCount: result.batchErrors.length,
          },
          'Partial batch insert failure',
        );
      }

      const rowsInserted = result.rowsAffected ?? 0;
      logger.info({ tableName, rowsInserted }, 'Batch insert completed');

      return rowsInserted;
    } finally {
      await conn.close();
    }
  }

  private getOracleType(dataType: string): number {
    switch (dataType.toUpperCase()) {
      case 'NUMBER':
        return oracledb.DB_TYPE_NUMBER;
      case 'DATE':
      case 'TIMESTAMP':
        return oracledb.DB_TYPE_TIMESTAMP;
      case 'CLOB':
        return oracledb.DB_TYPE_CLOB;
      default:
        return oracledb.DB_TYPE_VARCHAR;
    }
  }
}

export const dynamicInsert = new DynamicInsert();
