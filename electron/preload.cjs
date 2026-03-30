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

  // ── 리스너 정리 (메모리 누수 방지) ──
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.removeAllListeners('update-error');
  },
});
