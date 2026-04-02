const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
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

  // 주기적 업데이트 확인 (10분마다)
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('업데이트 확인 실패:', err.message);
    });
  }, 10 * 60 * 1000);

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
  autoUpdater.quitAndInstall(true, true); // silent install + auto restart
});

// ── IPC 핸들러: 현재 앱 버전 조회 ──
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ── IPC 핸들러: Claude API 호출 (CORS 우회) ──
ipcMain.handle('call-claude-api', async (_event, { apiKey, messages, systemPrompt }) => {
  try {
    const https = require('https');
    const data = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: messages,
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            if (result.error) {
              reject(new Error(result.error.message));
            } else {
              resolve(result.content[0].text);
            }
          } catch (e) {
            reject(new Error('응답 파싱 실패'));
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  } catch (err) {
    throw new Error(err.message || 'Claude API 호출 실패');
  }
});

// ── IPC 핸들러: Google OAuth 로컬 콜백 서버 ──
let googleOAuthServer = null;

ipcMain.handle('start-google-oauth', async (_event, { authUrl }) => {
  return new Promise((resolve) => {
    // 이전 서버가 있으면 닫기
    if (googleOAuthServer) {
      try { googleOAuthServer.close(); } catch {}
    }

    googleOAuthServer = http.createServer((req, res) => {
      if (req.url.startsWith('/google-callback')) {
        // HTML 페이지: URL fragment(#access_token=...)를 서버에 다시 POST
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><title>트로이아르케 CRM - Google 연결</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f9ff;">
<div style="text-align:center;">
  <h2 style="color:#1a3a8f;">✅ Google 캘린더 연결 완료!</h2>
  <p style="color:#666;">이 창을 닫아도 됩니다.</p>
  <script>
    const hash = window.location.hash;
    if (hash) {
      fetch('http://127.0.0.1:19876/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: hash })
      });
    }
  </script>
</div></body></html>`);
      } else if (req.url === '/token' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          res.writeHead(200);
          res.end('ok');
          try {
            const { hash } = JSON.parse(body);
            // 토큰을 렌더러에 전달
            mainWindow?.webContents.send('google-oauth-token', hash);
            resolve({ success: true, hash });
          } catch {}
          // 서버 종료
          setTimeout(() => {
            try { googleOAuthServer.close(); } catch {}
            googleOAuthServer = null;
          }, 1000);
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    googleOAuthServer.listen(19876, '127.0.0.1', () => {
      // 시스템 브라우저에서 Google OAuth 열기
      shell.openExternal(authUrl);
    });

    // 60초 타임아웃
    setTimeout(() => {
      if (googleOAuthServer) {
        try { googleOAuthServer.close(); } catch {}
        googleOAuthServer = null;
        resolve({ success: false, error: 'timeout' });
      }
    }, 60000);
  });
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
