/**
 * @file agent-monitor/public/app.js
 * @description Vector Agent Manager - 프론트엔드 JavaScript 로직 (다국어 지원)
 *
 * 초보자 가이드:
 * 1. 3개 탭(상태/설정/관리)의 인터랙션을 담당합니다
 * 2. 5초 폴링으로 Vector 상태/메트릭을 자동 갱신합니다
 * 3. 설정 탭: 폼 모드(설비 정보) + TOML 직접 편집 모드 전환
 * 4. 관리 탭: 프로세스 제어, 서비스 등록, 설치/업데이트
 * 5. 다국어: 한국어/영어/스페인어/베트남어 (localStorage 저장)
 */

/* ═══════════════════════════════════════════
   다국어 사전
   ═══════════════════════════════════════════ */

const I18N = {
  ko: {
    'tab.status': '상태', 'tab.settings': '설정', 'tab.management': '관리',
    'status.runState': '실행 상태', 'status.checking': '확인 중...', 'status.uptime': '가동 시간',
    'status.version': '버전', 'status.transfer': '전송 현황', 'status.bufferUsage': '버퍼 사용량',
    'status.recentFiles': '최근 감시 파일', 'status.fileName': '파일명', 'status.directory': '디렉토리',
    'status.modifiedAt': '수정 시간', 'status.size': '크기', 'status.loadingFiles': '파일 정보를 불러오는 중...',
    'status.running': '실행 중', 'status.stopped': '중지됨', 'status.noFiles': '감시 중인 파일이 없습니다',
    'settings.formMode': '폼 모드', 'settings.tomlMode': 'TOML 편집', 'settings.equipInfo': '설비 정보',
    'settings.equipId': '설비 ID (equipment_id)', 'settings.equipType': '설비 타입 (equipment_type)',
    'settings.ipAddr': 'IP 주소', 'settings.lineCode': '라인 코드 (line_code)',
    'settings.logType': '로그 타입 (log_type)', 'settings.logPath': '로그 경로 (include)',
    'settings.aggAddr': 'Aggregator 주소', 'settings.aggPort': 'Aggregator 포트',
    'settings.saveSetup': '설비 정보 저장', 'settings.tomlConfig': 'TOML 설정',
    'settings.loadingConfig': '설정 파일을 불러오는 중...', 'settings.revert': '되돌리기',
    'settings.restartNeeded': '저장 후 Vector 재시작이 필요합니다 (관리 탭에서 재시작)',
    'mgmt.processCtrl': '프로세스 제어', 'mgmt.start': '시작', 'mgmt.stop': '중지',
    'mgmt.restart': '재시작', 'mgmt.testConn': '연결 테스트', 'mgmt.winService': 'Windows 서비스',
    'mgmt.register': '등록', 'mgmt.unregister': '해제', 'mgmt.installUpdate': '설치 / 업데이트',
    'mgmt.installStatus': 'Vector 설치 상태', 'mgmt.binary': '바이너리', 'mgmt.configFile': '설정파일',
    'mgmt.installVector': 'Vector 설치', 'mgmt.vectorUpdate': 'Vector 업데이트',
    'mgmt.checkVersion': '버전 확인', 'mgmt.localVer': '로컬 버전', 'mgmt.serverVer': '서버 버전',
    'mgmt.execUpdate': '업데이트 실행', 'mgmt.installed': '설치됨', 'mgmt.notInstalled': '미설치', 'mgmt.needsConfig': 'TOML 설정파일 필요',
    'mgmt.win7Notice': 'Windows 7 전용 버전 (v0.38)입니다. 최신 기능이 일부 제한될 수 있습니다.',
    'common.save': '저장', 'common.none': '없음',
    'footer': 'Vector Agent Manager &middot; 설비 PC 종합 관리',
    'toast.setupLoadFail': '설비 정보 로드 실패: ', 'toast.setupSaved': '설비 정보가 저장되었습니다. Vector 재시작이 필요합니다.',
    'toast.setupSaveFail': '저장 실패: ', 'toast.configLoadFail': '설정 파일 로드 실패: ',
    'toast.configSaved': '설정이 저장되었습니다. Vector 재시작이 필요합니다.', 'toast.configSaveFail': '설정 저장 실패: ',
    'toast.configReverted': '원래 설정으로 되돌렸습니다.', 'toast.noConfig': '설정 파일이 없습니다. 관리 탭에서 Vector를 먼저 설치해주세요.',
    'toast.configNoFile': '설정 파일이 없습니다. 관리 탭에서 Vector를 먼저 설치해주세요.',
    'toast.vectorStarted': 'Vector를 시작했습니다.', 'toast.startFail': '시작 실패: ',
    'toast.vectorStopped': 'Vector를 중지했습니다.', 'toast.stopFail': '중지 실패: ',
    'toast.vectorRestarted': 'Vector를 재시작했습니다.', 'toast.restartFail': '재시작 실패: ',
    'toast.connOk': '연결 성공: ', 'toast.connFail': '연결 실패: ', 'toast.connTestFail': '연결 테스트 실패: ',
    'toast.downloading': 'Vector 다운로드 중...', 'toast.installFail': '설치 실패: ',
    'toast.latestVer': '최신 버전입니다.', 'toast.verCheckFail': '버전 확인 실패: ',
    'toast.updating': '업데이트 진행 중...', 'toast.updateFail': '업데이트 실패: ',
    'toast.svcRegistered': ' 서비스가 등록되었습니다.', 'toast.svcRegFail': '서비스 등록 실패: ',
    'toast.svcUnregistered': ' 서비스가 해제되었습니다.', 'toast.svcUnregFail': '서비스 해제 실패: ',
  },
  en: {
    'tab.status': 'Status', 'tab.settings': 'Settings', 'tab.management': 'Management',
    'status.runState': 'Run State', 'status.checking': 'Checking...', 'status.uptime': 'Uptime',
    'status.version': 'Version', 'status.transfer': 'Transfer Status', 'status.bufferUsage': 'Buffer Usage',
    'status.recentFiles': 'Recent Watched Files', 'status.fileName': 'File Name', 'status.directory': 'Directory',
    'status.modifiedAt': 'Modified', 'status.size': 'Size', 'status.loadingFiles': 'Loading file info...',
    'status.running': 'Running', 'status.stopped': 'Stopped', 'status.noFiles': 'No watched files',
    'settings.formMode': 'Form Mode', 'settings.tomlMode': 'TOML Edit', 'settings.equipInfo': 'Equipment Info',
    'settings.equipId': 'Equipment ID', 'settings.equipType': 'Equipment Type',
    'settings.ipAddr': 'IP Address', 'settings.lineCode': 'Line Code',
    'settings.logType': 'Log Type', 'settings.logPath': 'Log Path (include)',
    'settings.aggAddr': 'Aggregator Address', 'settings.aggPort': 'Aggregator Port',
    'settings.saveSetup': 'Save Equipment Info', 'settings.tomlConfig': 'TOML Config',
    'settings.loadingConfig': 'Loading config file...', 'settings.revert': 'Revert',
    'settings.restartNeeded': 'Vector restart required after saving (restart in Management tab)',
    'mgmt.processCtrl': 'Process Control', 'mgmt.start': 'Start', 'mgmt.stop': 'Stop',
    'mgmt.restart': 'Restart', 'mgmt.testConn': 'Test Connection', 'mgmt.winService': 'Windows Service',
    'mgmt.register': 'Register', 'mgmt.unregister': 'Unregister', 'mgmt.installUpdate': 'Install / Update',
    'mgmt.installStatus': 'Vector Install Status', 'mgmt.binary': 'Binary', 'mgmt.configFile': 'Config File',
    'mgmt.installVector': 'Install Vector', 'mgmt.vectorUpdate': 'Vector Update',
    'mgmt.checkVersion': 'Check Version', 'mgmt.localVer': 'Local Version', 'mgmt.serverVer': 'Server Version',
    'mgmt.execUpdate': 'Run Update', 'mgmt.installed': 'Installed', 'mgmt.notInstalled': 'Not Installed', 'mgmt.needsConfig': 'TOML config needed',
    'mgmt.win7Notice': 'Windows 7 edition (v0.38). Some latest features may not be available.',
    'common.save': 'Save', 'common.none': 'None',
    'footer': 'Vector Agent Manager &middot; Equipment PC Management',
    'toast.setupLoadFail': 'Failed to load equipment info: ', 'toast.setupSaved': 'Equipment info saved. Vector restart required.',
    'toast.setupSaveFail': 'Save failed: ', 'toast.configLoadFail': 'Failed to load config: ',
    'toast.configSaved': 'Config saved. Vector restart required.', 'toast.configSaveFail': 'Config save failed: ',
    'toast.configReverted': 'Config reverted to original.', 'toast.noConfig': 'No config file. Install Vector first in Management tab.',
    'toast.configNoFile': 'No config file. Install Vector first in Management tab.',
    'toast.vectorStarted': 'Vector started.', 'toast.startFail': 'Start failed: ',
    'toast.vectorStopped': 'Vector stopped.', 'toast.stopFail': 'Stop failed: ',
    'toast.vectorRestarted': 'Vector restarted.', 'toast.restartFail': 'Restart failed: ',
    'toast.connOk': 'Connection OK: ', 'toast.connFail': 'Connection failed: ', 'toast.connTestFail': 'Connection test failed: ',
    'toast.downloading': 'Downloading Vector...', 'toast.installFail': 'Install failed: ',
    'toast.latestVer': 'Already up to date.', 'toast.verCheckFail': 'Version check failed: ',
    'toast.updating': 'Updating...', 'toast.updateFail': 'Update failed: ',
    'toast.svcRegistered': ' service registered.', 'toast.svcRegFail': 'Service register failed: ',
    'toast.svcUnregistered': ' service unregistered.', 'toast.svcUnregFail': 'Service unregister failed: ',
  },
  es: {
    'tab.status': 'Estado', 'tab.settings': 'Configuración', 'tab.management': 'Gestión',
    'status.runState': 'Estado de ejecución', 'status.checking': 'Verificando...', 'status.uptime': 'Tiempo activo',
    'status.version': 'Versión', 'status.transfer': 'Estado de transferencia', 'status.bufferUsage': 'Uso de búfer',
    'status.recentFiles': 'Archivos recientes', 'status.fileName': 'Nombre', 'status.directory': 'Directorio',
    'status.modifiedAt': 'Modificado', 'status.size': 'Tamaño', 'status.loadingFiles': 'Cargando archivos...',
    'status.running': 'Ejecutando', 'status.stopped': 'Detenido', 'status.noFiles': 'Sin archivos monitoreados',
    'settings.formMode': 'Modo formulario', 'settings.tomlMode': 'Editar TOML', 'settings.equipInfo': 'Info del equipo',
    'settings.equipId': 'ID del equipo', 'settings.equipType': 'Tipo de equipo',
    'settings.ipAddr': 'Dirección IP', 'settings.lineCode': 'Código de línea',
    'settings.logType': 'Tipo de log', 'settings.logPath': 'Ruta de log (include)',
    'settings.aggAddr': 'Dirección Aggregator', 'settings.aggPort': 'Puerto Aggregator',
    'settings.saveSetup': 'Guardar info del equipo', 'settings.tomlConfig': 'Config TOML',
    'settings.loadingConfig': 'Cargando configuración...', 'settings.revert': 'Revertir',
    'settings.restartNeeded': 'Se requiere reiniciar Vector después de guardar (pestaña Gestión)',
    'mgmt.processCtrl': 'Control de proceso', 'mgmt.start': 'Iniciar', 'mgmt.stop': 'Detener',
    'mgmt.restart': 'Reiniciar', 'mgmt.testConn': 'Probar conexión', 'mgmt.winService': 'Servicio Windows',
    'mgmt.register': 'Registrar', 'mgmt.unregister': 'Eliminar', 'mgmt.installUpdate': 'Instalar / Actualizar',
    'mgmt.installStatus': 'Estado de instalación', 'mgmt.binary': 'Binario', 'mgmt.configFile': 'Archivo config',
    'mgmt.installVector': 'Instalar Vector', 'mgmt.win7Notice': 'Edición Windows 7 (v0.38). Algunas funciones pueden no estar disponibles.', 'mgmt.vectorUpdate': 'Actualizar Vector',
    'mgmt.checkVersion': 'Verificar versión', 'mgmt.localVer': 'Versión local', 'mgmt.serverVer': 'Versión servidor',
    'mgmt.execUpdate': 'Ejecutar actualización', 'mgmt.installed': 'Instalado', 'mgmt.notInstalled': 'No instalado', 'mgmt.needsConfig': 'Archivo TOML necesario',
    'common.save': 'Guardar', 'common.none': 'Ninguno',
    'footer': 'Vector Agent Manager &middot; Gestión de PC de equipos',
    'toast.setupLoadFail': 'Error al cargar info: ', 'toast.setupSaved': 'Info guardada. Reinicie Vector.',
    'toast.setupSaveFail': 'Error al guardar: ', 'toast.configLoadFail': 'Error al cargar config: ',
    'toast.configSaved': 'Config guardada. Reinicie Vector.', 'toast.configSaveFail': 'Error al guardar config: ',
    'toast.configReverted': 'Config revertida.', 'toast.noConfig': 'Sin archivo config. Instale Vector primero.',
    'toast.configNoFile': 'Sin archivo config. Instale Vector primero.',
    'toast.vectorStarted': 'Vector iniciado.', 'toast.startFail': 'Error al iniciar: ',
    'toast.vectorStopped': 'Vector detenido.', 'toast.stopFail': 'Error al detener: ',
    'toast.vectorRestarted': 'Vector reiniciado.', 'toast.restartFail': 'Error al reiniciar: ',
    'toast.connOk': 'Conexión exitosa: ', 'toast.connFail': 'Conexión fallida: ', 'toast.connTestFail': 'Error en prueba: ',
    'toast.downloading': 'Descargando Vector...', 'toast.installFail': 'Error de instalación: ',
    'toast.latestVer': 'Ya está actualizado.', 'toast.verCheckFail': 'Error al verificar versión: ',
    'toast.updating': 'Actualizando...', 'toast.updateFail': 'Error al actualizar: ',
    'toast.svcRegistered': ' servicio registrado.', 'toast.svcRegFail': 'Error al registrar servicio: ',
    'toast.svcUnregistered': ' servicio eliminado.', 'toast.svcUnregFail': 'Error al eliminar servicio: ',
  },
  vi: {
    'tab.status': 'Trạng thái', 'tab.settings': 'Cài đặt', 'tab.management': 'Quản lý',
    'status.runState': 'Trạng thái chạy', 'status.checking': 'Đang kiểm tra...', 'status.uptime': 'Thời gian hoạt động',
    'status.version': 'Phiên bản', 'status.transfer': 'Trạng thái truyền', 'status.bufferUsage': 'Sử dụng bộ đệm',
    'status.recentFiles': 'File theo dõi gần đây', 'status.fileName': 'Tên file', 'status.directory': 'Thư mục',
    'status.modifiedAt': 'Sửa đổi', 'status.size': 'Kích thước', 'status.loadingFiles': 'Đang tải thông tin file...',
    'status.running': 'Đang chạy', 'status.stopped': 'Đã dừng', 'status.noFiles': 'Không có file theo dõi',
    'settings.formMode': 'Chế độ biểu mẫu', 'settings.tomlMode': 'Sửa TOML', 'settings.equipInfo': 'Thông tin thiết bị',
    'settings.equipId': 'ID thiết bị', 'settings.equipType': 'Loại thiết bị',
    'settings.ipAddr': 'Địa chỉ IP', 'settings.lineCode': 'Mã dây chuyền',
    'settings.logType': 'Loại log', 'settings.logPath': 'Đường dẫn log (include)',
    'settings.aggAddr': 'Địa chỉ Aggregator', 'settings.aggPort': 'Cổng Aggregator',
    'settings.saveSetup': 'Lưu thông tin thiết bị', 'settings.tomlConfig': 'Cấu hình TOML',
    'settings.loadingConfig': 'Đang tải cấu hình...', 'settings.revert': 'Hoàn tác',
    'settings.restartNeeded': 'Cần khởi động lại Vector sau khi lưu (tab Quản lý)',
    'mgmt.processCtrl': 'Điều khiển tiến trình', 'mgmt.start': 'Bắt đầu', 'mgmt.stop': 'Dừng',
    'mgmt.restart': 'Khởi động lại', 'mgmt.testConn': 'Kiểm tra kết nối', 'mgmt.winService': 'Dịch vụ Windows',
    'mgmt.register': 'Đăng ký', 'mgmt.unregister': 'Hủy đăng ký', 'mgmt.installUpdate': 'Cài đặt / Cập nhật',
    'mgmt.installStatus': 'Trạng thái cài đặt Vector', 'mgmt.binary': 'File chạy', 'mgmt.configFile': 'File cấu hình',
    'mgmt.installVector': 'Cài đặt Vector', 'mgmt.win7Notice': 'Phiên bản Windows 7 (v0.38). Một số tính năng mới có thể không khả dụng.', 'mgmt.vectorUpdate': 'Cập nhật Vector',
    'mgmt.checkVersion': 'Kiểm tra phiên bản', 'mgmt.localVer': 'Phiên bản local', 'mgmt.serverVer': 'Phiên bản server',
    'mgmt.execUpdate': 'Thực hiện cập nhật', 'mgmt.installed': 'Đã cài đặt', 'mgmt.notInstalled': 'Chưa cài đặt', 'mgmt.needsConfig': 'Cần file TOML cấu hình',
    'common.save': 'Lưu', 'common.none': 'Không có',
    'footer': 'Vector Agent Manager &middot; Quản lý PC thiết bị',
    'toast.setupLoadFail': 'Lỗi tải thông tin: ', 'toast.setupSaved': 'Đã lưu. Cần khởi động lại Vector.',
    'toast.setupSaveFail': 'Lỗi lưu: ', 'toast.configLoadFail': 'Lỗi tải cấu hình: ',
    'toast.configSaved': 'Đã lưu cấu hình. Cần khởi động lại Vector.', 'toast.configSaveFail': 'Lỗi lưu cấu hình: ',
    'toast.configReverted': 'Đã hoàn tác cấu hình.', 'toast.noConfig': 'Không có file cấu hình. Hãy cài Vector trước.',
    'toast.configNoFile': 'Không có file cấu hình. Hãy cài Vector trước.',
    'toast.vectorStarted': 'Đã khởi động Vector.', 'toast.startFail': 'Lỗi khởi động: ',
    'toast.vectorStopped': 'Đã dừng Vector.', 'toast.stopFail': 'Lỗi dừng: ',
    'toast.vectorRestarted': 'Đã khởi động lại Vector.', 'toast.restartFail': 'Lỗi khởi động lại: ',
    'toast.connOk': 'Kết nối thành công: ', 'toast.connFail': 'Kết nối thất bại: ', 'toast.connTestFail': 'Lỗi kiểm tra: ',
    'toast.downloading': 'Đang tải Vector...', 'toast.installFail': 'Lỗi cài đặt: ',
    'toast.latestVer': 'Đã là phiên bản mới nhất.', 'toast.verCheckFail': 'Lỗi kiểm tra phiên bản: ',
    'toast.updating': 'Đang cập nhật...', 'toast.updateFail': 'Lỗi cập nhật: ',
    'toast.svcRegistered': ' dịch vụ đã đăng ký.', 'toast.svcRegFail': 'Lỗi đăng ký dịch vụ: ',
    'toast.svcUnregistered': ' dịch vụ đã hủy.', 'toast.svcUnregFail': 'Lỗi hủy dịch vụ: ',
  },
};

