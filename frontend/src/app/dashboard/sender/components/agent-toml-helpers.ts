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

/* ── 하트비트 (static_metrics) 헬퍼 ─────────── */

/** [sources.heartbeat] 섹션 존재 여부 */
export const hasHeartbeat = (c: string): boolean =>
  /\[sources\.heartbeat\]/.test(c);

/** heartbeat interval_secs 추출 */
export const getHeartbeatInterval = (c: string): string => {
  const m = c.match(/\[sources\.heartbeat\][\s\S]*?interval_secs\s*=\s*(\d+)/);
  return m?.[1] ?? '30';
};

/** heartbeat interval_secs 교체 */
export const setHeartbeatInterval = (c: string, v: string): string =>
  c.replace(
    /(\[sources\.heartbeat\][\s\S]*?interval_secs\s*=\s*)\d+/,
    `$1${v}`,
  );

/** heartbeat 섹션 추가 (설비 메타데이터 태그 동기화) */
export const addHeartbeat = (c: string): string => {
  if (hasHeartbeat(c)) return c;
  const eqType = getMeta(c, 'equipment_type') || 'UNKNOWN';
  const eqId = getMeta(c, 'equipment_id') || 'UNKNOWN';
  const lineCode = getMeta(c, 'line_code') || 'LINE-01';
  const logType = getMeta(c, 'log_type') || 'INSPECTION';
  const ip = getHeartbeatTag(c, 'ip') || '';
  const ipLine = ip ? `\nip = "${ip}"` : '';
  const hb = `\n# ── [하트비트] 주기적 상태 전송 (30초 간격) ──\n[sources.heartbeat]\ntype = "static_metrics"\ninterval_secs = 30\nnamespace = "agent"\n\n[[sources.heartbeat.metrics]]\nname = "heartbeat"\nkind = "absolute"\n\n[sources.heartbeat.metrics.value.gauge]\nvalue = 1\n\n[sources.heartbeat.metrics.tags]\nequipment_type = "${eqType}"\nequipment_id = "${eqId}"\nline_code = "${lineCode}"\nlog_type = "${logType}"${ipLine}\n`;
  let result = c.replace(/(\[transforms\.add_metadata\])/, hb + '\n$1');
  result = result.replace(
    /inputs\s*=\s*\["add_metadata"\]/,
    'inputs = ["add_metadata", "heartbeat"]',
  );
  return result;
};

/** heartbeat 섹션 제거 */
export const removeHeartbeat = (c: string): string => {
  let result = c.replace(
    /\n?#[^\n]*하트비트[^\n]*\n\[sources\.heartbeat\][\s\S]*?\[sources\.heartbeat\.metrics\.tags\]\n(?:.*\n)*?(?=\n(?:#|\[))/,
    '\n',
  );
  result = result.replace(
    /inputs\s*=\s*\["add_metadata",\s*"heartbeat"\]/,
    'inputs = ["add_metadata"]',
  );
  return result;
};

/** heartbeat tags에서 특정 키 값 추출 */
export const getHeartbeatTag = (c: string, key: string): string => {
  const m = c.match(new RegExp(
    `\\[sources\\.heartbeat\\.metrics\\.tags\\][\\s\\S]*?${key}\\s*=\\s*"([^"]*)"`,
  ));
  return m?.[1] ?? '';
};

/** heartbeat tags의 설비 메타데이터를 add_metadata와 동기화 */
export const syncHeartbeatTags = (c: string, key: string, value: string): string => {
  if (!hasHeartbeat(c)) return c;
  const tagRegex = new RegExp(
    `(\\[sources\\.heartbeat\\.metrics\\.tags\\][\\s\\S]*?)${key}\\s*=\\s*"[^"]*"`,
  );
  if (tagRegex.test(c)) {
    return c.replace(tagRegex, `$1${key} = "${value}"`);
  }
  // 태그가 없으면 tags 섹션 끝에 추가
  return c.replace(
    /(\[sources\.heartbeat\.metrics\.tags\][\s\S]*?)(log_type\s*=\s*"[^"]*")/,
    `$1$2\n${key} = "${value}"`,
  );
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

/* ── multiline / recursive 헬퍼 ──────────────── */

/** multiline 섹션 존재 여부 (파일 통째 전송 모드) */
export const hasMultiline = (c: string): boolean =>
  /\[sources\.work_logs\.multiline\]/.test(c);

/** multiline 섹션 추가 (파일 통째 전송) */
export const addMultiline = (c: string): string => {
  if (hasMultiline(c)) return c;
  const ml = `\n# ── 파일 전체를 하나의 이벤트로 묶기 ──\n[sources.work_logs.multiline]\nstart_pattern = "^"\ncondition_pattern = '^$$NEVER_MATCH'\nmode = "halt_before"\ntimeout_ms = 1000\n`;
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
