// preload.js — 보안을 위한 컨텍스트 브리지
// 현재 앱은 순수 React + localStorage로 동작하므로
// Node.js API를 별도로 노출하지 않아도 됩니다.
// 나중에 파일 저장 등 기능이 필요하면 여기에 추가하세요.

const { contextBridge } = require('electron');

// 예시: 앱 버전 정보 노출 (필요 시 사용)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