let currentLang = 'ko';

/** 번역 키로 텍스트 가져오기 */
function t(key) { return I18N[currentLang]?.[key] ?? I18N.ko[key] ?? key; }

/** 모든 data-i18n 요소에 번역 적용 */
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key === 'footer') { el.innerHTML = t(key); }
    else { el.textContent = t(key); }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
}

/** 언어 전환 초기화 */
function initLang() {
  currentLang = localStorage.getItem('agent-manager-lang') || 'ko';
  const sel = document.getElementById('sel-lang');
  sel.value = currentLang;
  sel.addEventListener('change', () => {
    currentLang = sel.value;
    localStorage.setItem('agent-manager-lang', currentLang);
    applyLang();
    updateStatusCards();
  });
  applyLang();
}

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
      showToast(t('toast.noConfig'), 'warning');
    } else {
      showToast(t('toast.setupLoadFail') + err.message, 'error');
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
    include_paths: document.getElementById('inp-include').value,
    sink_address: document.getElementById('inp-sink-addr').value,
    sink_port: document.getElementById('inp-sink-port').value,
  };
  try {
    await fetchJSON('/api/setup', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    showToast(t('toast.setupSaved'), 'success');
  } catch (err) {
    showToast(t('toast.setupSaveFail') + err.message, 'error');
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
      document.getElementById('txt-config-path').textContent = '';
      showToast(t('toast.configNoFile'), 'warning');
    } else {
      showToast(t('toast.configLoadFail') + err.message, 'error');
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
    showToast(t('toast.configSaved'), 'success');
  } catch (err) {
    showToast(t('toast.configSaveFail') + err.message, 'error');
  }
}

