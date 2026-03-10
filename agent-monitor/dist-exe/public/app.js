/**
 * @file agent-monitor/public/app.js
 * @description Vector Agent Monitor - 프론트엔드 JavaScript 로직
 *
 * 초보자 가이드:
 * 1. 이 파일은 Agent Monitor UI의 모든 인터랙션을 담당합니다
 * 2. 5초 폴링으로 Vector 상태/메트릭을 자동 갱신합니다
 * 3. API 호출 함수, DOM 업데이트 함수, 이벤트 바인딩으로 구성됩니다
 * 4. 다크모드 토글은 localStorage에 저장되어 새로고침해도 유지됩니다
 */

/* ═══════════════════════════════════════════
   전역 상태
   ═══════════════════════════════════════════ */

/** @type {{ status: object|null, metrics: object|null, config: {content:string, path:string}, configOriginal: string, files: Array, isLoading: Record<string,boolean> }} */
const state = {
  status: null,
  metrics: null,
  config: { content: '', path: '' },
  configOriginal: '',
  files: [],
  isLoading: {},
};

/** 폴링 인터벌 ID */
let pollTimer = null;

/** 폴링 주기 (ms) */
const POLL_INTERVAL = 5000;

/* ═══════════════════════════════════════════
   유틸리티
   ═══════════════════════════════════════════ */

/**
 * fetch 래퍼 - JSON 응답 반환
 * @param {string} url - API 엔드포인트
 * @param {RequestInit} [options] - fetch 옵션
 * @returns {Promise<object>} JSON 응답
 */
async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 바이트를 사람이 읽기 쉬운 형태로 변환
 * @param {number} bytes
 * @returns {string} 예: "1.2 MB"
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * 날짜 문자열을 로컬 형식으로 변환
 * @param {string} isoStr - ISO 8601 문자열
 * @returns {string} 로컬 날짜시간 문자열
 */
function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/**
 * 숫자에 천 단위 구분자 추가
 * @param {number} n
 * @returns {string}
 */
function formatNum(n) {
  return (n ?? 0).toLocaleString('ko-KR');
}

/* ═══════════════════════════════════════════
   API 호출 함수
   ═══════════════════════════════════════════ */

/** Vector 실행 상태 조회 */
async function fetchStatus() {
  try {
    state.status = await fetchJSON('/api/status');
  } catch {
    state.status = { running: false, pid: null, apiReachable: false, uptime: null, version: null };
  }
}

/** 전송 메트릭 조회 */
async function fetchMetrics() {
  try {
    state.metrics = await fetchJSON('/api/metrics');
  } catch {
    state.metrics = null;
  }
}

/** TOML 설정 로드 */
async function loadConfig() {
  try {
    const data = await fetchJSON('/api/config');
    state.config = data;
    state.configOriginal = data.content;
    updateConfigEditor();
  } catch (err) {
    showToast('설정 파일 로드 실패: ' + err.message, 'error');
  }
}

/** TOML 설정 저장 */
async function saveConfig() {
  const editor = document.getElementById('editor-config');
  const content = editor.value;
  state.isLoading.saveConfig = true;
  try {
    await fetchJSON('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    state.configOriginal = content;
    state.config.content = content;
    showToast('설정이 저장되었습니다.', 'success');
  } catch (err) {
    showToast('설정 저장 실패: ' + err.message, 'error');
  } finally {
    state.isLoading.saveConfig = false;
  }
}

/** Vector 시작 */
async function startVector() {
  state.isLoading.start = true;
  updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/start', { method: 'POST' });
    showToast(data.error || 'Vector를 시작했습니다.', data.error ? 'warning' : 'success');
    await poll();
  } catch (err) {
    showToast('시작 실패: ' + err.message, 'error');
  } finally {
    state.isLoading.start = false;
    updateActionButtons();
  }
}

/** Vector 중지 */
async function stopVector() {
  state.isLoading.stop = true;
  updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/stop', { method: 'POST' });
    showToast(data.error || 'Vector를 중지했습니다.', data.error ? 'warning' : 'success');
    await poll();
  } catch (err) {
    showToast('중지 실패: ' + err.message, 'error');
  } finally {
    state.isLoading.stop = false;
    updateActionButtons();
  }
}

