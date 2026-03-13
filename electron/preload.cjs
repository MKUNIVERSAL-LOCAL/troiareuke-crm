// preload.cjs — 보안 컨텍스트 브리지
// 순수 React + localStorage 앱이므로 Node.js API 별도 노출 불필요
// 파일 저장 등 기능 추가 시 여기에 contextBridge.exposeInMainWorld() 사용

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
});