/* ═══════════════════════════════════════════
   관리 탭 API — 프로세스 제어
   ═══════════════════════════════════════════ */

async function startVector() {
  state.isLoading.start = true; updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/start', { method: 'POST' });
    showToast(data.error || t('toast.vectorStarted'), data.error ? 'warning' : 'success');
    await poll();
  } catch (err) { showToast(t('toast.startFail') + err.message, 'error'); }
  finally { state.isLoading.start = false; updateActionButtons(); }
}

async function stopVector() {
  state.isLoading.stop = true; updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/stop', { method: 'POST' });
    showToast(data.error || t('toast.vectorStopped'), data.error ? 'warning' : 'success');
    await poll();
  } catch (err) { showToast(t('toast.stopFail') + err.message, 'error'); }
  finally { state.isLoading.stop = false; updateActionButtons(); }
}

async function restartVector() {
  state.isLoading.restart = true; updateActionButtons();
  try {
    await fetchJSON('/api/vector/restart', { method: 'POST' });
    showToast(t('toast.vectorRestarted'), 'success');
    await poll();
  } catch (err) { showToast(t('toast.restartFail') + err.message, 'error'); }
  finally { state.isLoading.restart = false; updateActionButtons(); }
}

async function testConnection() {
  state.isLoading.testConn = true; updateActionButtons();
  try {
    const data = await fetchJSON('/api/vector/test-connection', { method: 'POST' });
    showToast(data.connected ? t('toast.connOk') + `${data.host}:${data.port}` : t('toast.connFail') + `${data.host}:${data.port}`, data.connected ? 'success' : 'error');
  } catch (err) { showToast(t('toast.connTestFail') + err.message, 'error'); }
  finally { state.isLoading.testConn = false; updateActionButtons(); }
}

