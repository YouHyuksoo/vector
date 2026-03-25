/**
 * @file src/app/dashboard/sender/components/agent-toml-helpers.ts
 * @description Agent TOML 파싱/편집 유틸리티 함수 모음
 *
 * 초보자 가이드:
 * 1. TOML 문자열에서 정규식으로 값을 추출하거나 교체하는 순수 함수들
 * 2. AgentConfigForm, AgentFileOptions, AgentTransportOptions 등에서 공유
 * 3. 하트비트(static_metrics), multiline, include 경로 등 섹션별 헬퍼 포함
 */

/* ── 기본 TOML 키-값 헬퍼 ─────────────────────── */

/** VRL source 블록의 .key = "value" 추출 */
export const getMeta = (c: string, k: string) =>
  c.match(new RegExp(`\\.${k}\\s*=\\s*"([^"]*)"`))  ?.[1] ?? '';

/** VRL source 블록의 .key = "value" 교체 */
export const setMeta = (c: string, k: string, v: string) =>
  c.replace(new RegExp(`(\\.${k}\\s*=\\s*")([^"]*)(")`, 'm'), `$1${v}$3`);

/** 유일한 TOML 키의 값 추출 (address 제외 — 중복 키) */
export const getVal = (c: string, k: string) =>
  c.match(new RegExp(`^${k}\\s*=\\s*"?([^"\\n]*)"?`, 'm'))?.[1]?.trim() ?? '';

/** 유일한 TOML 키의 값 교체 */
export const setVal = (c: string, k: string, v: string, q = true) =>
  c.replace(new RegExp(`(^${k}\\s*=\\s*)"?[^"\\n]*"?`, 'm'), `$1${q ? `"${v}"` : v}`);

/* ── Aggregator 주소 헬퍼 ─────────────────────── */

/** [sinks.to_aggregator] 섹션의 address → [ip, port] */
export const getSinkAddr = (c: string): [string, string] => {
  const m = c.match(/\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*"([^:]+):(\d+)"/);
  return m ? [m[1], m[2]] : ['', ''];
};