/** Vector 재시작 */
async function restartVector() {
  state.isLoading.restart = true;
  updateActionButtons();
  try {
    await fetchJSON('/api/vector/restart', { method: 'POST' });
    showToast('Vector를 재시작했습니다.', 'success');
    await poll();
  } catch (err) {
    showToast('재시작 실패: ' + err.message, 'error');
  } finally {
    state.isLoading.restart = false;
    updateActionButtons();
  }
}

/** Aggregator 연결 테스트 */
async function testConnection() {
  state.isLoading.testConn = true;
  updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/test-connection', { method: 'POST' });
    if (data.connected) {
      showToast(`연결 성공: ${data.host}:${data.port}`, 'success');
    } else {
      showToast(`연결 실패: ${data.host}:${data.port}`, 'error');
    }
  } catch (err) {
    showToast('연결 테스트 실패: ' + err.message, 'error');
  } finally {
    state.isLoading.testConn = false;
    updateActionButtons();
  }
}

/** 최근 감시 파일 조회 */
async function loadRecentLogs() {
  try {
    const data = await fetchJSON('/api/logs/recent');
    state.files = data.files || [];
    updateRecentFiles(data.watchPaths || []);
  } catch {
    state.files = [];
    updateRecentFiles([]);
  }
}

/* ═══════════════════════════════════════════
   DOM 업데이트 함수
   ═══════════════════════════════════════════ */

/** 상태 카드 업데이트 */
function updateStatusCards() {
  const s = state.status;
  if (!s) return;

  const dot = document.getElementById('dot-status');
  const txt = document.getElementById('txt-status');
  const icon = document.getElementById('icon-status');
  const pid = document.getElementById('txt-pid');
  const uptime = document.getElementById('txt-uptime');
  const version = document.getElementById('txt-version');
  const headerVer = document.getElementById('header-version');

  if (s.running) {
    dot.className = 'inline-block w-3 h-3 rounded-full bg-success dot-pulse';
    txt.textContent = '실행 중';
    icon.textContent = 'check_circle';
    icon.classList.remove('text-error');
    icon.classList.add('text-success');
  } else {
    dot.className = 'inline-block w-3 h-3 rounded-full bg-error';
    txt.textContent = '중지됨';
    icon.textContent = 'error';
    icon.classList.remove('text-success');
    icon.classList.add('text-error');
  }

  pid.textContent = s.pid ?? '-';
  uptime.textContent = s.uptime ?? '-';
  version.textContent = s.version ?? '-';

  if (s.version) {
    headerVer.textContent = s.version;
    headerVer.classList.remove('hidden');
  }
}

/** 전송 메트릭 업데이트 */
function updateMetrics() {
  const m = state.metrics;

  document.getElementById('txt-events-in').textContent = formatNum(m?.eventsIn);
  document.getElementById('txt-events-out').textContent = formatNum(m?.eventsOut);
  document.getElementById('txt-errors').textContent = formatNum(m?.errors);

  const pct = m?.bufferPercent ?? 0;
  document.getElementById('txt-buffer-pct').textContent = pct + '%';
  document.getElementById('txt-buffer-detail').textContent =
    `${formatBytes(m?.bufferUsedBytes)} / ${formatBytes(m?.bufferMaxBytes)}`;

  const bar = document.getElementById('bar-buffer');
  bar.style.width = pct + '%';
  bar.className = pct > 80
    ? 'h-full rounded-full bg-warning transition-all duration-500'
    : 'h-full rounded-full bg-primary transition-all duration-500';

  /* Sources / Sinks 목록 */
  const sources = m?.components?.sources ?? [];
  const sinks = m?.components?.sinks ?? [];

  document.getElementById('list-sources').innerHTML = sources.length
    ? sources.map((s) => `<div class="px-2 py-0.5 rounded bg-muted text-xs">${esc(s)}</div>`).join('')
    : '<span class="text-muted-fg italic">없음</span>';

  document.getElementById('list-sinks').innerHTML = sinks.length
    ? sinks.map((s) => `<div class="px-2 py-0.5 rounded bg-muted text-xs">${esc(s)}</div>`).join('')
    : '<span class="text-muted-fg italic">없음</span>';
}

/** 설정 에디터 업데이트 */
function updateConfigEditor() {
  document.getElementById('editor-config').value = state.config.content;
  document.getElementById('txt-config-path').textContent = state.config.path;
}

/**
 * 최근 파일 테이블 업데이트
 * @param {string[]} watchPaths - 감시 경로 배열
 */
