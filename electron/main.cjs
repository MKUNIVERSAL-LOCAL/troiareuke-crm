const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// 개발 모드 판별: 패키징된 앱이면 false, 소스 실행이면 true
const isDev = !app.isPackaged;

let mainWindow;

// ─── autoUpdater 설정 ─────────────────────────────────────────────
autoUpdater.autoDownload = true;       // 업데이트 발견 시 자동 다운로드
autoUpdater.autoInstallOnAppQuit = true; // 앱 종료 시 자동 설치

function setupAutoUpdater() {
  if (isDev) return; // 개발 모드에서는 업데이트 비활성화

  // 업데이트 확인 시작 (앱 시작 5초 후)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('업데이트 확인 실패:', err.message);
    });
  }, 5000);

  // 주기적 업데이트 확인 (2시간마다)
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('업데이트 확인 실패:', err.message);
    });
  }, 2 * 60 * 60 * 1000);

  // ── 이벤트 핸들러 ──
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    // 조용히 처리 (배너 불필요)
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.log('업데이트 오류:', err.message);
    mainWindow?.webContents.send('update-error', { message: err.message });
  });
}

// ── IPC 핸들러: 렌더러에서 "지금 설치" 버튼 클릭 시 ──
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

// ── IPC 핸들러: 현재 앱 버전 조회 ──
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ─── 윈도우 생성 ─────────────────────────────────────────────────
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
    // icon: path.join(__dirname, '../public/icon.ico'),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f9fafb',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
