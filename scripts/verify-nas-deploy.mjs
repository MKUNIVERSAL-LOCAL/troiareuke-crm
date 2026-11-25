// 배포 후 실서버 자동 검증 — 서버 배포/채널 게시 직후 실행해 회귀를 즉시 잡는다.
// 사용: node scripts/verify-nas-deploy.mjs [--skip-channel]
//   --skip-channel: 채널 버전 대조 생략(서버만 배포했을 때)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE_HASH } from '../server/src/buildInfo.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const API = 'https://crm-api.mkcorp.familyds.com';
const CHANNEL = 'https://crm-update.mkcorp.familyds.com/portable/latest.json';
const skipChannel = process.argv.includes('--skip-channel');

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL  ${name} — ${e.message}`);
  }
}

await check('서버 헬스체크 (auth-api 기동)', async () => {
  const r = await fetch(`${API}/health`);
  const j = await r.json();
  if (!j.ok) throw new Error(`ok=${j.ok}`);
});

// 서버가 정말 이 저장소 코드를 돌리는지 — 라우트 생존만으로는 구 컨테이너를 구분할 수 없다 (229, 리뷰 H-1)
await check(`서버 코드 지문 일치 (로컬 ${CODE_HASH})`, async () => {
  const j = await (await fetch(`${API}/health`)).json();
  if (!j.codeHash) throw new Error('서버가 지문을 알려주지 않습니다 — server/ 재배포 필요(구버전)');
  if (j.codeHash !== CODE_HASH) throw new Error(`서버=${j.codeHash}, 로컬=${CODE_HASH} — server/ 재배포 필요`);
});

await check('비밀번호 재설정 페이지 응답 + 브랜드 표기', async () => {
  const r = await fetch(`${API}/reset-password?token=verify`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const html = await r.text();
  if (!html.includes('더마솔루션')) throw new Error('더마솔루션 표기 없음 (구버전 서버?)');
});

await check('기능 관리 API 존재 (미인증 401 = 정상, 404 = 구버전)', async () => {
  const r = await fetch(`${API}/api/feature-flags`);
  if (r.status !== 401) throw new Error(`status ${r.status} (401 이어야 함)`);
});

await check('인증 API 라우트 생존 (로그인 엔드포인트 4xx)', async () => {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (r.status >= 500 || r.status === 404) throw new Error(`status ${r.status}`);
});

if (!skipChannel) {
  await check(`업데이트 채널 버전 일치 (v${version})`, async () => {
    const r = await fetch(CHANNEL);
    const j = await r.json();
    if (j.version !== version) throw new Error(`채널=${j.version}, 로컬=${version} — 게시 작업 실행 필요`);
    // installerUrl은 v1.0.50부터 (추가 필드) — 매니페스트에 있으면 함께 검증
    for (const url of [j.url, j.zipUrl, j.installerUrl].filter(Boolean)) {
      const head = await fetch(url, { method: 'HEAD' });
      if (head.status !== 200) throw new Error(`${url} → ${head.status}`);
    }
  });
}

console.log(failures === 0 ? '\n✅ 배포 검증 전부 통과' : `\n❌ ${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