/* ═══════════════════════════════════════════
   관리 탭 API — 설치 / 업데이트
   ═══════════════════════════════════════════ */

async function checkInstall() {
  try {
    const data = await fetchJSON('/api/install/status');
    const el = document.getElementById('txt-install-status');

    if (data.installed) {
      el.textContent = t('mgmt.installed');
      el.className = 'text-xs font-mono px-2 py-0.5 rounded bg-success/20 text-success';
    } else if (data.binaryExists && !data.configExists) {
      el.textContent = t('mgmt.needsConfig');
      el.className = 'text-xs font-mono px-2 py-0.5 rounded bg-warning/20 text-warning';
    } else {
      el.textContent = t('mgmt.notInstalled');
      el.className = 'text-xs font-mono px-2 py-0.5 rounded bg-error/20 text-error';
    }

    document.getElementById('txt-bin-path').textContent = `${data.binaryPath} (${data.binaryExists ? 'O' : 'X'})`;
    document.getElementById('txt-cfg-path').textContent = `${data.configPath} (${data.configExists ? 'O' : 'X'})`;
    document.getElementById('btn-install').disabled = data.binaryExists;
    if (data.masterServer) {
      document.getElementById('inp-master-server').value = data.masterServer;
    }
  } catch { /* 무시 */ }
}

