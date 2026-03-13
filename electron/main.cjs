const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// 개발 모드 판별: 패키징된 앱이면 false, 소스 실행이면 true
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
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: '트로이아르케 CRM',
    // 커스텀 아이콘 설정 (public/icon.ico 파일 추가 후 주석 해제)
    // icon: path.join(__dirname, '../public/icon.ico'),
    autoHideMenuBar: true, // 상단 메뉴바 숨김 (Alt 키로 토글)
    show: false,           // 흰 화면 방지: 렌더링 완료 후 표시
    backgroundColor: '#f9fafb',
  });

  // 렌더링 완료 후 창 표시
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (isDev) {
    // 개발 모드: Vite 개발 서버에 연결
    mainWindow.loadURL('http://localhost:5173');
    // 개발자 도구 열기 (필요 시 주석 해제)
    // mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션 모드: 빌드된 정적 파일 로드
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 앱 내 외부 링크는 시스템 기본 브라우저로 열기
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
