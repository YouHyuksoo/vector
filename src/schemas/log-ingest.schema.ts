/**
 * @file src/schemas/log-ingest.schema.ts
 * @description Zod 기반 요청 유효성 검증 스키마
 *
 * 초보자 가이드:
 * 1. **주요 개념**: API 진입점에서 데이터 형식을 검증하여 잘못된 데이터가 큐에 들어가지 않도록 방지
 * 2. **Vector 호환**: Vector HTTP sink는 배치를 JSON 배열로 전송하므로 배열 형식도 지원
 */

import { z } from 'zod';

export const logRecordSchema = z.object({
  equipment_id: z.string().min(1),
  equipment_type: z.string().optional(),
  log_type: z.string().min(1),
  target_type: z.enum(['TABLE', 'PROCEDURE']).default('TABLE'),
  target_table: z.string().min(1),
  timestamp: z.string(),
  data: z.record(z.unknown()),
  raw_message: z.string().optional(),
  filename: z.string().optional(),
  line_code: z.string().optional(),
});

/** Vector HTTP sink는 단일 객체 또는 JSON 배열로 전송, 수동 호출은 { logs: [...] } 형식 */
export const logBatchSchema = z.union([
  z.object({ logs: z.array(logRecordSchema).min(1).max(1000) }),
  z.array(logRecordSchema).min(1).max(1000),
  logRecordSchema,
]);

export const heartbeatSchema = z.object({
  equipment_id: z.string().min(1),
  timestamp: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type LogRecordInput = z.infer<typeof logRecordSchema>;
export type LogBatchInput = z.infer<typeof logBatchSchema>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
