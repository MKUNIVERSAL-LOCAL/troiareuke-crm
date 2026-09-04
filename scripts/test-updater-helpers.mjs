/**
 * 인앱 업데이트 적용 헬퍼(PowerShell) 단독 테스트 — 배포 불변 원칙 회귀 방지.
 *
 * 실제 exe/zip 대신 더미 파일로 다음을 검증한다 (Windows 전용, 약 20초):
 *  1. 포터블: 앱 종료 대기 → exe 교체 → 해시 검증 → 원본 삭제 → 로그 기록
 *  2. 포터블: 대상 파일이 잠긴 동안 재시도 후 성공
 *  3. 포터블: 해시 불일치 시 FAILED 로그 (조용히 성공으로 넘어가지 않음)
 *  4. 폴더형: zip → 임시 폴더 → 설치 폴더 복사 (새 파일 추가·기존 파일 갱신·무관 파일 보존)
 *  5. 폴더형: zip 루트에 exe가 없으면 설치 폴더를 건드리지 않고 FAILED
 *
 * 실행: node scripts/test-updater-helpers.mjs
 */
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { buildPortableHelperScript, buildFolderHelperScript, isNewerVersion } = require('../electron/portable-updater.cjs');

if (process.platform !== 'win32') {
  console.log('SKIP  Windows 전용 테스트');
  process.exit(0);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'troiareuke-updater-test-'));
let failures = 0;

function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { failures += 1; console.error(`FAIL  ${name} — ${e.message}`); }
}
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const randomFile = (p, size = 256 * 1024) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, crypto.randomBytes(size)); };
const ps = (args, opts = {}) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', timeout: 120000, ...opts });

/** "실행 중인 앱"을 흉내내는 프로세스 — seconds 뒤 스스로 종료 */
function fakeApp(seconds) {
  const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Sleep -Seconds ${seconds}`], { stdio: 'ignore' });
  return child.pid;
}

function runHelper(kind, params) {
  const helperPath = path.join(root, `helper-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
  fs.writeFileSync(helperPath, kind === 'portable' ? buildPortableHelperScript() : buildFolderHelperScript(), 'utf8');
  const args = ['-File', helperPath, '-SelfPath', helperPath];
  for (const [k, v] of Object.entries(params)) args.push(`-${k}`, String(v));
  const r = ps(args);
  if (r.status !== 0) throw new Error(`helper exit ${r.status}: ${r.stderr}`);
  return { helperPath };
}

await test('버전 비교: 1.0.48 > 1.0.47, 1.0.10 > 1.0.9, 동일 버전은 업데이트 아님', async () => {
  assert(isNewerVersion('1.0.48', '1.0.47'), '1.0.48 > 1.0.47');
  assert(isNewerVersion('1.0.10', '1.0.9'), '1.0.10 > 1.0.9 (문자열 비교 함정)');
  assert(!isNewerVersion('1.0.47', '1.0.47'), '동일');
  assert(!isNewerVersion('1.0.46', '1.0.47'), '구버전');
  assert(isNewerVersion('1.1.0', '1.0.99'), '마이너 상승');
});

await test('포터블: 앱 종료 후 exe 교체 + 해시 검증 + 원본 삭제 + 로그', async () => {
  const dir = path.join(root, 'p1');
  const target = path.join(dir, 'TroiareukeCRM-portable.exe');
  const source = path.join(dir, 'updates', 'troiareuke-crm-9.9.9.new.exe');
  const log = path.join(dir, 'updater.log');
  randomFile(target); randomFile(source);
  const expected = sha(source);
  const pid = fakeApp(2);
  const t0 = Date.now();
  const { helperPath } = runHelper('portable', { AppProcessId: pid, Source: source, Target: target, ExpectedSha256: expected, LogPath: log, Relaunch: 0, MaxAttempts: 5 });
  assert(Date.now() - t0 >= 1500, '앱 종료를 기다리지 않았다');
  assert(sha(target) === expected, '대상 exe가 새 파일로 교체되지 않았다');
  assert(!fs.existsSync(source), '다운로드 원본이 정리되지 않았다');
  assert(!fs.existsSync(helperPath), '헬퍼 스크립트가 자기 삭제되지 않았다');
  const text = fs.readFileSync(log, 'utf8');
  assert(/helper-portable start/.test(text) && /applied after 1 attempt/.test(text), `로그 내용 이상: ${text}`);
});

