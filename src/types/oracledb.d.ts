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

  interface Connection {
    execute<T = unknown>(
      sql: string,
      binds?: unknown[] | Record<string, unknown>,
      options?: ExecuteOptions,
    ): Promise<ExecuteResult<T>>;
    executeMany(
      sql: string,
      binds: unknown[][],
      options?: ExecuteManyOptions,
    ): Promise<ExecuteResult>;
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

  let fetchAsString: number[];
  let outFormat: number;

  function createPool(attrs: PoolAttributes): Promise<Pool>;

  export default {
    DB_TYPE_VARCHAR,
    DB_TYPE_NUMBER,
    DB_TYPE_TIMESTAMP,
    DB_TYPE_CLOB,
    OUT_FORMAT_OBJECT,
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
    DB_TYPE_VARCHAR,
    DB_TYPE_NUMBER,
    DB_TYPE_TIMESTAMP,
    DB_TYPE_CLOB,
    OUT_FORMAT_OBJECT,
  };
}
