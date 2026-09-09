/**
 * 배포 불변 원칙(docs/DISTRIBUTION-POLICY.md) 자동 점검 — "설치 1회, 이후 무인 자동 업데이트"가
 * 코드 변경으로 조용히 무너지지 않게 하는 정적 검사. client-ci와 release:all 게이트에서 실행된다.
 *
 * 하나라도 실패하면 exit 1 → CI 실패 / 릴리스 생성 차단.
 * 규칙을 의도적으로 바꾸는 경우에만 이 파일과 정책 문서를 함께 수정한다(오너 승인).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let failures = 0;
function check(name, ok, hint) {
  if (ok) { console.log(`PASS  ${name}`); return; }
  failures += 1;
  console.error(`FAIL  ${name}${hint ? ` — ${hint}` : ''}`);
}

const updater = read('electron/portable-updater.cjs');
check('업데이트 매니페스트 주소 고정 (구버전 클라이언트가 보는 주소)',
  updater.includes("const MANIFEST_URL = 'https://crm-update.mkcorp.familyds.com/portable/latest.json'"),
  '주소를 바꾸면 이미 설치된 모든 지점이 업데이트를 못 받는다. 바꿔야 하면 구주소를 브리지로 유지');
check('다운로드 호스트 허용 목록 고정', updater.includes("const ALLOWED_DOWNLOAD_HOST = 'crm-update.mkcorp.familyds.com'"));
check('새 버전 발견 시 자동 다운로드 (사용자 클릭 의존 금지)', /download\('auto'\)/.test(updater),
  'check()에서 download(\'auto\')를 호출해야 한다');
check('프로그램 종료 시 자동 적용 (before-quit)', /app\.on\('before-quit'/.test(updater) && /relaunch:\s*false/.test(updater));
check('포터블 exe 교체 + 폴더형 zip 스테이징 복사 두 경로 모두 존재',
  /buildPortableHelperScript/.test(updater) && /buildFolderHelperScript/.test(updater) && /Expand-Archive -LiteralPath \$Zip -DestinationPath \$staging/.test(updater),
  '폴더형에서 exe만 갈면 asar 무결성이 깨져 재설치가 필요해진다(v1.0.39 실사고)');
check('적용 헬퍼 재시도 ≥ 60회 (백신 스캔·파일 잠금 대비)', /HELPER_MAX_ATTEMPTS = (\d+)/.test(updater) && Number(updater.match(/HELPER_MAX_ATTEMPTS = (\d+)/)[1]) >= 60);
check('적용 후 해시 검증 + updater.log 기록', /Get-FileHash -LiteralPath \$Target/.test(updater) && /Write-UpdLog/.test(updater));
check('주기 확인 유지 (시작 5초 후 + 10분 간격)', /check\('startup'\), 5000\)/.test(updater) && /10 \* 60 \* 1000/.test(updater));

const prepare = read('scripts/prepare-portable-update.mjs');
for (const field of ['url', 'sha256', 'zipUrl', 'zipSha256', 'installerUrl', 'installerSha256', 'version']) {
  check(`매니페스트 필드 유지: ${field} (필드 제거·개명 금지)`, new RegExp(`\\b${field}\\b`).test(prepare));
}
check('채널 파일명 고정 (Setup/portable/win64.zip — 옛 링크가 항상 최신을 받도록)',
  /'TroiareukeCRM-Setup\.exe'/.test(prepare) && /'TroiareukeCRM-portable\.exe'/.test(prepare) && /'TroiareukeCRM-win64\.zip'/.test(prepare));
const ghRelease = read('scripts/create-github-release.mjs');
check('GitHub Release 산출물 5종 (설치파일 포함)', ['TroiareukeCRM-Setup.exe', 'TroiareukeCRM-portable.exe', 'TroiareukeCRM-win64.zip', 'latest.json', 'history.json'].every(n => ghRelease.includes(`'${n}'`)));
check('폴더형 zip은 win-unpacked 루트 내용물로 압축 (중첩 폴더 금지)', /win-unpacked/.test(prepare) && /\\\\\*'/.test(prepare) || /win-unpacked[^\n]*\*/.test(prepare));

const pkg = JSON.parse(read('package.json'));
const releaseAll = pkg.scripts['release:all'] || '';
check('release:all 게이트: 라우트 검사', releaseAll.includes('check-routes.mjs'));
check('release:all 게이트: 업데이터 헬퍼 테스트', releaseAll.includes('test-updater-helpers.mjs'));
check('release:all 게이트: 배포 불변 원칙 점검(이 스크립트)', releaseAll.includes('check-distribution-invariants.mjs'));
check('release:all: 스테이징(prepare) 후 GitHub Release', releaseAll.indexOf('prepare-portable-update') !== -1 || releaseAll.includes('electron:portable:prepare'));
check('release:all: 설치파일(nsis)+포터블 동시 빌드', releaseAll.includes('electron:build:release') && /nsis portable/.test(pkg.scripts['electron:build:release'] || ''));
check('NSIS: 사용자 폴더 설치·관리자 권한 불필요(perMachine=false)·데이터 보존', pkg.build?.nsis?.perMachine === false && pkg.build?.nsis?.deleteAppDataOnUninstall === false);

