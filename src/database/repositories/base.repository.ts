/**
 * @file src/database/repositories/base.repository.ts
 * @description Oracle DB 기본 리포지토리 - 공통 CRUD 헬퍼
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 커넥션 획득/반환 로직을 캡슐화하여 리포지토리마다 반복 코드 방지
 * 2. **사용 방법**: 이 클래스를 상속하여 `this.execute()`, `this.executeDml()` 사용
 */

import { getConnection } from '../oracle.pool.js';

export class BaseRepository {
  protected async execute<T>(
    sql: string,
    binds: Record<string, unknown> = {},
    options: { autoCommit?: boolean } = { autoCommit: true },
  ): Promise<T[]> {
    const conn = await getConnection();
    try {
      const result = await conn.execute(sql, binds, options);
      return (result.rows ?? []) as T[];
    } finally {
      await conn.close();
    }
  }

  protected async executeOne<T>(
    sql: string,
    binds: Record<string, unknown> = {},
  ): Promise<T | null> {
    const rows = await this.execute<T>(sql, binds);
    return rows[0] ?? null;
  }

  protected async executeDml(
    sql: string,
    binds: Record<string, unknown> = {},
  ): Promise<number> {
    const conn = await getConnection();
    try {
      const result = await conn.execute(sql, binds, { autoCommit: true });
      return result.rowsAffected ?? 0;
    } finally {
      await conn.close();
    }
  }
}