/** 수집 서버 주소 저장 */
async function saveMasterServer() {
  const url = document.getElementById('inp-master-server').value.trim();
  if (!url) { showToast('서버 주소를 입력하세요', 'error'); return; }
  try {
    const data = await fetchJSON('/api/server-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterServer: url }),
    });
    showToast('서버 주소가 변경되었습니다: ' + data.masterServer, 'success');
  } catch (err) {
    showToast('서버 주소 변경 실패: ' + err.message, 'error');
  }
}

/** 선택된 Vector edition 반환 ('default' | 'win7') */
function getSelectedEdition() {
  const radio = document.querySelector('input[name="vector-edition"]:checked');
  return radio ? radio.value : 'default';
}

async function installVector() {
  document.getElementById('btn-install').disabled = true;
  showToast(t('toast.downloading'), 'info');
  const edition = getSelectedEdition();
  const editionParam = edition === 'win7' ? '?edition=win7' : '';
  try {
    const data = await fetchJSON(`/api/install${editionParam}`, { method: 'POST' });
    showToast(data.message || '설치 완료', 'success');
    checkInstall();
  } catch (err) {
    showToast(t('toast.installFail') + err.message, 'error');
    document.getElementById('btn-install').disabled = false;
  }
}

async function checkUpdate() {
  const edition = getSelectedEdition();
  const editionParam = edition === 'win7' ? '?edition=win7' : '';
  try {
    const data = await fetchJSON(`/api/update/check${editionParam}`);
    document.getElementById('txt-local-ver').textContent = data.localVersion || t('mgmt.notInstalled');
    document.getElementById('txt-server-ver').textContent = data.serverVersion || '-';
    const btnUpdate = document.getElementById('btn-update');
    if (data.updateAvailable) {
      btnUpdate.classList.remove('hidden');
    } else {
      btnUpdate.classList.add('hidden');
      if (data.localVersion && data.serverVersion) showToast(t('toast.latestVer'), 'info');
    }
  } catch (err) { showToast(t('toast.verCheckFail') + err.message, 'error'); }
}

