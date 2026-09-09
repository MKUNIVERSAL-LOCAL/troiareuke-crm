/**
 * 모바일 매니페스트(mobile-latest.json) 생성 → release/portable-update/ 에 스테이징.
 * GitHub Release 자산 + NAS 채널 /mobile/latest.json 두 곳에 게시된다(클라이언트 src/lib/mobileUpdate.ts가 순서대로 읽음).
 *
 * 필드는 추가만 허용(제거·개명 금지 — 구버전 앱 파서 보호):
 *   version, minSupportedVersion, releasedAt, notes, android{storeUrl,apkUrl}, ios{storeUrl,testflightUrl}
 * 스토어 URL은 등록 후 환경변수(MOBILE_ANDROID_STORE_URL / MOBILE_IOS_STORE_URL)로 넣으면 자동 반영되고,
 * 없으면 이전 채널 값을 승계한다.
 * minSupportedVersion은 서버 API 호환이 깨지는 릴리스에서만 올린다(docs/MOBILE-APP-PLAN.md D6). 기본은 이전 값 유지.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stageDir = path.join(root, 'release', 'portable-update');
fs.mkdirSync(stageDir, { recursive: true });

// 이전 매니페스트(채널)에서 값 승계 — 없으면 1.0.58(모바일 첫 버전)
let previous = {};
try {
  const res = await fetch(`https://crm-update.mkcorp.familyds.com/mobile/latest.json?t=${Date.now()}`);
  if (res.ok) previous = await res.json();
} catch { /* 채널에 아직 없음 */ }

const notesPath = path.join(root, 'docs', 'RELEASE-NOTES-CURRENT.md');
// 릴리스 노트의 첫 항목(■ 제목 + 첫 •)을 요약으로 — 첫 줄("vX 업데이트 내용")은 제목이라 제외
const notes = (() => {
  if (!fs.existsSync(notesPath)) return '';
  const lines = fs.readFileSync(notesPath, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines.find((l) => l.startsWith('■'))?.replace(/^■\s*/, '') || '';
  const first = lines.find((l) => l.startsWith('•'))?.replace(/^•\s*/, '') || '';
  return [head, first].filter(Boolean).join(' — ').slice(0, 200);
})();
const releaseBase = `https://github.com/MKUNIVERSAL-LOCAL/troiareuke-crm/releases/download/v${version}`;

const manifest = {
  version,
  minSupportedVersion: process.env.MOBILE_MIN_SUPPORTED_VERSION || previous.minSupportedVersion || '1.0.58',
  releasedAt: new Date().toISOString(),
  notes,
  android: {
    storeUrl: process.env.MOBILE_ANDROID_STORE_URL || previous.android?.storeUrl || '',
    // 스토어 등록 전 파일럿: CI(mobile-android.yml)가 릴리스에 올리는 APK
    apkUrl: `${releaseBase}/TroiareukeCRM-android.apk`,
  },
  ios: {
    storeUrl: process.env.MOBILE_IOS_STORE_URL || previous.ios?.storeUrl || '',
    testflightUrl: process.env.MOBILE_IOS_TESTFLIGHT_URL || previous.ios?.testflightUrl || '',
  },
};
fs.writeFileSync(path.join(stageDir, 'mobile-latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`mobile-latest.json 생성: v${manifest.version} (minSupported ${manifest.minSupportedVersion})`);
