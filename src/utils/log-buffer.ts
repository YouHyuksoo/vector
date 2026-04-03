/**
 * @file src/utils/log-buffer.ts
 * @description 시스템 로그를 메모리에 보관하는 링 버퍼 (circular buffer)
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 최근 500줄의 로그를 메모리에 보관하는 순환 버퍼
 * 2. **링 버퍼**: 고정 크기 배열에서 가장 오래된 항목을 덮어쓰는 자료구조
 * 3. **사용처**: pino multistream + Vector 자식 프로세스 stdout/stderr 캡처
 * 4. **API 연동**: GET /api/monitor/system-logs 에서 이 버퍼를 조회
 */

import { localISOString } from './logger.js';

/** 로그 항목 하나의 구조 */
export interface LogEntry {
  /** ISO 8601 타임스탬프 */
  timestamp: string;
  /** 로그 레벨: debug, info, warn, error, fatal */
  level: string;
  /** 로그 메시지 본문 */
  message: string;
  /** 로그 출처 컴포넌트 (예: 'backend', 'vector-aggregator') */
  component?: string;
}

/** pino 레벨 숫자 → 문자열 매핑 */
const PINO_LEVELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/**
 * 고정 크기 순환 버퍼로 최근 N개 로그를 메모리에 보관
 */
class LogBuffer {
  private buffer: (LogEntry | null)[];
  private head = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity = 500) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  /** 로그 항목 추가 */
  push(entry: LogEntry): void {
    this.buffer[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * 저장된 로그를 시간순(오래된 → 최신)으로 반환
   * @param options.limit - 최대 반환 개수
   * @param options.level - 필터할 레벨 ('all'이면 전체)
   * @param options.search - 메시지 내 검색 문자열 (대소문자 무시)
   */
  getEntries(options?: {
    limit?: number;
    level?: string;
    search?: string;
  }): LogEntry[] {
    const { limit = 100, level = 'all', search } = options ?? {};

    // 시간순으로 정렬된 전체 항목 수집
    const entries: LogEntry[] = [];
    const start = this.count < this.capacity
      ? 0
      : this.head;

    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const entry = this.buffer[idx];
      if (!entry) continue;

      // 레벨 필터
      if (level !== 'all' && entry.level !== level) continue;

      // 검색 필터
      if (search && !entry.message.toLowerCase().includes(search.toLowerCase())) continue;

      entries.push(entry);
    }

    // 최신이 먼저 오도록 역순, limit 적용
    return entries.reverse().slice(0, limit);
  }

  /** 현재 저장된 항목 수 */
  get size(): number {
    return this.count;
  }
}

/** 싱글턴 로그 버퍼 인스턴스 */
export const logBuffer = new LogBuffer(500);

/**
 * pino multistream용 Writable 스트림 생성
 * pino가 JSON 줄을 쓸 때마다 파싱하여 logBuffer에 추가
 */
export function createLogBufferStream(): { write: (chunk: string) => void } {
  return {
    write(chunk: string) {
      try {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const parsed = JSON.parse(line);
          const entry: LogEntry = {
            timestamp: parsed.time
              ? (() => { const d = new Date(parsed.time); const p = (n: number) => String(n).padStart(2, '0'); const ms = String(d.getMilliseconds()).padStart(3, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${ms}`; })()
              : localISOString(),
            level: PINO_LEVELS[parsed.level] ?? 'info',
            message: parsed.msg ?? '',
            component: parsed.component ?? 'backend',
          };
          logBuffer.push(entry);
        }
      } catch {
        // JSON 파싱 실패 시 원본 텍스트를 그대로 저장
        logBuffer.push({
          timestamp: localISOString(),
          level: 'info',
          message: chunk.toString().trim(),
          component: 'backend',
        });
      }
    },
  };
}

/**
 * Vector 자식 프로세스 출력을 logBuffer에 추가하는 헬퍼
 * @param data - stdout/stderr Buffer 데이터
 * @param level - 로그 레벨 (stdout→info, stderr→warn)
 */
export function pushVectorLog(data: Buffer, level: 'info' | 'warn' = 'info'): void {
  const text = data.toString().trim();
  if (!text) return;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    logBuffer.push({
      timestamp: localISOString(),
      level,
      message: trimmed,
      component: 'vector-aggregator',
    });
  }
}
