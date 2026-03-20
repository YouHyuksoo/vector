/**
 * @file src/app/dashboard/sender/components/fluent-conf-helpers.ts
 * @description Fluent Bit .conf 파일의 모든 설정값을 추출/수정하는 헬퍼 함수
 *
 * 초보자 가이드:
 * 1. Fluent Bit conf는 [SECTION] + Key Value 형태의 INI-like 포맷
 * 2. 정규식으로 특정 섹션의 키 값을 읽고 교체
 * 3. agent-toml-helpers.ts의 Fluent Bit 버전
 */

// ─── 범용 getter/setter ───

/** conf에서 특정 키의 값 추출 (첫 번째 매치) */
export function getVal(conf: string, key: string): string {
  const re = new RegExp(`^\\s+${escapeRe(key)}\\s+(.+)$`, 'm');
  const m = conf.match(re);
  return m ? m[1].trim() : '';
}

/** conf에서 특정 키의 값 변경 (첫 번째 매치) */
export function setVal(conf: string, key: string, value: string): string {
  const re = new RegExp(`(^\\s+${escapeRe(key)}\\s+).+$`, 'm');
  return conf.replace(re, `$1${value}`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── [SERVICE] 섹션 ───

export function getFlush(conf: string): string { return getVal(conf, 'Flush'); }
export function setFlush(conf: string, v: string): string { return setVal(conf, 'Flush', v); }

export function getLogLevel(conf: string): string { return getVal(conf, 'Log_Level'); }
export function setLogLevel(conf: string, v: string): string { return setVal(conf, 'Log_Level', v); }

export function getStoragePath(conf: string): string { return getVal(conf, 'storage.path'); }
export function setStoragePath(conf: string, v: string): string { return setVal(conf, 'storage.path', v); }

export function getStorageSync(conf: string): string { return getVal(conf, 'storage.sync'); }
export function setStorageSync(conf: string, v: string): string { return setVal(conf, 'storage.sync', v); }

// ─── [MULTILINE_PARSER] 섹션 ───

export function getFlushTimeout(conf: string): string { return getVal(conf, 'Flush_timeout'); }
export function setFlushTimeout(conf: string, v: string): string { return setVal(conf, 'Flush_timeout', v); }

// ─── [INPUT] 섹션 ───

export function getInputPath(conf: string): string { return getVal(conf, 'Path'); }
export function setInputPath(conf: string, v: string): string { return setVal(conf, 'Path', v); }

export function getInputTag(conf: string): string { return getVal(conf, 'Tag'); }
export function setInputTag(conf: string, v: string): string { return setVal(conf, 'Tag', v); }

export function getReadFromHead(conf: string): string { return getVal(conf, 'Read_from_Head'); }
export function setReadFromHead(conf: string, v: string): string { return setVal(conf, 'Read_from_Head', v); }

export function getDB(conf: string): string { return getVal(conf, 'DB'); }
export function setDB(conf: string, v: string): string { return setVal(conf, 'DB', v); }

export function getRefreshInterval(conf: string): string { return getVal(conf, 'Refresh_Interval'); }
export function setRefreshInterval(conf: string, v: string): string { return setVal(conf, 'Refresh_Interval', v); }

export function getMultiline(conf: string): string { return getVal(conf, 'Multiline'); }
export function setMultiline(conf: string, v: string): string { return setVal(conf, 'Multiline', v); }

// ─── [FILTER] 섹션 (Add 키 전용) ───

/** [FILTER] 섹션에서 Add 키의 값 추출 (예: Add equipment_type AOI → AOI) */
export function getFilterAdd(conf: string, key: string): string {
  const re = new RegExp(`^\\s+Add\\s+${key}\\s+(.+)$`, 'm');
  const m = conf.match(re);
  return m ? m[1].trim() : '';
}

/** [FILTER] 섹션에서 Add 키 값 변경 */
export function setFilterAdd(conf: string, key: string, value: string): string {
  const re = new RegExp(`(^\\s+Add\\s+${key}\\s+).+$`, 'm');
  if (re.test(conf)) {
    return conf.replace(re, `$1${value}`);
  }
  return conf.replace(
    /(\[FILTER\][\s\S]*?)((?=\n\[)|$)/,
    `$1    Add           ${key} ${value}\n$2`
  );
}

// ─── [OUTPUT] 섹션 ───

export function getOutputHost(conf: string): string { return getVal(conf, 'Host'); }
export function setOutputHost(conf: string, v: string): string { return setVal(conf, 'Host', v); }

export function getOutputPort(conf: string): string { return getVal(conf, 'Port'); }
export function setOutputPort(conf: string, v: string): string { return setVal(conf, 'Port', v); }

/** storage.total_limit_size 추출 (숫자만, 단위 제거) */
export function getBufferSize(conf: string): string {
  const raw = getVal(conf, 'storage.total_limit_size');
  if (raw.endsWith('M')) return raw.replace('M', '');
  if (raw.endsWith('G')) return String(parseInt(raw) * 1024);
  return raw;
}

/** storage.total_limit_size 변경 (숫자 → XM 형식) */
export function setBufferSize(conf: string, mb: string): string {
  return setVal(conf, 'storage.total_limit_size', `${mb}M`);
}
