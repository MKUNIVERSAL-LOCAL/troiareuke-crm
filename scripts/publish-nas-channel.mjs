/**
 * NAS 업데이트 채널 게시 — DSM 작업 스케줄러에 의존하지 않고 PC에서 SSH로 직접 게시한다.
 * (2026-09-09: DSM 스케줄이 이틀간 돌지 않아 v1.0.49~57이 지점에 나가지 않았던 사고 → release:all에 편입)
 *
 * 절차(배포 불변 원칙 규칙 2 준수):
 *  1. GitHub 최신 릴리스 태그 조회 → 산출물 5종을 채널 폴더의 .staging 에 내려받기
 *  2. latest.json의 sha256 3종과 실제 파일 해시 대조 — 하나라도 다르면 중단(채널 무변경)
 *  3. exe·zip·Setup → history.json → latest.json 순서로 원자적 rename (매니페스트가 항상 마지막)
 *  4. 사이트(index.html)를 해당 태그 소스로 갱신
 *  5. 채널에서 다시 읽어 버전 일치 확인
 *
 * 전제: `ssh ys-lee0223@mkcorp.familyds.com` 무비밀번호 접속(키 등록됨). 환경변수 NAS_SSH_HOST로 대상 변경 가능.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const HOST = process.env.NAS_SSH_HOST || 'ys-lee0223@mkcorp.familyds.com';
const CHANNEL_DIR = '/volume1/CRM-UPDATES';
const REPO = 'MKUNIVERSAL-LOCAL/troiareuke-crm';
const tag = process.env.RELEASE_TAG || `v${version}`;

const remote = `set -e
cd ${CHANNEL_DIR}/portable
BASE=https://github.com/${REPO}/releases/download/${tag}
rm -rf .staging && mkdir -p .staging && cd .staging
for f in TroiareukeCRM-portable.exe TroiareukeCRM-win64.zip TroiareukeCRM-Setup.exe latest.json history.json; do
  wget -q -O "$f" "$BASE/$f" || { echo "DOWNLOAD_FAIL $f"; exit 2; }
done
v=$(sed -n 's/.*"version": *"\\([^"]*\\)".*/\\1/p' latest.json | head -1)
[ "v$v" = "${tag}" ] || { echo "MANIFEST_VERSION_MISMATCH v$v != ${tag}"; exit 3; }
chk() { exp=$(sed -n "s/.*\\"$1\\": *\\"\\([a-f0-9]*\\)\\".*/\\1/p" latest.json | head -1); act=$(sha256sum "$2" | cut -d' ' -f1); [ "$exp" = "$act" ] || { echo "SHA_MISMATCH $2"; exit 4; }; }
chk sha256 TroiareukeCRM-portable.exe
chk zipSha256 TroiareukeCRM-win64.zip
chk installerSha256 TroiareukeCRM-Setup.exe
for f in TroiareukeCRM-portable.exe TroiareukeCRM-win64.zip TroiareukeCRM-Setup.exe history.json latest.json; do mv -f "$f" "../$f"; done
cd .. && rmdir .staging
# 모바일 매니페스트(있을 때만) → /mobile/latest.json — 스토어 앱이 읽는 주소. 없어도 PC 채널 게시는 유효
mkdir -p ${CHANNEL_DIR}/mobile
if wget -q -O ${CHANNEL_DIR}/mobile/latest.json.tmp "$BASE/mobile-latest.json"; then mv -f ${CHANNEL_DIR}/mobile/latest.json.tmp ${CHANNEL_DIR}/mobile/latest.json; echo "MOBILE_MANIFEST_PUBLISHED"; else rm -f ${CHANNEL_DIR}/mobile/latest.json.tmp; echo "MOBILE_MANIFEST_SKIPPED"; fi
wget -qO /tmp/crm-site-index.html https://raw.githubusercontent.com/${REPO}/${tag}/site/index.html && mv -f /tmp/crm-site-index.html ${CHANNEL_DIR}/index.html
echo "PUBLISHED ${tag}"
`;

console.log(`NAS 채널 게시: ${tag} → ${HOST}:${CHANNEL_DIR}/portable`);
try {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', HOST, remote], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000,
  });
  process.stdout.write(out);
  if (!out.includes(`PUBLISHED ${tag}`)) throw new Error('게시 완료 표식이 없습니다.');
} catch (error) {
  const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');
  console.error(`❌ NAS 채널 게시 실패 — 채널은 변경되지 않았습니다.\n${detail}`);
  console.error('대안: DSM > 작업 스케줄러 > CRM-publish-update [실행] (오너)');
  process.exit(1);
}

// 채널 재확인
const res = await fetch(`https://crm-update.mkcorp.familyds.com/portable/latest.json?t=${Date.now()}`);
const live = await res.json();
if (live.version !== version) {
  console.error(`❌ 채널 버전 불일치: 채널=${live.version}, 기대=${version}`);
  process.exitCode = 1;
} else {
  console.log(`✅ 채널 라이브 v${live.version}`);
}