async function executeUpdate() {
  document.getElementById('btn-update').disabled = true;
  showToast(t('toast.updating'), 'info');
  const edition = getSelectedEdition();
  const editionParam = edition === 'win7' ? '?edition=win7' : '';
  try {
    const data = await fetchJSON(`/api/update/execute${editionParam}`, { method: 'POST' });
    showToast(data.message || '업데이트 완료', 'success');
    document.getElementById('btn-update').classList.add('hidden');
    checkUpdate();
  } catch (err) {
    showToast(t('toast.updateFail') + err.message, 'error');
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
    showToast(result?.success ? target + t('toast.svcRegistered') : (result?.error || t('toast.svcRegFail')), result?.success ? 'success' : 'error');
    loadServiceStatus();
  } catch (err) { showToast(t('toast.svcRegFail') + err.message, 'error'); }
}

async function uninstallService(target) {
  try {
    const data = await fetchJSON('/api/service/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const result = data[target];
    showToast(result?.success ? target + t('toast.svcUnregistered') : (result?.error || t('toast.svcUnregFail')), result?.success ? 'success' : 'error');
    loadServiceStatus();
  } catch (err) { showToast(t('toast.svcUnregFail') + err.message, 'error'); }
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
    txt.textContent = t('status.running');
    icon.textContent = 'check_circle';
    icon.classList.remove('text-error'); icon.classList.add('text-success');
  } else {
    dot.className = 'inline-block w-3 h-3 rounded-full bg-error';
    txt.textContent = t('status.stopped');
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
    : `<span class="text-muted-fg italic">${esc(t('common.none'))}</span>`;
  document.getElementById('list-sinks').innerHTML = sinks.length
    ? sinks.map(s => `<div class="px-2 py-0.5 rounded bg-muted text-xs">${esc(s)}</div>`).join('')
    : `<span class="text-muted-fg italic">${esc(t('common.none'))}</span>`;
}

function updateRecentFiles(watchPaths) {
  const pathEl = document.getElementById('watch-paths');
  pathEl.textContent = watchPaths.length ? '감시 경로: ' + watchPaths.join(', ') : '';
  const tbody = document.getElementById('tbody-files');
  if (!state.files.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-muted-fg italic">${esc(t('status.noFiles'))}</td></tr>`;
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
    showToast(t('toast.configReverted'), 'info');
  });

  /* 프로세스 제어 */
  document.getElementById('btn-start').addEventListener('click', startVector);
  document.getElementById('btn-stop').addEventListener('click', stopVector);
  document.getElementById('btn-restart').addEventListener('click', restartVector);
  document.getElementById('btn-test-conn').addEventListener('click', testConnection);

  /* 설치 — edition 라디오 토글 */
  document.querySelectorAll('input[name="vector-edition"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const notice = document.getElementById('win7-notice');
      if (notice) notice.classList.toggle('hidden', radio.value !== 'win7');
    });
  });
  document.getElementById('btn-install').addEventListener('click', installVector);

  /* 업데이트 */
  document.getElementById('btn-update').addEventListener('click', executeUpdate);
}

