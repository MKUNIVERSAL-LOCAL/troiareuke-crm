const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// 개발 모드 판별 (NODE_ENV 또는 electron-is-dev 없이 간단하게 처리)
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: '트로이아르케 CRM',
    // icon 설정: public/icon.ico 파일이 있으면 아래 줄 주석 해제
    // icon: path.join(__dirname, '../public/icon.ico'),
    autoHideMenuBar: true, // 상단 메뉴바 숨김 (Alt 키로 토글)
    show: false,           // 흰 화면 방지: 렌더링 완료 후 표시
    backgroundColor: '#f9fafb',
  });

  // 렌더링 완료 후 창 표시 (흰 화면 방지)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (isDev) {
    // 개발 모드: Vite 개발 서버에 연결
    mainWindow.loadURL('http://localhost:5173');
    // 개발 시 DevTools 자동 열기 (필요 없으면 아래 줄 주석 처리)
    // mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션 모드: 빌드된 파일 로드
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 앱 내 링크 중 외부 http(s) URL은 기본 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── 앱 이벤트 ──────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // macOS: Dock 아이콘 클릭 시 창 다시 열기
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 모든 창 닫히면 앱 종료 (macOS 제외)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
