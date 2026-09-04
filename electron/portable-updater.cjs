const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const MANIFEST_URL = 'https://crm-update.mkcorp.familyds.com/portable/latest.json';
const ALLOWED_DOWNLOAD_HOST = 'crm-update.mkcorp.familyds.com';

// 배포 불변 원칙(docs/DISTRIBUTION-POLICY.md): 매장은 설치 1회, 이후 모든 변경은 인앱 업데이트로만.
// 2026-09-04 강화 — 업데이트가 직원의 [지금 업데이트]·[지금 재시작] 클릭에 의존하면
// "나중에"를 누른 매장이 영원히 구버전으로 남고 결국 재다운로드 안내가 발생했다.
//  1) 새 버전 발견 → 사용자 조작 없이 백그라운드 자동 다운로드
//  2) 다운로드 완료 → 프로그램을 닫을 때(before-quit) 자동 적용 (재실행은 하지 않음)
//  3) [지금 재시작]은 선택 — 누르면 즉시 적용 + 재실행
//  4) 적용 헬퍼는 최대 2분 재시도 + 결과를 updater.log에 기록 (백신 스캔·파일 잠금 대비)
//  5) 이미 받아둔 파일은 해시가 맞으면 재다운로드하지 않음
const HELPER_MAX_ATTEMPTS = 120; // 1초 간격 → 최대 2분

/**
 * 포터블(단일 exe) 적용 헬퍼 — 앱 종료 대기 → exe 교체 → 해시 검증 → (선택) 재실행.
 * 테스트에서 단독 실행할 수 있게 순수 문자열로 분리.
 */
function buildPortableHelperScript() {
  return [
    'param([int]$AppProcessId, [string]$Source, [string]$Target, [string]$ExpectedSha256, [string]$LogPath, [int]$Relaunch, [int]$MaxAttempts, [string]$SelfPath)',
    'function Write-UpdLog([string]$Message) {',
    '  try { Add-Content -LiteralPath $LogPath -Value ("[" + (Get-Date).ToUniversalTime().ToString("o") + "] helper-portable " + $Message) -Encoding UTF8 } catch {}',
    '}',
    'Write-UpdLog ("start pid=" + $AppProcessId + " target=" + $Target)',
    'Wait-Process -Id $AppProcessId -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 500',
    '$updated = $false',
    '$lastError = ""',
    'for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {',
    '  try {',
    '    Copy-Item -LiteralPath $Source -Destination $Target -Force',
    '    $actual = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLower()',
    '    if ($actual -ne $ExpectedSha256.ToLower()) { throw "hash mismatch after copy: $actual" }',
    '    $updated = $true',
    '    break',
    '  } catch { $lastError = $_.Exception.Message; Start-Sleep -Seconds 1 }',
    '}',
    'if ($updated) {',
    '  Write-UpdLog ("applied after " + $attempt + " attempt(s)")',
    '  Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue',
    '} else {',
    '  Write-UpdLog ("FAILED after " + $MaxAttempts + " attempts: " + $lastError)',
    '}',
    'if ($Relaunch -eq 1) { Start-Process -FilePath $Target }',
    'Start-Sleep -Seconds 1',
    'Remove-Item -LiteralPath $SelfPath -Force -ErrorAction SilentlyContinue',
  ].join('\n');
}

/**
 * 폴더형(win-unpacked) 적용 헬퍼 — zip을 임시 폴더에 먼저 풀고(부분 덮어쓰기 방지) 설치 폴더에 복사.
 * 예전 방식(Expand-Archive로 설치 폴더 직접 덮어쓰기)은 중간 실패 시 반쯤 섞인 폴더가 남아
 * 프로그램이 깨지고 재설치가 필요해지는 경로였다.
 */
