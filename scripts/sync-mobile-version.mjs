/**
 * 모바일 네이티브 프로젝트 버전 동기화 — package.json version →
 *   Android versionCode/versionName, iOS MARKETING_VERSION/CURRENT_PROJECT_VERSION.
 * 규칙: versionCode = major*1_000_000 + minor*1_000 + patch (1.0.58 → 1000058).
 * 스토어는 versionCode가 단조 증가해야 업데이트로 인정한다 — 손으로 build.gradle을 고치지 않고 이 스크립트만 쓴다.
 * release:all(mobile:prepare)과 CI(mobile-android.yml)에서 자동 실행.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = major * 1_000_000 + minor * 1_000 + patch;

function rewrite(file, replacers) {
  if (!fs.existsSync(file)) { console.log(`skip (없음): ${path.relative(root, file)}`); return; }
  let s = fs.readFileSync(file, 'utf8');
  for (const [re, to] of replacers) {
    if (!re.test(s)) throw new Error(`${path.relative(root, file)}: 패턴 없음 ${re}`);
    s = s.replace(re, to);
  }
  fs.writeFileSync(file, s);
  console.log(`synced ${path.relative(root, file)} → ${version} (code ${versionCode})`);
}

rewrite(path.join(root, 'android/app/build.gradle'), [
  [/versionCode \d+/, `versionCode ${versionCode}`],
  [/versionName "[^"]*"/, `versionName "${version}"`],
]);
rewrite(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), [
  [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`],
  [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`],
]);
