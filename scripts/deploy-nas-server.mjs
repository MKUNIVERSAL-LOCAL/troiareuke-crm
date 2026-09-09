/**
 * NAS API 서버 재배포 — PC에서 SSH로 실행. DSM 작업 스케줄러에 의존하지 않는다.
 *
 * 서버 컨테이너 재생성(docker-compose)은 root 권한이 필요하다. 그래서 두 경로 중 하나로 동작한다:
 *  A) 오너가 1회 등록한 sudoers 규칙(scripts/nas-tasks/grant-deploy-sudo.sh)이 있으면
 *     `sudo -n /volume1/docker/crm-server-deploy.sh` 로 비밀번호 없이 재배포한다.
 *  B) 규칙이 없으면 실패하지 않고 안내만 출력한다 — 오너가 DSM > 작업 스케줄러 > CRM-server-update [실행].
 *
 * 성공 판정은 서버가 새 API를 실제로 응답하는지로 한다(/api/admin/login-logs 401 = 최신, 404 = 구버전).
 */
import { execFileSync } from 'node:child_process';

const HOST = process.env.NAS_SSH_HOST || 'ys-lee0223@mkcorp.familyds.com';
const API = 'https://crm-api.mkcorp.familyds.com';

async function serverIsCurrent() {
  try {
    const r = await fetch(`${API}/api/admin/login-logs`);
    return r.status === 401; // 라우트 존재 + 인증 요구 = 최신 코드
  } catch {
    return false;
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

// 컨테이너 재시작 대기 후 검증
for (let i = 0; i < 12 && ok; i += 1) {
  if (await serverIsCurrent()) { console.log('✅ 서버 최신 코드 응답 확인'); process.exit(0); }
  await new Promise(r => setTimeout(r, 5000));
}
if (await serverIsCurrent()) { console.log('✅ 서버 최신 코드 응답 확인'); process.exit(0); }

console.log([
  '⚠️ 서버 재배포는 관리자 권한이 필요해 자동으로 끝내지 못했습니다. 두 가지 중 하나:',
  '  1) (1회) DSM > 작업 스케줄러 > 생성 > 사용자 정의 스크립트 > 사용자 root > scripts/nas-tasks/grant-deploy-sudo.sh 내용 붙여넣기 > 실행',
  '     → 이후 릴리스는 이 스크립트가 서버까지 자동 재배포합니다.',
  '  2) 지금 한 번만: DSM > 작업 스케줄러 > CRM-server-update [실행]',
].join('\n'));
process.exit(0); // 채널 게시는 성공했으므로 릴리스 자체는 실패로 만들지 않는다