function buildFolderHelperScript() {
  return [
    'param([int]$AppProcessId, [string]$Zip, [string]$TargetDir, [string]$ExeName, [string]$LogPath, [int]$Relaunch, [int]$MaxAttempts, [string]$SelfPath)',
    'function Write-UpdLog([string]$Message) {',
    '  try { Add-Content -LiteralPath $LogPath -Value ("[" + (Get-Date).ToUniversalTime().ToString("o") + "] helper-folder " + $Message) -Encoding UTF8 } catch {}',
    '}',
    'Write-UpdLog ("start pid=" + $AppProcessId + " target=" + $TargetDir)',
    'Wait-Process -Id $AppProcessId -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 500',
    '$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("troiareuke-staging-" + [guid]::NewGuid().ToString("N"))',
    '$extracted = $false',
    '$lastError = ""',
    'for ($attempt = 1; $attempt -le 3; $attempt++) {',
    '  try {',
    '    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }',
    '    Expand-Archive -LiteralPath $Zip -DestinationPath $staging -Force',
    '    if (-not (Test-Path -LiteralPath (Join-Path $staging $ExeName))) { throw "zip does not contain $ExeName at root" }',
    '    $extracted = $true',
    '    break',
    '  } catch { $lastError = $_.Exception.Message; Start-Sleep -Seconds 1 }',
    '}',
    '$updated = $false',
    'if ($extracted) {',
    '  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {',
    '    try {',
    '      Copy-Item -Path (Join-Path $staging "*") -Destination $TargetDir -Recurse -Force',
    '      $updated = $true',
    '      break',
    '    } catch { $lastError = $_.Exception.Message; Start-Sleep -Seconds 1 }',
    '  }',
    '}',
    'if ($updated) {',
    '  Write-UpdLog ("applied after " + $attempt + " attempt(s)")',
    '  Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue',
    '} else {',
    '  Write-UpdLog ("FAILED (extracted=" + $extracted + "): " + $lastError)',
    '}',
    'Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue',
    'if ($Relaunch -eq 1) { Start-Process -FilePath (Join-Path $TargetDir $ExeName) }',
    'Start-Sleep -Seconds 1',
    'Remove-Item -LiteralPath $SelfPath -Force -ErrorAction SilentlyContinue',
  ].join('\n');
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

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex').toLowerCase()));
  });
}

/** 헬퍼 실행 인자 구성 — apply()와 before-quit 경로가 같은 것을 쓰도록 한 곳에 둔다. */
function buildHelperInvocation({ downloadedUpdate, helperPath, logFile, relaunch }) {
  const targetExecutable = process.env.PORTABLE_EXECUTABLE_FILE;
  const common = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', helperPath,
    '-AppProcessId', String(process.pid), '-LogPath', logFile, '-Relaunch', relaunch ? '1' : '0',
    '-MaxAttempts', String(HELPER_MAX_ATTEMPTS), '-SelfPath', helperPath];
  if (!targetExecutable) {
    // 폴더형(win-unpacked) 설치: 받은 zip을 앱 종료 후 설치 폴더에 덮어쓰기
    return {
      script: buildFolderHelperScript(),
      args: [...common, '-Zip', downloadedUpdate.filePath, '-TargetDir', path.dirname(process.execPath),
        '-ExeName', path.basename(process.execPath)],
      detail: { mode: 'folder', targetDir: path.dirname(process.execPath), exeName: path.basename(process.execPath) },
    };
  }
  return {
    script: buildPortableHelperScript(),
    args: [...common, '-Source', downloadedUpdate.filePath, '-Target', targetExecutable,
      '-ExpectedSha256', String(downloadedUpdate.sha256 || '')],
    detail: { mode: 'portable', targetExecutable },
  };
}