const authApi = read('src/lib/authApi.ts');
check('지점 버전 텔레메트리 헤더 전송 (X-App-Version / X-App-Mode)', authApi.includes("'X-App-Version'") && authApi.includes("'X-App-Mode'"));
const server = read('server/src/server.js');
check('서버가 버전 헤더를 기록 (recordAppVersion + 컬럼 마이그레이션)',
  /function recordAppVersion/.test(server) && /recordAppVersion\(req, rows\[0\]\)/.test(server) && /last_app_version text/.test(server));
check('어드민 콘솔에 구버전 지점 표시 유틸 존재', fs.existsSync(path.join(root, 'src/lib/updateChannel.ts')) && /INSTALL_SITE_URL = 'https:\/\/crm-update\.mkcorp\.familyds\.com\/'/.test(read('src/lib/updateChannel.ts')));

const banner = read('src/components/ui/UpdateBanner.tsx');
check('배너가 자동 재시작을 강제하지 않음 (입력 중 작업 유실 방지)', !/installUpdate\(\)\s*;?\s*\}\s*\)\s*;?\s*$/m.test(banner.split('onUpdateDownloaded')[1]?.split('});')[0] || ''));

const lock = read('scripts/core-lock.mjs');
check('업데이터·스테이징 스크립트가 코어 잠금 목록에 있음', lock.includes("'electron/portable-updater.cjs'") && lock.includes("'scripts/prepare-portable-update.mjs'"),
  'CORE_EDIT=1 없이 수정되면 안 되는 파일');

// ── 규칙 14: 모바일 앱(스토어) 동반 갱신 — 오너 지시 2026-09-09 "업데이트마다 모바일 최적화는 무조건" ──
const capConfig = read('capacitor.config.ts');
check('모바일 appId 고정 (com.troiareuke.crm — 스토어 등록 후 변경 = 다른 앱)', capConfig.includes("appId: 'com.troiareuke.crm'"),
  'appId를 바꾸면 기존 설치자가 업데이트를 못 받는다');
check('모바일 webDir = dist-mobile (BUILD_TARGET=capacitor 산출물)', capConfig.includes("webDir: 'dist-mobile'"));
const viteCfg = read('vite.config.ts');
check('Capacitor 빌드: 상대 base + PWA 비활성 + 결제 스크립트 제외', /isCapacitorBuild/.test(viteCfg) && /isPackagedBuild/.test(viteCfg) && /iamport/.test(viteCfg) && /viewport-fit=cover/.test(viteCfg));
const appTsx = read('src/App.tsx');
check('라우터 선택은 platform.ts(USE_HASH_ROUTER) 한 곳 — userAgent 직접 판별 금지', appTsx.includes('USE_HASH_ROUTER') && !/navigator\.userAgent\.includes\('Electron'\)/.test(appTsx) && appTsx.includes('installMobileBridge()'));
const platform = read('src/lib/platform.ts');
check('모바일 앱에서 구독/결제 화면·타사 스토어 링크 숨김 (Apple 3.1.1 / Play 결제 정책)', /subscription: IS_MOBILE_APP/.test(platform) && /storeLinks: IS_MOBILE_APP/.test(platform) && read('src/pages/Settings/index.tsx').includes('HIDE_ON_MOBILE.subscription'));
const mobileUpdate = read('src/lib/mobileUpdate.ts');
check('모바일 매니페스트 주소 고정 (NAS /mobile/latest.json → GitHub latest 백업)',
  mobileUpdate.includes("'https://crm-update.mkcorp.familyds.com/mobile/latest.json'") && mobileUpdate.includes('/releases/latest/download/mobile-latest.json'));
const prepareMobile = read('scripts/prepare-mobile-update.mjs');
for (const field of ['version', 'minSupportedVersion', 'releasedAt', 'notes', 'storeUrl', 'apkUrl', 'testflightUrl']) {
  check(`모바일 매니페스트 필드 유지: ${field}`, new RegExp(`\\b${field}\\b`).test(prepareMobile));
}
check('release:all: 모바일 번들·버전 동기·매니페스트(mobile:prepare) 포함', releaseAll.includes('mobile:prepare') && /sync-mobile-version/.test(pkg.scripts['mobile:prepare'] || '') && /prepare-mobile-update/.test(pkg.scripts['mobile:prepare'] || ''));
check('release:all: NAS 채널 게시·서버 재배포를 PC에서 직접 수행 (DSM 스케줄 단독 의존 금지)', releaseAll.includes('publish-nas-channel.mjs') && releaseAll.includes('deploy-nas-server.mjs'));
const pw = read('playwright.config.ts');
check('E2E 모바일 폭 프로젝트 존재 (Pixel 7) — 릴리스 게이트', /name: 'mobile'/.test(pw) && /Pixel 7/.test(pw) && fs.existsSync(path.join(root, 'e2e/mobile.spec.ts')));
check('안드로이드 CI 빌드 워크플로 존재 (릴리스마다 APK/AAB)', fs.existsSync(path.join(root, '.github/workflows/mobile-android.yml')) && /TroiareukeCRM-android\.apk/.test(read('.github/workflows/mobile-android.yml')));
check('버전 헤더가 모바일 모드(android/ios)도 보고', authApi.includes('APP_MODE_HEADER'));

if (failures) { console.error(`\n배포 불변 원칙 점검 실패 ${failures}건 — docs/DISTRIBUTION-POLICY.md 참조`); process.exit(1); }
console.log('\n✅ 배포 불변 원칙 점검 전부 통과');