/* ═══════════════════════════════════════════
   앱 초기화
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   TOML 목록 (서버에서 가져오기)
   ═══════════════════════════════════════════ */

async function loadTomlList() {
  const area = document.getElementById('toml-list-area');
  if (!area) return;
  try {
    const data = await fetchJSON('/api/toml-list');
    if (!data.names || data.names.length === 0) {
      area.innerHTML = '<span style="font-size:13px;color:var(--fg3)">등록된 설비 설정이 없습니다</span>';
      return;
    }
    area.innerHTML = data.names.map(function(name) {
      return '<button onclick="downloadToml(\'' + name + '\')" style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:4px;font-size:13px;font-weight:600;border:1px solid var(--border2);background:var(--card2);color:var(--fg);cursor:pointer;font-family:inherit;transition:all 0.15s"'
        + ' onmouseover="this.style.borderColor=\'var(--cyan)\'" onmouseout="this.style.borderColor=\'var(--border2)\'">'
        + '<span class="material-symbols-outlined" style="font-size:16px;color:var(--cyan)">description</span>'
        + name + '</button>';
    }).join('');
  } catch {
    area.innerHTML = '<span style="font-size:13px;color:var(--red)">서버 연결 실패</span>';
  }
}

async function downloadToml(name) {
  showToast(name + '.toml 다운로드 중...', 'info');
  try {
    const data = await fetchJSON('/api/toml-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name }),
    });
    showToast(data.message || name + '.toml 저장 완료', 'success');
    /* 설정 새로고침 */
    setTimeout(function() { loadSetup(); loadConfig(); }, 500);
  } catch (err) {
    showToast('TOML 다운로드 실패: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initLang();
  initDarkMode();
  bindEvents();
  await Promise.all([poll(), loadRecentLogs(), loadTomlList(), loadSetup(), loadConfig(), checkInstall(), loadServiceStatus()]);
  pollTimer = setInterval(poll, POLL_INTERVAL);
  setInterval(loadRecentLogs, 30000);
});
