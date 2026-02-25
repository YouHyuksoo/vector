declare module 'oracledb' {
  interface PoolAttributes {
    user?: string;
    password?: string;
    connectString?: string;
    poolMin?: number;
    poolMax?: number;
    poolIncrement?: number;
  }

  interface ExecuteOptions {
    autoCommit?: boolean;
    outFormat?: number;
  }

  interface ExecuteManyOptions {
    autoCommit?: boolean;
    batchErrors?: boolean;
    bindDefs?: Array<{ type: number; maxSize?: number }>;
  }

  interface ExecuteResult<T = unknown> {
    rows?: T[];
    rowsAffected?: number;
    batchErrors?: Array<{ errorNum: number; message: string; offset: number }>;
  }

  /** Oracle DB Object (Collection 타입 인스턴스) */
  interface DbObject {
    new (data?: unknown[]): DbObject;
    [index: number]: unknown;
    length: number;
  }

  /** Oracle DB Object Class (Collection 타입 생성자) */
  interface DbObjectClass {
    new (data?: unknown[]): DbObject;
  }

  interface Connection {
    execute<T = unknown>(
      sql: string,
      binds?: unknown[] | Record<string, unknown> | Record<string, BindParameter>,
      options?: ExecuteOptions,
    ): Promise<ExecuteResult<T>>;
    executeMany(
      sql: string,
      binds: unknown[][],
      options?: ExecuteManyOptions,
    ): Promise<ExecuteResult>;
    /** Oracle Collection/Object 타입 클래스를 조회한다 */
    getDbObjectClass(typeName: string): Promise<DbObjectClass>;
    close(): Promise<void>;
  }

  interface Pool {
    getConnection(): Promise<Connection>;
    close(drainTime?: number): Promise<void>;
  }

  const DB_TYPE_VARCHAR: number;
  const DB_TYPE_NUMBER: number;
  const DB_TYPE_TIMESTAMP: number;
  const DB_TYPE_CLOB: number;
  const OUT_FORMAT_OBJECT: number;

  const BIND_IN: number;
  const BIND_INOUT: number;
  const BIND_OUT: number;

  interface BindParameter {
    dir?: number;
    type?: number;
    val?: unknown;
    maxSize?: number;
  }

  let fetchAsString: number[];
  let outFormat: number;

  function createPool(attrs: PoolAttributes): Promise<Pool>;

  export default {
    DB_TYPE_VARCHAR,
    DB_TYPE_NUMBER,
    DB_TYPE_TIMESTAMP,
    DB_TYPE_CLOB,
    OUT_FORMAT_OBJECT,
    BIND_IN,
    BIND_INOUT,
    BIND_OUT,
    fetchAsString,
    outFormat,
    createPool,
  };

  export {
    Pool,
    Connection,
    PoolAttributes,
    ExecuteOptions,
    ExecuteManyOptions,
    ExecuteResult,
    BindParameter,
    DB_TYPE_VARCHAR,
    DB_TYPE_NUMBER,
    DB_TYPE_TIMESTAMP,
    DB_TYPE_CLOB,
    OUT_FORMAT_OBJECT,
    BIND_IN,
    BIND_INOUT,
    BIND_OUT,
  };
}
