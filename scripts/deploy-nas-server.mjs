/**
 * NAS API 서버 재배포 — PC에서 SSH로 실행. DSM 작업 스케줄러에 의존하지 않는다.
 *
 * 서버 컨테이너 재생성(docker-compose)은 root 권한이 필요하다. 그래서 두 경로 중 하나로 동작한다:
 *  A) 오너가 1회 등록한 sudoers 규칙(scripts/nas-tasks/grant-deploy-sudo.sh)이 있으면
 *     `sudo -n /volume1/docker/crm-server-deploy.sh` 로 비밀번호 없이 재배포한다.
 *  B) 규칙이 없으면 실패하지 않고 안내만 출력한다 — 오너가 DSM > 작업 스케줄러 > CRM-server-update [실행].
 *
 * 성공 판정은 /health 가 알려주는 서버 코드 지문(server/src 해시)이 이 저장소의 값과 같은지로 한다 (229, 리뷰 H-1).
 * 예전 판정(/api/admin/login-logs 401)은 재배포되지 않은 구버전 서버도 통과시켜 "✅ 최신 코드 응답 확인" 을 거짓으로 찍었다.
 */
import { execFileSync } from 'node:child_process';
import { CODE_HASH } from '../server/src/buildInfo.js';

const HOST = process.env.NAS_SSH_HOST || 'ys-lee0223@mkcorp.familyds.com';
const API = 'https://crm-api.mkcorp.familyds.com';

/** 실서버가 이 저장소의 server/src 를 돌리고 있는가 — /health 의 codeHash 로 판정 */
async function serverIsCurrent() {
  try {
    const r = await fetch(`${API}/health`);
    if (!r.ok) return false;
    const j = await r.json();
    return j.codeHash === CODE_HASH; // 지문 없음(구버전)·불일치면 재배포가 아직 안 된 것
  } catch {
    return false;
  }
}

/** 지금 실서버가 알려주는 지문 — 실패 안내에 함께 보여 준다 */
async function remoteHash() {
  try {
    const j = await (await fetch(`${API}/health`)).json();
    return j.codeHash || '(없음 — 지문을 모르는 구버전)';
  } catch (e) {
    return `(읽지 못함: ${e instanceof Error ? e.message : e})`;
  }
}

console.log('NAS 서버 재배포 시도(sudo 규칙 기반)…');
let ok = false;
try {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', HOST,
    'sudo -n /volume1/docker/crm-server-deploy.sh 2>&1 || echo NO_SUDO'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000,
  });
  process.stdout.write(out);
  ok = !out.includes('NO_SUDO') && /done|health/.test(out);
} catch (error) {
  console.error(error.stdout || error.message);
}

// 컨테이너 재시작 대기 후 검증 (지문 일치까지 최대 60초)
const sudoRan = ok;
let current = await serverIsCurrent();
// sudo 재배포가 돌았을 때만 기다린다 — 권한이 없어 아무것도 실행되지 않았으면 기다릴 이유가 없다
for (let i = 0; i < 11 && sudoRan && !current; i += 1) {
  await new Promise(r => setTimeout(r, 5000));
  current = await serverIsCurrent();
}
if (current) {
  console.log(`✅ 서버가 이 저장소 코드로 응답 (지문 ${CODE_HASH})`);
} else if (sudoRan) {
  // sudo 재배포가 실행됐는데도 지문이 다르다 = 빌드 실패로 구 컨테이너가 그대로 돌고 있다 → 실패로 끝낸다 (229, 리뷰 H-1)
  console.error([
    `❌ 재배포를 실행했지만 서버 코드 지문이 다릅니다 — 로컬 ${CODE_HASH} / 서버 ${await remoteHash()}`,
    '   구 컨테이너가 그대로 서비스 중일 수 있습니다(빌드·태그 조회 실패). NAS 에서 docker-compose 로그를 확인하세요.',
  ].join('\n'));
  process.exitCode = 1;
} else {

console.log([
  `⚠️ 서버 재배포는 관리자 권한이 필요해 자동으로 끝내지 못했습니다(서버 지문 ${await remoteHash()} ≠ 로컬 ${CODE_HASH}). 두 가지 중 하나:`,
  '  1) (1회) DSM > 작업 스케줄러 > 생성 > 사용자 정의 스크립트 > 사용자 root > scripts/nas-tasks/grant-deploy-sudo.sh 내용 붙여넣기 > 실행',
  '     → 이후 릴리스는 이 스크립트가 서버까지 자동 재배포합니다.',
  '  2) 지금 한 번만: DSM > 작업 스케줄러 > CRM-server-update [실행]',
].join('\n'));
}
// NO_SUDO 경로는 "오너 1회 액션 대기" 라는 알려진 상태라 릴리스를 실패로 만들지 않는다(위 sudo 실행 실패만 exitCode 1).
// process.exit()를 쓰지 않는다 — 열린 fetch 핸들과 겹치면 Windows에서 libuv assertion(exit 127)이 난다(2026-09-09 v1.0.58 릴리스에서 발생).
// 채널 게시는 성공했으므로 릴리스 자체는 실패로 만들지 않는다(exitCode 0).
if (process.exitCode !== 1) process.exitCode = 0;