await test('포터블: 대상 파일이 잠겨 있으면 재시도 후 성공', async () => {
  const dir = path.join(root, 'p2');
  const target = path.join(dir, 'app.exe');
  const source = path.join(dir, 'new.exe');
  const log = path.join(dir, 'updater.log');
  randomFile(target); randomFile(source);
  const expected = sha(source);
  // 3초간 배타 잠금을 쥔 별도 프로세스 (백신 스캔·잔류 핸들 흉내)
  const locker = spawn('powershell.exe', ['-NoProfile', '-Command',
    `$fs=[System.IO.File]::Open('${target.replace(/'/g, "''")}','Open','ReadWrite','None'); Start-Sleep -Seconds 3; $fs.Close()`], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  runHelper('portable', { AppProcessId: fakeApp(1), Source: source, Target: target, ExpectedSha256: expected, LogPath: log, Relaunch: 0, MaxAttempts: 15 });
  locker.kill();
  assert(sha(target) === expected, '잠금 해제 후에도 교체되지 않았다');
  const m = fs.readFileSync(log, 'utf8').match(/applied after (\d+) attempt/);
  assert(m && Number(m[1]) > 1, `재시도가 기록되지 않았다: ${fs.readFileSync(log, 'utf8')}`);
});

await test('포터블: 해시 불일치는 FAILED로 기록 (성공으로 위장하지 않음)', async () => {
  const dir = path.join(root, 'p3');
  const target = path.join(dir, 'app.exe');
  const source = path.join(dir, 'new.exe');
  const log = path.join(dir, 'updater.log');
  randomFile(target); randomFile(source);
  runHelper('portable', { AppProcessId: fakeApp(1), Source: source, Target: target, ExpectedSha256: 'deadbeef'.repeat(8), LogPath: log, Relaunch: 0, MaxAttempts: 2 });
  const text = fs.readFileSync(log, 'utf8');
  assert(/FAILED after 2 attempts: hash mismatch/.test(text), `FAILED 로그 없음: ${text}`);
  assert(fs.existsSync(source), '실패했는데 원본을 지웠다 (다음 실행 재시도 불가)');
});

await test('폴더형: zip → 임시 폴더 → 설치 폴더 복사 (갱신·추가·보존)', async () => {
  const dir = path.join(root, 'f1');
  const targetDir = path.join(dir, 'install');
  const newDir = path.join(dir, 'new');
  const zip = path.join(dir, 'update.zip');
  const log = path.join(dir, 'updater.log');
  randomFile(path.join(targetDir, 'app.exe'));
  randomFile(path.join(targetDir, 'resources', 'app.asar'));
  fs.writeFileSync(path.join(targetDir, 'user-note.txt'), 'keep me');
  randomFile(path.join(newDir, 'app.exe'));
  randomFile(path.join(newDir, 'resources', 'app.asar'));
  fs.writeFileSync(path.join(newDir, 'added.txt'), 'new file');
  const r = ps(['-Command', `Compress-Archive -Path '${newDir.replace(/'/g, "''")}\\*' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`]);
  assert(r.status === 0, `zip 생성 실패: ${r.stderr}`);
  const expectExe = sha(path.join(newDir, 'app.exe'));
  const expectAsar = sha(path.join(newDir, 'resources', 'app.asar'));
  const { helperPath } = runHelper('folder', { AppProcessId: fakeApp(1), Zip: zip, TargetDir: targetDir, ExeName: 'app.exe', LogPath: log, Relaunch: 0, MaxAttempts: 5 });
  assert(sha(path.join(targetDir, 'app.exe')) === expectExe, 'exe 미갱신');
  assert(sha(path.join(targetDir, 'resources', 'app.asar')) === expectAsar, 'resources 미갱신 (무결성 해시 깨짐 경로)');
  assert(fs.existsSync(path.join(targetDir, 'added.txt')), '새 파일 미추가');
  assert(fs.readFileSync(path.join(targetDir, 'user-note.txt'), 'utf8') === 'keep me', '무관 파일이 사라졌다');
  assert(!fs.existsSync(zip), 'zip 미정리');
  assert(!fs.existsSync(helperPath), '헬퍼 자기 삭제 실패');
  assert(/applied after 1 attempt/.test(fs.readFileSync(log, 'utf8')), '로그 이상');
  const leftovers = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('troiareuke-staging-'));
  assert(leftovers.length === 0, `임시 폴더 잔류: ${leftovers.join(', ')}`);
});

await test('폴더형: zip 루트에 exe가 없으면 설치 폴더를 건드리지 않고 FAILED', async () => {
  const dir = path.join(root, 'f2');
  const targetDir = path.join(dir, 'install');
  const badDir = path.join(dir, 'bad', 'win-unpacked'); // 한 겹 더 싸인 잘못된 zip
  const zip = path.join(dir, 'bad.zip');
  const log = path.join(dir, 'updater.log');
  randomFile(path.join(targetDir, 'app.exe'));
  const before = sha(path.join(targetDir, 'app.exe'));
  randomFile(path.join(badDir, 'app.exe'));
  const r = ps(['-Command', `Compress-Archive -Path '${path.join(dir, 'bad').replace(/'/g, "''")}\\*' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`]);
  assert(r.status === 0, `zip 생성 실패: ${r.stderr}`);
  runHelper('folder', { AppProcessId: fakeApp(1), Zip: zip, TargetDir: targetDir, ExeName: 'app.exe', LogPath: log, Relaunch: 0, MaxAttempts: 2 });
  assert(sha(path.join(targetDir, 'app.exe')) === before, '잘못된 zip인데 설치 폴더가 변경됐다');
  assert(fs.existsSync(path.join(targetDir, 'app.exe')) && !fs.existsSync(path.join(targetDir, 'win-unpacked')), '중첩 폴더가 설치 폴더에 생겼다');
  assert(/FAILED \(extracted=False\)/.test(fs.readFileSync(log, 'utf8')), `FAILED 로그 없음: ${fs.readFileSync(log, 'utf8')}`);
});

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* 잔류 무시 */ }
if (failures > 0) { console.error(`\n${failures}개 실패`); process.exit(1); }
console.log('\n업데이트 헬퍼 테스트 전부 통과');
