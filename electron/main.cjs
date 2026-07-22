// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const { createPortableUpdater } = require('./portable-updater.cjs');

// 개발 모드 판별: 패키징된 앱이면 false, 소스 실행이면 true
const isDev = !app.isPackaged;

// 어드민 전용 빌드 여부 — electron-builder.admin.cjs 의 extraMetadata.adminBuild 로 주입.
// 일반 빌드/개발 모드에서는 undefined → false (기존 동작 불변).
const isAdminBuild = require('../package.json').adminBuild === true;

let mainWindow;
let portableUpdater;

// ─── autoUpdater 설정 ─────────────────────────────────────────────
autoUpdater.autoDownload = true;       // 업데이트 발견 시 자동 다운로드
autoUpdater.autoInstallOnAppQuit = true; // 앱 종료 시 자동 설치

function setupAutoUpdater() {
  // 어드민 빌드는 업데이트 채널이 직원용 패키지라 자동업데이트를 쓰면 어드민 exe가 덮어써진다 — 비활성.
  if (isAdminBuild) return;
  portableUpdater = createPortableUpdater({ app, getMainWindow: () => mainWindow });
  portableUpdater.setup();
  return;
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
  portableUpdater?.apply().catch(error => {
    mainWindow?.webContents.send('update-error', { message: error.message });
  });
});

ipcMain.handle('download-portable-update', () => portableUpdater?.download());

// ── IPC 핸들러: 현재 앱 버전 조회 ──
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ── IPC 핸들러: 어드민 빌드 여부 (preload가 동기 질의 — sandbox에서 package.json 접근 불가) ──
ipcMain.on('get-admin-build-flag', (event) => {
  event.returnValue = isAdminBuild;
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

// ─── BW-M3: 애플리케이션 메뉴 제거 ──────────────────────────────
Menu.setApplicationMenu(null);

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
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: isAdminBuild ? '트로이아르케 CRM 어드민' : '트로이아르케 CRM',
    // icon: path.join(__dirname, '../public/icon.ico'),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f9fafb',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // 어드민 빌드: 렌더러 document.title이 창 제목을 덮지 않게 고정 (직원용 창과 구분)
  if (isAdminBuild) {
    mainWindow.on('page-title-updated', (event) => event.preventDefault());
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else if (isAdminBuild) {
    // 어드민 빌드는 관리자 로그인 화면에서 시작 (로그인 후 가드가 /admin/dashboard 로 보냄)
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/admin/login' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // ─── BW-H2: will-navigate 화이트리스트 (최소 허용 원칙) ─────
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let allowed = false;
    if (isDev) {
      // 개발: Vite dev 서버 정확 origin만 허용
      allowed = url.startsWith('http://localhost:5173/');
    } else {
      // 프로덕션: file:// 및 Google OAuth 콜백 로컬 서버만 허용
      allowed =
        url.startsWith('file://') ||
        url.startsWith('http://127.0.0.1:19876/google-callback');
    }
    if (!allowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ─── BW-H2: new-window 외부 브라우저로 위임 ─────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // ─── BW-M3: prod 환경에서 DevTools 차단 ─────────────────────
  mainWindow.webContents.on('devtools-opened', () => {
    if (!isDev) {
      mainWindow.webContents.closeDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── BW-C6: 자동 백업 ──────────────────────────────────────────
const BACKUP_DIR_NAME = 'backups';
const BACKUP_RETENTION_DAYS = 7;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6시간

function getBackupDir() {
  return path.join(app.getPath('userData'), BACKUP_DIR_NAME);
}

function formatDateForFilename(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    '-' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

async function pruneOldBackups(backupDir) {
  try {
    const files = await fs.promises.readdir(backupDir);
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (!file.startsWith('troiareuke-') || !file.endsWith('.json')) continue;
      const filePath = path.join(backupDir, file);
      const stat = await fs.promises.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.promises.unlink(filePath);
      }
    }
  } catch {
    // 백업 정리 실패는 무시
  }
}

async function runBackup(localStorageData) {
  try {
    const backupDir = getBackupDir();
    await fs.promises.mkdir(backupDir, { recursive: true });
    await pruneOldBackups(backupDir);

    const filename = `troiareuke-${formatDateForFilename(new Date())}.json`;
    const filePath = path.join(backupDir, filename);

    const payload = {
      exportedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      source: 'auto-backup',
      localStorage: localStorageData || {},
    };

    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// IPC: 렌더러에서 localStorage 데이터 수신 후 백업 실행
ipcMain.handle('backup-export', async (_event, localStorageData) => {
  return runBackup(localStorageData);
});

// IPC: 백업 폴더 열기
ipcMain.handle('backup-open-folder', async () => {
  const backupDir = getBackupDir();
  await fs.promises.mkdir(backupDir, { recursive: true });
  shell.openPath(backupDir);
  return { success: true };
});

// ─── 앱 이벤트 ──────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  // 앱 시작 후 10초 뒤 첫 백업 (렌더러가 뜰 시간 확보)
  setTimeout(() => {
    mainWindow?.webContents.send('trigger-backup');
  }, 10000);

  // 6시간마다 정기 백업
  setInterval(() => {
    mainWindow?.webContents.send('trigger-backup');
  }, BACKUP_INTERVAL_MS);

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
