/**
 * @file src/database/dynamic-insert.ts
 * @description 동적 테이블 INSERT + 프로시져 CALL + executeMany() 벌크 삽입 (핵심 파일 #1)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: TableRegistry에서 가져온 스키마 정보로 동적 INSERT SQL 실행
 * 2. **단건 삽입**: `insert(tableName, data)` → Worker에서 개별 작업 처리용
 * 3. **벌크 삽입**: `insertMany(tableName, dataArray)` → executeMany()로 고성능 배치 처리
 * 4. **프로시져**: `callProcedure(key, data, extra)` → PL/SQL 프로시져 호출
 * 5. **batchErrors**: 부분 실패 허용 - 일부 행 실패해도 나머지는 삽입됨
 */

import oracledb, { type ExecuteManyOptions, type BindParameter } from 'oracledb';
import { getConnection } from './oracle.pool.js';
import { tableRegistry } from './table-registry.js';
import { getProcedure } from '../config/local-registry.js';
import { logger } from '../utils/logger.js';

class DynamicInsert {
  async insert(
    tableName: string,
    data: Record<string, unknown>,
    extraFields: Record<string, unknown> = {},
  ): Promise<number> {
    const schema = await tableRegistry.getSchema(tableName);

    if (!schema.insertSql) {
      throw new Error(`No INSERT SQL generated for table: ${tableName}`);
    }

    const bindValues = schema.columns.map((col) => {
      const raw = this.resolveSourceField(col.SOURCE_FIELD, data, extraFields);
      if ((raw === undefined || raw === null) && col.IS_REQUIRED === 'Y') {
        throw new Error(
          `Required column ${col.COLUMN_NAME} (source: ${col.SOURCE_FIELD}) missing for table ${tableName}`,
        );
      }
      return raw != null ? this.convertParamValue(raw, col.DATA_TYPE) : null;
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
    } catch (err: unknown) {
      // ORA-00001: unique constraint violated — 중복 행 무시 (재전송 시 이미 처리된 데이터)
      if (typeof err === 'object' && err !== null && (err as { errorNum?: number }).errorNum === 1) {
        logger.debug({ tableName }, 'Duplicate row skipped (ORA-00001)');
        return 0;
      }
      throw err;
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

  /**
   * 프로시져 레지스트리 키로 PL/SQL 프로시져를 호출한다.
   * callMode에 따라 NAMED(개별 파라미터) 또는 ARRAY(Oracle Collection) 방식으로 호출.
   * @param key - 레지스트리 키 (예: "PKG_BATCH.P_SPI_INSERT")
   * @param data - VRL 파싱된 데이터 객체 (data.* 필드)
   * @param extraFields - 추가 필드 (equipment_id, timestamp 등)
   */
  async callProcedure(
    key: string,
    data: Record<string, unknown>,
    extraFields: Record<string, unknown>,
  ): Promise<void> {
    const entry = getProcedure(key);
    if (!entry) {
      throw new Error(`Procedure not found in registry: ${key}`);
    }

    if (entry.callMode === 'ARRAY') {
      await this.callProcedureArray(entry, data, extraFields);
    } else {
      await this.callProcedureNamed(entry, data, extraFields);
    }
  }

  /** NAMED 모드: 개별 Named 파라미터로 호출 — BEGIN PKG(:P1, :P2); END; */
  private async callProcedureNamed(
    entry: { procedureName: string; params: { PARAM_ORDER: number; ARGUMENT_NAME: string; DATA_TYPE: string; IN_OUT: string; SOURCE_FIELD: string }[] },
    data: Record<string, unknown>,
    extraFields: Record<string, unknown>,
  ): Promise<void> {
    const sortedParams = [...entry.params].sort(
      (a, b) => a.PARAM_ORDER - b.PARAM_ORDER,
    );

    const binds: Record<string, BindParameter> = {};
    const paramNames: string[] = [];

    for (const param of sortedParams) {
      const bindName = param.ARGUMENT_NAME || `p${param.PARAM_ORDER}`;
      const value = this.resolveSourceField(param.SOURCE_FIELD, data, extraFields);
      const converted = this.convertParamValue(value, param.DATA_TYPE);

      binds[bindName] = {
        dir: param.IN_OUT === 'OUT'
          ? oracledb.BIND_OUT
          : param.IN_OUT === 'IN/OUT'
            ? oracledb.BIND_INOUT
            : oracledb.BIND_IN,
        type: this.getOracleType(param.DATA_TYPE),
        val: converted,
      };
      paramNames.push(`:${bindName}`);
    }

    const plsql = `BEGIN ${entry.procedureName}(${paramNames.join(', ')}); END;`;

    const conn = await getConnection();
    try {
      await conn.execute(plsql, binds, { autoCommit: true });
      logger.debug(
        { procedure: entry.procedureName, mode: 'NAMED' },
        'Procedure called (NAMED)',
      );
    } finally {
      await conn.close();
    }
  }

  /**
   * ARRAY 모드: Oracle Collection(VARRAY) 배열로 호출
   * — BEGIN PKG(:p_data, :p_info); END;
   * ARGUMENT_NAME으로 배열 그룹핑, PARAM_ORDER가 배열 인덱스(1-based)
   */
  private async callProcedureArray(
    entry: { procedureName: string; arrayTypeName?: string; params: { PARAM_ORDER: number; ARGUMENT_NAME: string; SOURCE_FIELD: string }[] },
    data: Record<string, unknown>,
    extraFields: Record<string, unknown>,
  ): Promise<void> {
    const typeName = entry.arrayTypeName;
    if (!typeName) {
      throw new Error(`arrayTypeName is required for ARRAY mode: ${entry.procedureName}`);
    }

    // ARGUMENT_NAME별로 파라미터를 그룹핑 (p_data, p_info 등)
    const groups = new Map<string, string[]>();
    const groupOrder: string[] = [];

    for (const param of entry.params) {
      const name = param.ARGUMENT_NAME;
      if (!groups.has(name)) {
        groups.set(name, []);
        groupOrder.push(name);
      }
      const arr = groups.get(name)!;
      const value = this.resolveSourceField(param.SOURCE_FIELD, data, extraFields);
      arr[param.PARAM_ORDER - 1] = value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    const conn = await getConnection();
    try {
      const ArrayClass = await conn.getDbObjectClass(typeName);
      const binds: Record<string, unknown> = {};
      const paramNames: string[] = [];

      for (const name of groupOrder) {
        const values = groups.get(name)!;
        binds[name] = new ArrayClass(values);
        paramNames.push(`:${name}`);
      }

      const plsql = `BEGIN ${entry.procedureName}(${paramNames.join(', ')}); END;`;
      await conn.execute(plsql, binds, { autoCommit: true });

      logger.debug(
        { procedure: entry.procedureName, mode: 'ARRAY', groups: groupOrder },
        'Procedure called (ARRAY)',
      );
    } finally {
      await conn.close();
    }
  }

  /**
   * SOURCE_FIELD 문자열에서 실제 값을 추출한다.
   * - "data.INSPECTOR" → data 객체에서 INSPECTOR 값
   * - "equipment_id" → extraFields에서 값
   */
  private resolveSourceField(
    sourceField: string,
    data: Record<string, unknown>,
    extraFields: Record<string, unknown>,
  ): unknown {
    if (!sourceField) return null;

    if (sourceField.startsWith('data.')) {
      const fieldName = sourceField.slice(5); // "data." 제거
      return data[fieldName] ?? null;
    }

    return extraFields[sourceField] ?? null;
  }

  /** 데이터 타입에 맞게 값을 변환한다. */
  private convertParamValue(value: unknown, dataType: string): unknown {
    if (value === null || value === undefined) return null;
    const upper = dataType.toUpperCase();

    if (upper === 'DATE' || upper.startsWith('TIMESTAMP')) {
      return value instanceof Date ? value : new Date(String(value));
    }
    if (upper === 'NUMBER') {
      if (typeof value === 'number') return value;
      const num = Number(value);
      return isNaN(num) ? null : num;
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private getOracleType(dataType: string): number {
    const upper = dataType.toUpperCase();
    if (upper === 'NUMBER') return oracledb.DB_TYPE_NUMBER;
    if (upper === 'DATE' || upper.startsWith('TIMESTAMP')) return oracledb.DB_TYPE_TIMESTAMP;
    if (upper === 'CLOB') return oracledb.DB_TYPE_CLOB;
    return oracledb.DB_TYPE_VARCHAR;
  }
}

export const dynamicInsert = new DynamicInsert();