function createPortableUpdater({ app, getMainWindow }) {
  let availableUpdate = null;
  let downloadedUpdate = null;
  let downloadPromise = null;
  let applying = false;
  // 자동 다운로드 실패 시 1시간 뒤에 다시 시도 (10분 주기 체크마다 80MB를 재시도하면 회선·서버 부담)
  let nextAutoDownloadAt = 0;
  const AUTO_DOWNLOAD_BACKOFF_MS = 60 * 60 * 1000;

  function send(channel, payload) {
    getMainWindow()?.webContents.send(channel, payload);
  }

  function logFile() {
    return path.join(app.getPath('userData'), 'updater.log');
  }

  function log(message, details) {
    try {
      const suffix = details ? ` ${JSON.stringify(details)}` : '';
      fs.appendFileSync(logFile(), `[${new Date().toISOString()}] ${message}${suffix}\n`, 'utf8');
    } catch {
      // 로그 기록 실패가 앱 실행을 막으면 안 된다.
    }
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

      // 폴더형(win-unpacked) 설치용 전체 zip — 매니페스트에 있으면 같은 호스트·sha 형식만 수용
      let zipDownloadUrl = null;
      if (manifest.zipUrl && /^[a-f0-9]{64}$/i.test(manifest.zipSha256 || '')) {
        const zipUrl = new URL(manifest.zipUrl, MANIFEST_URL);
        if (zipUrl.protocol === 'https:' && zipUrl.hostname === ALLOWED_DOWNLOAD_HOST) {
          zipDownloadUrl = zipUrl.toString();
        }
      }

      availableUpdate = { ...manifest, url: downloadUrl.toString(), zipUrl: zipDownloadUrl };
      log('update-available', { version: manifest.version });
      send('update-available', { version: manifest.version, releaseDate: manifest.releaseDate });

      // 무인 자동 다운로드 — 직원이 배너를 못 봐도 다음 종료 시점에 적용될 수 있게 미리 받아둔다.
      const needsDownload = !downloadedUpdate || downloadedUpdate.version !== manifest.version;
      if (needsDownload && Date.now() >= nextAutoDownloadAt) {
        download('auto').catch(() => {
          // 실패는 download()가 로그·이벤트로 처리. 백오프 후 재시도(수동 [지금 업데이트]는 즉시 가능).
          nextAutoDownloadAt = Date.now() + AUTO_DOWNLOAD_BACKOFF_MS;
        });
      }
      return availableUpdate;
    } catch (error) {
      log('update-check-failed', { message: error.message });
      send('update-error', { message: error.message });
      return null;
    }
  }

  async function download(trigger = 'manual') {
    if (downloadPromise) return downloadPromise;
    downloadPromise = (async () => {
      const update = availableUpdate || await check('manual');
      if (!update) throw new Error('설치할 업데이트가 없습니다.');

      // 포터블 exe는 단일 exe 교체, 폴더형(win-unpacked)은 전체 zip 덮어쓰기 —
      // 폴더형에서 exe만 갈면 resources가 구버전으로 남아 무결성 해시가 깨진다.
      const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
      const sourceUrl = isPortable ? update.url : update.zipUrl;
      const sourceSha = isPortable ? update.sha256 : update.zipSha256;
      if (!sourceUrl) {
        throw new Error('폴더형 설치용 업데이트 파일이 아직 게시되지 않았습니다. 관리자에게 문의해주세요.');
      }

      const updateDir = path.join(app.getPath('userData'), 'updates');
      await fs.promises.mkdir(updateDir, { recursive: true });
      const destination = path.join(updateDir, `troiareuke-crm-${update.version}.new.${isPortable ? 'exe' : 'zip'}`);

      // 이미 받아둔 파일이 온전하면 재다운로드 생략 (종료 시 적용이 실패했던 경우 등)
      let reused = false;
      try {
        reused = (await sha256OfFile(destination)) === String(sourceSha).toLowerCase();
      } catch {
        reused = false;
      }
      if (!reused) {
        await fs.promises.unlink(destination).catch(() => {});
        await downloadFile(sourceUrl, destination, sourceSha);
      }
      // 헬퍼가 적용 후 검증하는 해시는 "실제로 받은 파일"의 해시여야 한다 (포터블=exe, 폴더형=zip)
      downloadedUpdate = { ...update, filePath: destination, isPortable, sha256: isPortable ? update.sha256 : update.zipSha256 };
      log('update-downloaded', { version: update.version, filePath: destination, trigger, reused });
      send('update-downloaded', { version: update.version, autoApplyOnQuit: true });
      return { version: update.version };
    })();

    try {
      return await downloadPromise;
    } catch (error) {
      log('update-download-failed', { message: error.message, trigger });
      send('update-error', { message: error.message });
      throw error;
    } finally {
      downloadPromise = null;
    }
  }

  /**
   * 적용 헬퍼를 띄운다(동기). relaunch=true면 적용 후 프로그램을 다시 실행한다.
   * 앱 종료는 호출자가 책임진다 — 헬퍼는 현재 프로세스가 끝나기를 기다린 뒤 파일을 교체한다.
   * before-quit 흐름에서도 쓰이므로 await 없이 끝나야 한다.
   */
  function spawnApplyHelper({ relaunch, reason }) {
    if (!downloadedUpdate?.filePath) throw new Error('다운로드된 업데이트가 없습니다.');
    if (applying) return false;
    applying = true;
    const helperPath = path.join(app.getPath('temp'), `troiareuke-updater-${Date.now()}.ps1`);
    const { script, args, detail } = buildHelperInvocation({ downloadedUpdate, helperPath, logFile: logFile(), relaunch });
    fs.writeFileSync(helperPath, script, 'utf8');
    log('applying-update', { version: downloadedUpdate.version, relaunch, reason, ...detail });
    const helper = spawn('powershell.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
    helper.unref();
    return true;
  }

  /** [지금 재시작] — 즉시 적용 + 재실행 */
  async function apply() {
    const started = spawnApplyHelper({ relaunch: true, reason: 'user-restart' });
    if (started) setTimeout(() => app.quit(), 300);
  }

  function setup() {
    log('portable-updater-started', {
      currentVersion: app.getVersion(),
      portableExecutable: process.env.PORTABLE_EXECUTABLE_FILE || null,
    });
    setTimeout(() => check('startup'), 5000);
    setInterval(() => check('interval'), 10 * 60 * 1000);

    // 프로그램을 닫을 때 받아둔 업데이트가 있으면 조용히 적용 (재실행 없음 → 다음 실행부터 새 버전)
    app.on('before-quit', () => {
      if (!downloadedUpdate?.filePath || applying) return;
      try {
        spawnApplyHelper({ relaunch: false, reason: 'quit' });
      } catch (error) {
        log('apply-on-quit-failed', { message: error.message });
      }
    });
  }

  return { setup, check, download, apply };
}

module.exports = {
  createPortableUpdater,
  // 테스트 전용 노출 (scripts/test-updater-helpers.mjs)
  buildPortableHelperScript,
  buildFolderHelperScript,
  isNewerVersion,
  HELPER_MAX_ATTEMPTS,
};
