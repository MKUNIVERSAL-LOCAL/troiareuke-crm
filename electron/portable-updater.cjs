const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const MANIFEST_URL = 'https://crm-update.mkcorp.familyds.com/portable/latest.json';
const ALLOWED_DOWNLOAD_HOST = 'crm-update.mkcorp.familyds.com';

function createPortableUpdater({ app, getMainWindow }) {
  let availableUpdate = null;
  let downloadedUpdate = null;
  let downloadPromise = null;

  function send(channel, payload) {
    getMainWindow()?.webContents.send(channel, payload);
  }

  function log(message, details) {
    try {
      const suffix = details ? ` ${JSON.stringify(details)}` : '';
      fs.appendFileSync(
        path.join(app.getPath('userData'), 'updater.log'),
        `[${new Date().toISOString()}] ${message}${suffix}\n`,
        'utf8',
      );
    } catch {
      // 로그 기록 실패가 앱 실행을 막으면 안 된다.
    }
  }

  function isNewerVersion(remoteVersion, currentVersion) {
    const parse = (value) => String(value).split('-')[0].split('.').map(part => Number(part) || 0);
    const remote = parse(remoteVersion);
    const current = parse(currentVersion);
    const length = Math.max(remote.length, current.length);
    for (let index = 0; index < length; index += 1) {
      if ((remote[index] || 0) > (current[index] || 0)) return true;
      if ((remote[index] || 0) < (current[index] || 0)) return false;
    }
    return false;
  }

  function requestJson(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('업데이트 주소가 너무 많이 변경되었습니다.'));
        return;
      }

      const request = https.get(url, {
        headers: {
          'User-Agent': `Troiareuke-CRM/${app.getVersion()}`,
          'Cache-Control': 'no-cache',
        },
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(requestJson(new URL(response.headers.location, url).toString(), redirectCount + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`업데이트 서버 응답 오류 (${response.statusCode})`));
          return;
        }

        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 1024 * 1024) {
            request.destroy(new Error('업데이트 정보가 너무 큽니다.'));
          }
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('업데이트 정보를 읽을 수 없습니다.'));
          }
        });
      });

      request.setTimeout(10000, () => request.destroy(new Error('업데이트 서버 응답 시간이 초과되었습니다.')));
      request.on('error', reject);
    });
  }

  function downloadFile(url, destination, expectedSha256, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('다운로드 주소가 너무 많이 변경되었습니다.'));
        return;
      }

      const request = https.get(url, {
        headers: { 'User-Agent': `Troiareuke-CRM/${app.getVersion()}` },
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, expectedSha256, redirectCount + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`업데이트 다운로드 오류 (${response.statusCode})`));
          return;
        }

        const total = Number(response.headers['content-length'] || 0);
        let received = 0;
        let lastPercent = -1;
        let settled = false;
        const hash = crypto.createHash('sha256');
        const output = fs.createWriteStream(destination);

        const fail = (error) => {
          if (settled) return;
          settled = true;
          output.destroy();
          fs.promises.unlink(destination).catch(() => {});
          reject(error);
        };

        output.on('error', fail);
        response.on('error', fail);
        response.on('data', (chunk) => {
          received += chunk.length;
          hash.update(chunk);
          output.write(chunk);
          const percent = total > 0 ? Math.round((received / total) * 100) : 0;
          if (percent !== lastPercent) {
            lastPercent = percent;
            send('update-download-progress', { percent, bytesPerSecond: 0 });
          }
        });
        response.on('end', () => output.end());
        output.on('finish', () => {
          if (settled) return;
          const actualSha256 = hash.digest('hex').toLowerCase();
          if (actualSha256 !== expectedSha256.toLowerCase()) {
            fail(new Error('업데이트 파일 검증에 실패했습니다.'));
            return;
          }
          settled = true;
          send('update-download-progress', { percent: 100, bytesPerSecond: 0 });
          resolve({ received, sha256: actualSha256 });
        });
      });

      request.setTimeout(30000, () => request.destroy(new Error('업데이트 다운로드가 중단되었습니다.')));
      request.on('error', reject);
    });
  }

  async function check(trigger = 'startup') {
    log('checking-for-update', { trigger, currentVersion: app.getVersion(), manifestUrl: MANIFEST_URL });
    try {
      const manifest = await requestJson(`${MANIFEST_URL}?t=${Date.now()}`);
      const downloadUrl = new URL(manifest.url, MANIFEST_URL);
      if (downloadUrl.protocol !== 'https:' || downloadUrl.hostname !== ALLOWED_DOWNLOAD_HOST) {
        throw new Error('허용되지 않은 업데이트 다운로드 주소입니다.');
      }
      if (!manifest.version || !/^[a-f0-9]{64}$/i.test(manifest.sha256 || '')) {
        throw new Error('업데이트 정보 형식이 올바르지 않습니다.');
      }

      if (!isNewerVersion(manifest.version, app.getVersion())) {
        availableUpdate = null;
        log('update-not-available', { remoteVersion: manifest.version });
        return null;
      }

      availableUpdate = { ...manifest, url: downloadUrl.toString() };
      log('update-available', { version: manifest.version });
      send('update-available', { version: manifest.version, releaseDate: manifest.releaseDate });
      return availableUpdate;
    } catch (error) {
      log('update-check-failed', { message: error.message });
      send('update-error', { message: error.message });
      return null;
    }
  }

  async function download() {
    if (downloadPromise) return downloadPromise;
    downloadPromise = (async () => {
      const update = availableUpdate || await check('manual');
      if (!update) throw new Error('설치할 업데이트가 없습니다.');

      const updateDir = path.join(app.getPath('userData'), 'updates');
      await fs.promises.mkdir(updateDir, { recursive: true });
      const destination = path.join(updateDir, `troiareuke-crm-${update.version}.new.exe`);
      await fs.promises.unlink(destination).catch(() => {});
      await downloadFile(update.url, destination, update.sha256);
      downloadedUpdate = { ...update, filePath: destination };
      log('update-downloaded', { version: update.version, filePath: destination });
      send('update-downloaded', { version: update.version });
      return { version: update.version };
    })();

    try {
      return await downloadPromise;
    } catch (error) {
      log('update-download-failed', { message: error.message });
      send('update-error', { message: error.message });
      throw error;
    } finally {
      downloadPromise = null;
    }
  }

  async function apply() {
    if (!downloadedUpdate?.filePath) throw new Error('다운로드된 업데이트가 없습니다.');
    const targetExecutable = process.env.PORTABLE_EXECUTABLE_FILE;
    if (!targetExecutable) {
      throw new Error('지정 폴더의 단일 실행파일에서 실행해야 업데이트를 적용할 수 있습니다.');
    }

    const helperPath = path.join(app.getPath('temp'), `troiareuke-updater-${Date.now()}.ps1`);
    const helperScript = [
      'param([int]$AppProcessId, [string]$Source, [string]$Target, [string]$SelfPath)',
      'Wait-Process -Id $AppProcessId -ErrorAction SilentlyContinue',
      '$updated = $false',
      'for ($attempt = 0; $attempt -lt 30; $attempt++) {',
      '  try { Copy-Item -LiteralPath $Source -Destination $Target -Force; $updated = $true; break } catch { Start-Sleep -Seconds 1 }',
      '}',
      'if ($updated) { Start-Process -FilePath $Target }',
      'Start-Sleep -Seconds 1',
      'Remove-Item -LiteralPath $SelfPath -Force -ErrorAction SilentlyContinue',
    ].join('\n');
    await fs.promises.writeFile(helperPath, helperScript, 'utf8');

    log('applying-update', { version: downloadedUpdate.version, targetExecutable });
    const helper = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', helperPath,
      '-AppProcessId', String(process.pid),
      '-Source', downloadedUpdate.filePath,
      '-Target', targetExecutable,
      '-SelfPath', helperPath,
    ], { detached: true, stdio: 'ignore', windowsHide: true });
    helper.unref();
    setTimeout(() => app.quit(), 300);
  }

  function setup() {
    log('portable-updater-started', {
      currentVersion: app.getVersion(),
      portableExecutable: process.env.PORTABLE_EXECUTABLE_FILE || null,
    });
    setTimeout(() => check('startup'), 5000);
    setInterval(() => check('interval'), 10 * 60 * 1000);
  }

  return { setup, check, download, apply };
}

module.exports = { createPortableUpdater };
