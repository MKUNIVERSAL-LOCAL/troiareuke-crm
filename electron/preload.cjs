// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
// preload.cjs — 보안 컨텍스트 브리지
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  // 어드민 전용 빌드 여부 — 렌더러가 프로그램(빌드) 단위로 화면을 분리할 수 있게 전달
  // (⚠️ sandbox된 preload에서는 require('../package.json')이 불가 — 메인 프로세스에 동기 질의)
  isAdminBuild: (() => { try { return ipcRenderer.sendSync('get-admin-build-flag') === true; } catch { return false; } })(),
  // 포터블 단일 exe로 실행 중인지 — 이 경우에만 자기교체(자동 업데이트 적용)가 가능하다.
  // 풀린 폴더 형태 실행본에서 업데이트 배너를 띄우면 재시작해도 적용이 안 되는 함정 방지.
  isPortable: (() => { try { return Boolean(process.env.PORTABLE_EXECUTABLE_FILE); } catch { return false; } })(),

  // ── 앱 버전 조회 ──
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ── 업데이트 이벤트 수신 ──
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (_event, err) => callback(err));
  },

  // ── 업데이트 설치 (앱 재시작) ──
  downloadUpdate: () => ipcRenderer.invoke('download-portable-update'),
  installUpdate: () => ipcRenderer.send('install-update'),

  // ── Claude API 호출 (CORS 우회) ──
  callClaudeApi: (params) => ipcRenderer.invoke('call-claude-api', params),

  // ── Google OAuth ──
  startGoogleOAuth: (params) => ipcRenderer.invoke('start-google-oauth', params),
  onGoogleOAuthToken: (callback) => {
    ipcRenderer.on('google-oauth-token', (_event, hash) => callback(hash));
  },

  // ── BW-C6: 백업 ──
  backup: {
    exportNow: (localStorageData) => ipcRenderer.invoke('backup-export', localStorageData),
    openFolder: () => ipcRenderer.invoke('backup-open-folder'),
    onTrigger: (callback) => {
      ipcRenderer.on('trigger-backup', () => callback());
    },
  },

  // ── 리스너 정리 (메모리 누수 방지) ──
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.removeAllListeners('update-error');
    ipcRenderer.removeAllListeners('google-oauth-token');
    ipcRenderer.removeAllListeners('trigger-backup');
  },
});
