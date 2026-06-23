// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
// preload.cjs — 보안 컨텍스트 브리지
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,

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