function updateRecentFiles(watchPaths) {
  const pathEl = document.getElementById('watch-paths');
  pathEl.textContent = watchPaths.length
    ? '감시 경로: ' + watchPaths.join(', ')
    : '';

  const tbody = document.getElementById('tbody-files');

  if (!state.files.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-muted-fg italic">감시 중인 파일이 없습니다</td></tr>`;
    return;
  }

  tbody.innerHTML = state.files.map((f, i) => {
    const stripe = i % 2 === 0 ? 'bg-transparent' : 'bg-secondary/50';
    return `<tr class="${stripe}">
      <td class="py-1.5 pr-4 font-mono text-xs">${esc(f.name)}</td>
      <td class="py-1.5 pr-4 text-xs text-muted-fg hidden sm:table-cell truncate max-w-[200px]">${esc(f.dir)}</td>
      <td class="py-1.5 pr-4 text-xs text-muted-fg">${formatDate(f.modifiedAt)}</td>
      <td class="py-1.5 text-xs text-right font-mono">${formatBytes(f.sizeBytes)}</td>
    </tr>`;
  }).join('');
}

/** 액션 버튼 상태 업데이트 */
function updateActionButtons() {
  const running = state.status?.running ?? false;
  const loading = state.isLoading;

  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnRestart = document.getElementById('btn-restart');
  const btnTest = document.getElementById('btn-test-conn');

  btnStart.disabled = running || !!loading.start;
  btnStop.disabled = !running || !!loading.stop;
  btnRestart.disabled = !running || !!loading.restart;
  btnTest.disabled = !!loading.testConn;
}

/** 전체 UI 갱신 (폴링 콜백) */
function updateUI() {
  updateStatusCards();
  updateMetrics();
  updateActionButtons();
}

/**
 * HTML 이스케이프
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* ═══════════════════════════════════════════
   토스트 시스템
   ═══════════════════════════════════════════ */

/** 토스트 아이콘 매핑 */
const TOAST_ICONS = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/** 토스트 색상 매핑 */
const TOAST_COLORS = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
};

/**
 * 토스트 알림 표시
 * @param {string} message - 메시지
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - 타입
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const color = TOAST_COLORS[type] || TOAST_COLORS.info;
  const icon = TOAST_ICONS[type] || TOAST_ICONS.info;

  toast.className = `toast-enter flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-lg ${color}`;
  toast.innerHTML = `<span class="material-symbols-outlined text-lg">${icon}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

/* ═══════════════════════════════════════════
   다크모드 토글
   ═══════════════════════════════════════════ */

/** 다크모드 초기화 (localStorage 기반) */
function initDarkMode() {
  const saved = localStorage.getItem('agent-monitor-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeIcon();
}

/** 다크모드 토글 */
function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('agent-monitor-theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
}

/** 테마 아이콘 업데이트 */
function updateThemeIcon() {
  const icon = document.getElementById('icon-theme');
  const isDark = document.documentElement.classList.contains('dark');
  icon.textContent = isDark ? 'dark_mode' : 'light_mode';
}

/* ═══════════════════════════════════════════
   폴링 루프
   ═══════════════════════════════════════════ */

/** 상태 + 메트릭 동시 조회 */
async function poll() {
  await Promise.all([fetchStatus(), fetchMetrics()]);
  updateUI();
}

/* ═══════════════════════════════════════════
   이벤트 바인딩
   ═══════════════════════════════════════════ */

/** 모든 버튼에 이벤트 핸들러 등록 */
function bindEvents() {
  document.getElementById('btn-dark-toggle').addEventListener('click', toggleDarkMode);
  document.getElementById('btn-start').addEventListener('click', startVector);
  document.getElementById('btn-stop').addEventListener('click', stopVector);
  document.getElementById('btn-restart').addEventListener('click', restartVector);
  document.getElementById('btn-test-conn').addEventListener('click', testConnection);
  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-revert-config').addEventListener('click', () => {
    document.getElementById('editor-config').value = state.configOriginal;
    showToast('원래 설정으로 되돌렸습니다.', 'info');
  });
}

/* ═══════════════════════════════════════════
   앱 초기화
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  initDarkMode();
  bindEvents();

  /* 초기 데이터 로드 (병렬) */
  await Promise.all([poll(), loadConfig(), loadRecentLogs()]);

  /* 5초 폴링 시작 */
  pollTimer = setInterval(poll, POLL_INTERVAL);

  /* 30초마다 파일 목록 갱신 */
  setInterval(loadRecentLogs, 30000);
});