/** [sinks.to_aggregator] 섹션의 address 교체 */
export const setSinkAddr = (c: string, ip: string, port: string) =>
  c.replace(
    /(\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*")[^"]*(")/,
    `$1${ip}:${port}$2`,
  );

/* ── 하트비트 (레거시 — Agent Manager가 직접 전송하므로 더 이상 사용 안 함) ── */
/* 하트비트는 Agent Manager가 HTTP POST로 직접 전송합니다.
   아래 함수들은 기존 TOML에 남아있는 internal_metrics 섹션 정리용으로만 유지합니다. */

/** @deprecated Agent Manager가 하트비트를 직접 전송 — Vector internal_metrics 불필요 */
export const hasHeartbeat = (c: string): boolean =>
  /\[sources\.heartbeat\]/.test(c);

/** 레거시 heartbeat 섹션 제거 (기존 TOML 정리용) */
export const removeHeartbeat = (c: string): string => {
  // internal_metrics + remap 방식 제거
  let result = c.replace(
    /\n?#[^\n]*하트비트[^\n]*\n\[sources\.heartbeat\][\s\S]*?\[transforms\.heartbeat_meta\][\s\S]*?'''\n/,
    '\n',
  );
  // 이전 static_metrics 방식도 호환 제거
  result = result.replace(
    /\n?#[^\n]*하트비트[^\n]*\n\[sources\.heartbeat\][\s\S]*?\[sources\.heartbeat\.metrics\.tags\]\n(?:.*\n)*?(?=\n(?:#|\[))/,
    '\n',
  );
  result = result.replace(
    /inputs\s*=\s*\["add_metadata",\s*"heartbeat_meta"\]/,
    'inputs = ["add_metadata"]',
  );
  result = result.replace(
    /inputs\s*=\s*\["add_metadata",\s*"heartbeat"\]/,
    'inputs = ["add_metadata"]',
  );
  return result;
};

/** @deprecated 레거시 heartbeat remap 태그 추출 */
export const getHeartbeatTag = (c: string, key: string): string => {
  const m = c.match(new RegExp(
    `\\[transforms\\.heartbeat_meta\\][\\s\\S]*?\\.tags\\.${key}\\s*=\\s*"([^"]*)"`,
  ));
  if (m) return m[1];
  const m2 = c.match(new RegExp(
    `\\[sources\\.heartbeat\\.metrics\\.tags\\][\\s\\S]*?${key}\\s*=\\s*"([^"]*)"`,
  ));
  return m2?.[1] ?? '';
};

/* ── include 경로 헬퍼 ────────────────────────── */

/** include 배열 추출 (TOML → 단일 \) */
export const getInclude = (c: string) => {
  const m = c.match(/include\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return '';
  return m[1].split('\n').map(l => l.replace(/["',]/g, '').trim())
    .filter(Boolean).map(p => p.replace(/\\\\/g, '\\')).join('\n');
};

/** include 배열 교체 — TOML 리터럴 문자열 '...' 사용 (백슬래시 이스케이프 불필요) */
export const setInclude = (c: string, paths: string) => {
  const lines = paths.split('\n').filter(Boolean)
    .map(p => `  '${p.trim()}',`).join('\n');
  return c.replace(/include\s*=\s*\[[\s\S]*?\]/, `include = [\n${lines}\n]`);
};

/* ── resend 폴더 헬퍼 ─────────────────────────── */

/** [sources.resend_logs] 섹션의 include 경로 추출 */
export const getResendInclude = (c: string): string => {
  const sec = c.match(/\[sources\.resend_logs\][\s\S]*?include\s*=\s*\[([\s\S]*?)\]/);
  if (!sec) return '';
  return sec[1].split('\n').map(l => l.replace(/["',]/g, '').trim())
    .filter(Boolean).map(p => p.replace(/\\\\/g, '\\')).join('\n');
};

/** [sources.resend_logs] 섹션의 include 경로 교체 */
export const setResendInclude = (c: string, path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) return c;
  const m = c.match(/(\[sources\.resend_logs\][\s\S]*?)include\s*=\s*\[[\s\S]*?\]/);
  if (!m) return c;
  const before = c.slice(0, m.index! + m[1].length);
  const after = c.slice(m.index! + m[0].length);
  return before + `include = [\n  '${trimmed}',\n]` + after;
};

/** [sources.resend_logs] 섹션의 remove_after_secs 추출 */
export const getResendDeleteSecs = (c: string): string => {
  const sec = c.match(/\[sources\.resend_logs\][\s\S]*?remove_after_secs\s*=\s*(\d+)/);
  return sec?.[1] ?? '';
};

/** [sources.resend_logs] 섹션의 remove_after_secs 교체 */
export const setResendDeleteSecs = (c: string, secs: string): string => {
  const idx = c.indexOf('[sources.resend_logs]');
  if (idx < 0) return c;
  const sub = c.slice(idx);
  const m = sub.match(/remove_after_secs\s*=\s*\d+/);
  if (!m) return c;
  const absIdx = idx + m.index!;
  return c.slice(0, absIdx) + `remove_after_secs = ${secs}` + c.slice(absIdx + m[0].length);
};

/* ── multiline / recursive 헬퍼 ──────────────── */

/** multiline 섹션 존재 여부 (파일 통째 전송 모드) */
export const hasMultiline = (c: string): boolean =>
  /\[sources\.work_logs\.multiline\]/.test(c);

/** multiline 섹션 추가 (파일 통째 전송) */
export const addMultiline = (c: string): string => {
  if (hasMultiline(c)) return c;
  const ml = `\n# ── 파일 전체를 하나의 이벤트로 묶기 ──\n[sources.work_logs.multiline]\nstart_pattern = "^"\ncondition_pattern = 'ZZZZZ_NEVER_MATCH_ZZZZZ'\nmode = "halt_before"\ntimeout_ms = 1000\n`;
  return c.replace(/(\[transforms\.add_metadata\])/, ml + '\n$1');
};

/** multiline 섹션 제거 (줄 단위 전송) */
export const removeMultiline = (c: string): string =>
  c.replace(/\n?#[^\n]*파일 전체[^\n]*\n\[sources\.work_logs\.multiline\][\s\S]*?timeout_ms\s*=\s*\d+\n?/, '\n');

/** include 경로에 ** 패턴이 포함되어 있는지 */
export const hasRecursive = (paths: string): boolean =>
  paths.split('\n').some(p => /\*\*/.test(p));

/** 하위폴더 포함 토글: *.ext ↔ **\*.ext */
export const toggleRecursive = (paths: string, on: boolean): string =>
  paths.split('\n').filter(Boolean).map(p => {
    const trimmed = p.trim();
    if (on) {
      if (/\*\*/.test(trimmed)) return trimmed;
      return trimmed.replace(/([/\\])(\*\.[^/\\]+)$/, '$1**$1$2');
    }
    return trimmed.replace(/([/\\])\*\*[/\\](\*\.)/, '$1$2');
  }).join('\n');
