/**
 * @file agent-monitor/public/app.js
 * @description Vector Agent Manager - 프론트엔드 JavaScript 로직
 *
 * 초보자 가이드:
 * 1. 3개 탭(상태/설정/관리)의 인터랙션을 담당합니다
 * 2. 5초 폴링으로 Vector 상태/메트릭을 자동 갱신합니다
 * 3. 설정 탭: 폼 모드(설비 정보) + TOML 직접 편집 모드 전환
 * 4. 관리 탭: 프로세스 제어, 서비스 등록, 설치/업데이트
 */

/* ═══════════════════════════════════════════
   전역 상태
   ═══════════════════════════════════════════ */

const state = {
  status: null,
  metrics: null,
  config: { content: '', path: '' },
  configOriginal: '',
  files: [],
  isLoading: {},
};

let pollTimer = null;
const POLL_INTERVAL = 5000;

/* ═══════════════════════════════════════════
   유틸리티
   ═══════════════════════════════════════════ */

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatNum(n) { return (n ?? 0).toLocaleString('ko-KR'); }

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* ═══════════════════════════════════════════
   탭 전환
   ═══════════════════════════════════════════ */

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tabName}`);
  });

  /* 탭 진입 시 데이터 로드 */
  if (tabName === 'settings') loadSetup();
  if (tabName === 'management') {
    checkInstall();
    loadServiceStatus();
  }
}

/* ═══════════════════════════════════════════
   상태 탭 API
   ═══════════════════════════════════════════ */

async function fetchStatus() {
  try { state.status = await fetchJSON('/api/status'); }
  catch { state.status = { running: false, pid: null, apiReachable: false, uptime: null, version: null }; }
}

async function fetchMetrics() {
  try { state.metrics = await fetchJSON('/api/metrics'); }
  catch { state.metrics = null; }
}

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
   설정 탭 API
   ═══════════════════════════════════════════ */

async function loadSetup() {
  try {
    const data = await fetchJSON('/api/setup');
    document.getElementById('inp-eq-id').value = data.equipment_id || '';
    document.getElementById('inp-eq-type').value = data.equipment_type || '';
    document.getElementById('inp-ip').value = data.ip || '';
    document.getElementById('inp-line').value = data.line_code || '';
    document.getElementById('inp-log-type').value = data.log_type || '';
    document.getElementById('inp-include').value = data.include_paths || '';
    document.getElementById('inp-sink-addr').value = data.sink_address || '';
    document.getElementById('inp-sink-port').value = data.sink_port || '';
  } catch (err) {
    if (err.message.includes('404')) {
      showToast('설정 파일이 없습니다. 관리 탭에서 Vector를 먼저 설치해주세요.', 'warning');
    } else {
      showToast('설비 정보 로드 실패: ' + err.message, 'error');
    }
  }
}

async function saveSetup() {
  const fields = {
    equipment_id: document.getElementById('inp-eq-id').value,
    equipment_type: document.getElementById('inp-eq-type').value,
    ip: document.getElementById('inp-ip').value,
    line_code: document.getElementById('inp-line').value,
    log_type: document.getElementById('inp-log-type').value,
    sink_address: document.getElementById('inp-sink-addr').value,
    sink_port: document.getElementById('inp-sink-port').value,
  };
  try {
    await fetchJSON('/api/setup', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    showToast('설비 정보가 저장되었습니다. Vector 재시작이 필요합니다.', 'success');
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

async function loadConfig() {
  try {
    const data = await fetchJSON('/api/config');
    state.config = data;
    state.configOriginal = data.content;
    document.getElementById('editor-config').value = data.content;
    document.getElementById('txt-config-path').textContent = data.path;
  } catch (err) {
    if (err.message.includes('404')) {
      document.getElementById('editor-config').value = '';
      document.getElementById('txt-config-path').textContent = '파일 없음';
      showToast('설정 파일이 없습니다. 관리 탭에서 Vector를 먼저 설치해주세요.', 'warning');
    } else {
      showToast('설정 파일 로드 실패: ' + err.message, 'error');
    }
  }
}

async function saveConfig() {
  const content = document.getElementById('editor-config').value;
  try {
    await fetchJSON('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    state.configOriginal = content;
    state.config.content = content;
    showToast('설정이 저장되었습니다. Vector 재시작이 필요합니다.', 'success');
  } catch (err) {
    showToast('설정 저장 실패: ' + err.message, 'error');
  }
}

/* ═══════════════════════════════════════════
   관리 탭 API — 프로세스 제어
   ═══════════════════════════════════════════ */

async function startVector() {
  state.isLoading.start = true; updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/start', { method: 'POST' });
    showToast(data.error || 'Vector를 시작했습니다.', data.error ? 'warning' : 'success');
    await poll();
  } catch (err) { showToast('시작 실패: ' + err.message, 'error'); }
  finally { state.isLoading.start = false; updateActionButtons(); }
}

async function stopVector() {
  state.isLoading.stop = true; updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/stop', { method: 'POST' });
    showToast(data.error || 'Vector를 중지했습니다.', data.error ? 'warning' : 'success');
    await poll();
  } catch (err) { showToast('중지 실패: ' + err.message, 'error'); }
  finally { state.isLoading.stop = false; updateActionButtons(); }
}

async function restartVector() {
  state.isLoading.restart = true; updateActionButtons();
  try {
    await fetchJSON('/api/vector/restart', { method: 'POST' });
    showToast('Vector를 재시작했습니다.', 'success');
    await poll();
  } catch (err) { showToast('재시작 실패: ' + err.message, 'error'); }
  finally { state.isLoading.restart = false; updateActionButtons(); }
}

async function testConnection() {
  state.isLoading.testConn = true; updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/test-connection', { method: 'POST' });
    showToast(data.connected ? `연결 성공: ${data.host}:${data.port}` : `연결 실패: ${data.host}:${data.port}`, data.connected ? 'success' : 'error');
  } catch (err) { showToast('연결 테스트 실패: ' + err.message, 'error'); }
  finally { state.isLoading.testConn = false; updateActionButtons(); }
}

/* ═══════════════════════════════════════════
   관리 탭 API — 설치 / 업데이트
   ═══════════════════════════════════════════ */

async function checkInstall() {
  try {
    const data = await fetchJSON('/api/install/status');
    const el = document.getElementById('txt-install-status');
    el.textContent = data.installed ? '설치됨' : '미설치';
    el.className = `text-xs font-mono px-2 py-0.5 rounded ${data.installed ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`;
    document.getElementById('txt-bin-path').textContent = `${data.binaryPath} (${data.binaryExists ? 'O' : 'X'})`;
    document.getElementById('txt-cfg-path').textContent = `${data.configPath} (${data.configExists ? 'O' : 'X'})`;
    document.getElementById('btn-install').disabled = data.installed;
  } catch { /* 무시 */ }
}

async function installVector() {
  document.getElementById('btn-install').disabled = true;
  showToast('Vector 다운로드 중...', 'info');
  try {
    const data = await fetchJSON('/api/install', { method: 'POST' });
    showToast(data.message || '설치 완료', 'success');
    checkInstall();
  } catch (err) {
    showToast('설치 실패: ' + err.message, 'error');
    document.getElementById('btn-install').disabled = false;
  }
}

async function checkUpdate() {
  try {
    const data = await fetchJSON('/api/update/check');
    document.getElementById('txt-local-ver').textContent = data.localVersion || '미설치';
    document.getElementById('txt-server-ver').textContent = data.serverVersion || '연결 불가';
    const btnUpdate = document.getElementById('btn-update');
    if (data.updateAvailable) {
      btnUpdate.classList.remove('hidden');
    } else {
      btnUpdate.classList.add('hidden');
      if (data.localVersion && data.serverVersion) showToast('최신 버전입니다.', 'info');
    }
  } catch (err) { showToast('버전 확인 실패: ' + err.message, 'error'); }
}

async function executeUpdate() {
  document.getElementById('btn-update').disabled = true;
  showToast('업데이트 진행 중...', 'info');
  try {
    const data = await fetchJSON('/api/update/execute', { method: 'POST' });
    showToast(data.message || '업데이트 완료', 'success');
    document.getElementById('btn-update').classList.add('hidden');
    checkUpdate();
  } catch (err) {
    showToast('업데이트 실패: ' + err.message, 'error');
    document.getElementById('btn-update').disabled = false;
  }
}

/* ═══════════════════════════════════════════
   관리 탭 API — Windows 서비스
   ═══════════════════════════════════════════ */

async function loadServiceStatus() {
  try {
    const data = await fetchJSON('/api/service/status');
    const vecState = document.getElementById('svc-vector-state');
    const mgrState = document.getElementById('svc-manager-state');
    vecState.textContent = data.vector.state;
    mgrState.textContent = data.manager.state;
    const stateColor = (s) => s === 'RUNNING' ? 'bg-success/20 text-success' : s === 'NOT_INSTALLED' ? 'bg-muted text-muted-fg' : 'bg-warning/20 text-warning';
    vecState.className = `text-xs font-mono px-2 py-0.5 rounded ${stateColor(data.vector.state)}`;
    mgrState.className = `text-xs font-mono px-2 py-0.5 rounded ${stateColor(data.manager.state)}`;
  } catch { /* 무시 */ }
}

async function installService(target) {
  try {
    const data = await fetchJSON('/api/service/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const result = data[target];
    showToast(result?.success ? `${target} 서비스가 등록되었습니다.` : (result?.error || '등록 실패'), result?.success ? 'success' : 'error');
    loadServiceStatus();
  } catch (err) { showToast('서비스 등록 실패: ' + err.message, 'error'); }
}

async function uninstallService(target) {
  try {
    const data = await fetchJSON('/api/service/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const result = data[target];
    showToast(result?.success ? `${target} 서비스가 해제되었습니다.` : (result?.error || '해제 실패'), result?.success ? 'success' : 'error');
    loadServiceStatus();
  } catch (err) { showToast('서비스 해제 실패: ' + err.message, 'error'); }
}

/* ═══════════════════════════════════════════
   DOM 업데이트 함수
   ═══════════════════════════════════════════ */

function updateStatusCards() {
  const s = state.status;
  if (!s) return;
  const dot = document.getElementById('dot-status');
  const txt = document.getElementById('txt-status');
  const icon = document.getElementById('icon-status');

  if (s.running) {
    dot.className = 'inline-block w-3 h-3 rounded-full bg-success dot-pulse';
    txt.textContent = '실행 중';
    icon.textContent = 'check_circle';
    icon.classList.remove('text-error'); icon.classList.add('text-success');
  } else {
    dot.className = 'inline-block w-3 h-3 rounded-full bg-error';
    txt.textContent = '중지됨';
    icon.textContent = 'error';
    icon.classList.remove('text-success'); icon.classList.add('text-error');
  }
  document.getElementById('txt-pid').textContent = s.pid ?? '-';
  document.getElementById('txt-uptime').textContent = s.uptime ?? '-';
  document.getElementById('txt-version').textContent = s.version ?? '-';
  if (s.version) {
    const hv = document.getElementById('header-version');
    hv.textContent = s.version; hv.classList.remove('hidden');
  }
}

function updateMetrics() {
  const m = state.metrics;
  document.getElementById('txt-events-in').textContent = formatNum(m?.eventsIn);
  document.getElementById('txt-events-out').textContent = formatNum(m?.eventsOut);
  document.getElementById('txt-errors').textContent = formatNum(m?.errors);
  const pct = m?.bufferPercent ?? 0;
  document.getElementById('txt-buffer-pct').textContent = pct + '%';
  document.getElementById('txt-buffer-detail').textContent = `${formatBytes(m?.bufferUsedBytes)} / ${formatBytes(m?.bufferMaxBytes)}`;
  const bar = document.getElementById('bar-buffer');
  bar.style.width = pct + '%';
  bar.className = pct > 80 ? 'h-full rounded-full bg-warning transition-all duration-500' : 'h-full rounded-full bg-primary transition-all duration-500';

  const sources = m?.components?.sources ?? [];
  const sinks = m?.components?.sinks ?? [];
  document.getElementById('list-sources').innerHTML = sources.length
    ? sources.map(s => `<div class="px-2 py-0.5 rounded bg-muted text-xs">${esc(s)}</div>`).join('')
    : '<span class="text-muted-fg italic">없음</span>';
  document.getElementById('list-sinks').innerHTML = sinks.length
    ? sinks.map(s => `<div class="px-2 py-0.5 rounded bg-muted text-xs">${esc(s)}</div>`).join('')
    : '<span class="text-muted-fg italic">없음</span>';
}

function updateRecentFiles(watchPaths) {
  const pathEl = document.getElementById('watch-paths');
  pathEl.textContent = watchPaths.length ? '감시 경로: ' + watchPaths.join(', ') : '';
  const tbody = document.getElementById('tbody-files');
  if (!state.files.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-muted-fg italic">감시 중인 파일이 없습니다</td></tr>';
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

function updateActionButtons() {
  const running = state.status?.running ?? false;
  const L = state.isLoading;
  document.getElementById('btn-start').disabled = running || !!L.start;
  document.getElementById('btn-stop').disabled = !running || !!L.stop;
  document.getElementById('btn-restart').disabled = !running || !!L.restart;
  document.getElementById('btn-test-conn').disabled = !!L.testConn;
}

function updateUI() {
  updateStatusCards();
  updateMetrics();
  updateActionButtons();
}

/* ═══════════════════════════════════════════
   토스트 시스템
   ═══════════════════════════════════════════ */

const TOAST_ICONS = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
const TOAST_COLORS = { success: 'bg-success', error: 'bg-error', warning: 'bg-warning', info: 'bg-info' };

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast-enter flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-lg ${TOAST_COLORS[type] || TOAST_COLORS.info}`;
  toast.innerHTML = `<span class="material-symbols-outlined text-lg">${TOAST_ICONS[type] || TOAST_ICONS.info}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

/* ═══════════════════════════════════════════
   다크모드
   ═══════════════════════════════════════════ */

function initDarkMode() {
  const saved = localStorage.getItem('agent-manager-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;
  if (isDark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  updateThemeIcon();
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('agent-manager-theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById('icon-theme');
  icon.textContent = document.documentElement.classList.contains('dark') ? 'dark_mode' : 'light_mode';
}

/* ═══════════════════════════════════════════
   설정 탭 모드 전환
   ═══════════════════════════════════════════ */

function switchSettingsMode(mode) {
  const formSection = document.getElementById('settings-form');
  const tomlSection = document.getElementById('settings-toml');
  const btnForm = document.getElementById('btn-mode-form');
  const btnToml = document.getElementById('btn-mode-toml');

  if (mode === 'form') {
    formSection.classList.remove('hidden');
    tomlSection.classList.add('hidden');
    btnForm.className = 'px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white';
    btnToml.className = 'px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-fg border border-border';
    loadSetup();
  } else {
    formSection.classList.add('hidden');
    tomlSection.classList.remove('hidden');
    btnToml.className = 'px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white';
    btnForm.className = 'px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-fg border border-border';
    loadConfig();
  }
}

/* ═══════════════════════════════════════════
   폴링 루프
   ═══════════════════════════════════════════ */

async function poll() {
  await Promise.all([fetchStatus(), fetchMetrics()]);
  updateUI();
}

/* ═══════════════════════════════════════════
   이벤트 바인딩
   ═══════════════════════════════════════════ */

function bindEvents() {
  /* 다크모드 */
  document.getElementById('btn-dark-toggle').addEventListener('click', toggleDarkMode);

  /* 탭 전환 */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* 설정 모드 전환 */
  document.getElementById('btn-mode-form').addEventListener('click', () => switchSettingsMode('form'));
  document.getElementById('btn-mode-toml').addEventListener('click', () => switchSettingsMode('toml'));

  /* 설비 정보 저장 */
  document.getElementById('btn-save-setup').addEventListener('click', saveSetup);

  /* TOML 저장/되돌리기 */
  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-revert-config').addEventListener('click', () => {
    document.getElementById('editor-config').value = state.configOriginal;
    showToast('원래 설정으로 되돌렸습니다.', 'info');
  });

  /* 프로세스 제어 */
  document.getElementById('btn-start').addEventListener('click', startVector);
  document.getElementById('btn-stop').addEventListener('click', stopVector);
  document.getElementById('btn-restart').addEventListener('click', restartVector);
  document.getElementById('btn-test-conn').addEventListener('click', testConnection);

  /* 설치 */
  document.getElementById('btn-install').addEventListener('click', installVector);

  /* 업데이트 */
  document.getElementById('btn-update').addEventListener('click', executeUpdate);
}

/* ═══════════════════════════════════════════
   앱 초기화
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  initDarkMode();
  bindEvents();
  await Promise.all([poll(), loadRecentLogs()]);
  pollTimer = setInterval(poll, POLL_INTERVAL);
  setInterval(loadRecentLogs, 30000);
});
