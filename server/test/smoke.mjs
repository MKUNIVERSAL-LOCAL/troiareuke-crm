/**
 * NAS 중앙 서버 통합 스모크 테스트 (GitHub Actions에서 실제 Postgres로 실행)
 *
 * 검증 흐름:
 *  1. health
 *  2. 공개 가입 차단 (ALLOW_PUBLIC_SIGNUP=false)
 *  3. 슈퍼어드민 부트스트랩 로그인
 *  4. 어드민 계정 발급 (임시 비밀번호) → 발급 계정 로그인
 *  5. 권한 격리 (일반 계정의 admin API 접근 차단)
 *  6. CRM 데이터 저장/조회/수정/삭제 + 지점 간 격리
 *  7. 비밀번호 재설정 토큰 소비 (1회용·세션 무효화·재사용 차단)
 *  8. 프로필(매장 정보) 저장
 */
import crypto from 'node:crypto';
import pg from 'pg';

const API = process.env.API_BASE_URL || 'http://localhost:8787';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

let failures = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name} — ${error.message}`);
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { /* 204 등 */ }
  return { status: response.status, data };
}

let adminToken = '';
let shopToken = '';
let shopEmail = 'shop1@smoke.test';
let shop2Token = '';

await test('health가 ok를 반환한다', async () => {
  const { status, data } = await call('/health');
  assert(status === 200 && data?.ok === true, `status=${status}`);
});

await test('공개 가입이 403으로 차단된다', async () => {
  const { status } = await call('/api/auth/signup', {
    method: 'POST',
    body: { email: 'walkin@smoke.test', password: 'password123', name: '무단가입' },
  });
  assert(status === 403, `status=${status}`);
});

await test('부트스트랩 슈퍼어드민으로 로그인된다', async () => {
  const { status, data } = await call('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert(status === 200 && data?.token, `status=${status} ${JSON.stringify(data)}`);
  assert(data.user.role === 'superadmin', `role=${data?.user?.role}`);
  adminToken = data.token;
});

let temporaryPassword = '';
await test('어드민이 지점 계정을 발급하면 임시 비밀번호가 나온다', async () => {
  const { status, data } = await call('/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { email: shopEmail, name: '지점장', branchName: '아르케스파 1호점', shopType: '에스테틱샵', plan: 'pro' },
  });
  assert(status === 201, `status=${status} ${JSON.stringify(data)}`);
  assert(typeof data.temporaryPassword === 'string' && data.temporaryPassword.length >= 8, 'temporaryPassword 누락');
  assert(data.user.isOnboarded === true && data.user.branchId, '지점 정보 미설정');
  temporaryPassword = data.temporaryPassword;
});

await test('발급된 계정이 임시 비밀번호로 로그인된다', async () => {
  const { status, data } = await call('/api/auth/login', {
    method: 'POST',
    body: { email: shopEmail, password: temporaryPassword },
  });
  assert(status === 200 && data?.token, `status=${status}`);
  shopToken = data.token;
});

await test('일반 계정은 admin API에 접근할 수 없다', async () => {
  const { status } = await call('/api/admin/users', { token: shopToken });
  assert(status === 403, `status=${status}`);
});

await test('CRM 데이터가 저장되고 조회된다 (branch_id 스푸핑 무시)', async () => {
  const put = await call('/api/data/customers', {
    method: 'PUT',
    token: shopToken,
    body: { rows: [{ id: 'c1', name: '김테스트', branch_id: 'spoofed-branch' }] },
  });
  assert(put.status === 200 && put.data.saved === 1, `status=${put.status}`);
  const get = await call('/api/data/customers', { token: shopToken });
  assert(get.status === 200 && get.data.rows.length === 1, `rows=${get.data?.rows?.length}`);
  assert(get.data.rows[0].name === '김테스트', 'name 불일치');
});

await test('다른 지점 계정에게는 데이터가 보이지 않는다', async () => {
  const created = await call('/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { email: 'shop2@smoke.test', branchName: '아르케스파 2호점', shopType: '에스테틱샵' },
  });
  assert(created.status === 201, `status=${created.status}`);
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'shop2@smoke.test', password: created.data.temporaryPassword },
  });
  assert(login.status === 200, `login status=${login.status}`);
  shop2Token = login.data.token;
  const get = await call('/api/data/customers', { token: shop2Token });
  assert(get.status === 200 && get.data.rows.length === 0, `rows=${get.data?.rows?.length}`);
});

await test('데이터 부분 수정(PATCH)이 반영된다', async () => {
  const patch = await call('/api/data/customers/c1', {
    method: 'PATCH',
    token: shopToken,
    body: { updates: { name: '김수정' } },
  });
  assert(patch.status === 200, `status=${patch.status}`);
  const get = await call('/api/data/customers', { token: shopToken });
  assert(get.data.rows[0].name === '김수정', `name=${get.data.rows[0]?.name}`);
});

await test('데이터 삭제가 반영된다', async () => {
  const del = await call('/api/data/customers/c1', { method: 'DELETE', token: shopToken });
  assert(del.status === 204, `status=${del.status}`);
  const get = await call('/api/data/customers', { token: shopToken });
  assert(get.data.rows.length === 0, `rows=${get.data.rows.length}`);
});

await test('허용되지 않은 컬렉션은 404다', async () => {
  const { status } = await call('/api/data/hacktable', { token: shopToken });
  assert(status === 404, `status=${status}`);
});

await test('비밀번호 재설정이 1회용 토큰으로 완료된다', async () => {
  const forgot = await call('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: shopEmail },
  });
  assert(forgot.status === 200, `forgot status=${forgot.status}`);

  // SMTP 없는 CI에서는 메일 대신 DB에 알려진 토큰을 직접 심어 소비 로직을 검증한다.
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const { rows } = await pool.query('SELECT id FROM auth_users WHERE email = $1', [shopEmail]);
  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '30 minutes')`,
    [crypto.randomUUID(), rows[0].id, tokenHash],
  );

  const reset = await call('/api/auth/reset-password', {
    method: 'POST',
    body: { token: rawToken, password: 'new-password-123' },
  });
  assert(reset.status === 200, `reset status=${reset.status} ${JSON.stringify(reset.data)}`);

  // 기존 세션은 무효화되어야 한다
  const me = await call('/api/auth/me', { token: shopToken });
  assert(me.status === 401, `revoked session status=${me.status}`);

  // 옛 비밀번호는 거부, 새 비밀번호는 허용
  const oldLogin = await call('/api/auth/login', { method: 'POST', body: { email: shopEmail, password: temporaryPassword } });
  assert(oldLogin.status === 401, `old password status=${oldLogin.status}`);
  const newLogin = await call('/api/auth/login', { method: 'POST', body: { email: shopEmail, password: 'new-password-123' } });
  assert(newLogin.status === 200, `new password status=${newLogin.status}`);
  shopToken = newLogin.data.token;

  // 같은 토큰 재사용은 거부
  const reuse = await call('/api/auth/reset-password', {
    method: 'POST',
    body: { token: rawToken, password: 'another-password-123' },
  });
  assert(reuse.status === 400, `reuse status=${reuse.status}`);
});

await test('발송사 미설정 시 발송이 pending으로 정직 기록된다', async () => {
  const send = await call('/api/messages/send', {
    method: 'POST',
    token: shopToken,
    body: { type: 'sms', content: '테스트 메시지', phones: ['010-1234-5678', '010-1234-5678', '02-555-0100'] },
  });
  assert(send.status === 200, `status=${send.status} ${JSON.stringify(send.data)}`);
  assert(send.data.pending === true, `pending=${send.data.pending}`);
  // 중복 번호는 1건으로 합쳐져 총 2건 로그
  const { rows } = await pool.query("SELECT status FROM message_send_log WHERE phone IN ('01012345678','025550100')");
  assert(rows.length === 2 && rows.every(r => r.status === 'pending'), `log rows=${rows.length}`);
});

await test('전화번호 없이 발송하면 400이다', async () => {
  const send = await call('/api/messages/send', {
    method: 'POST',
    token: shopToken,
    body: { type: 'sms', content: '테스트', phones: [] },
  });
  assert(send.status === 400, `status=${send.status}`);
});

await test('예약 발송 등록·조회·취소가 동작한다', async () => {
  const scheduled = await call('/api/messages/schedule', {
    method: 'POST',
    token: shopToken,
    body: {
      sendAt: new Date(Date.now() + 10 * 60000).toISOString(),
      type: 'sms', content: '예약 테스트', phones: ['010-9999-8888'],
    },
  });
  assert(scheduled.status === 201, `status=${scheduled.status} ${JSON.stringify(scheduled.data)}`);
  const id = scheduled.data.scheduled.id;

  const list = await call('/api/messages/scheduled', { token: shopToken });
  assert(list.status === 200 && list.data.scheduled.some(s => s.id === id && s.status === 'pending'), '목록에 없음');

  const cancel = await call(`/api/messages/scheduled/${id}`, { method: 'DELETE', token: shopToken });
  assert(cancel.status === 204, `cancel status=${cancel.status}`);

  const after = await call('/api/messages/scheduled', { token: shopToken });
  assert(after.data.scheduled.find(s => s.id === id)?.status === 'canceled', '취소 반영 안 됨');
});

await test('과거 시각 예약은 400이다', async () => {
  const scheduled = await call('/api/messages/schedule', {
    method: 'POST',
    token: shopToken,
    body: { sendAt: new Date(Date.now() - 60000).toISOString(), type: 'sms', content: 'x', phones: ['01011112222'] },
  });
  assert(scheduled.status === 400, `status=${scheduled.status}`);
});

await test('시술 사진이 저장·조회·삭제된다 (지점 격리 포함)', async () => {
  const entityKey = encodeURIComponent('treatment:t1');
  const photos = [{ id: 'ph_1', dataUrl: 'data:image/jpeg;base64,dGVzdA==', takenAt: '2026-07-15' }];

  const put = await call(`/api/photos/${entityKey}`, { method: 'PUT', token: shopToken, body: { photos } });
  assert(put.status === 200 && put.data.saved === 1, `put status=${put.status}`);

  const get = await call(`/api/photos/${entityKey}`, { token: shopToken });
  assert(get.status === 200 && get.data.photos.length === 1 && get.data.photos[0].id === 'ph_1', 'photos 조회 불일치');

  const other = await call(`/api/photos/${entityKey}`, { token: shop2Token });
  assert(other.status === 200 && other.data.photos.length === 0, '다른 지점에 사진이 보임');

  // 배치 조회: 존재하는 키만 entries에 담긴다
  const batch = await call('/api/photos/batch', {
    method: 'POST', token: shopToken,
    body: { keys: ['treatment:t1', 'treatment:none'] },
  });
  assert(batch.status === 200, `batch status=${batch.status}`);
  assert(Array.isArray(batch.data.entries['treatment:t1']), '배치에 저장 키 누락');
  assert(batch.data.entries['treatment:none'] === undefined, '없는 키가 배치에 포함됨');

  // 삭제는 행 제거가 아니라 빈 배열 tombstone — 다른 기기의 옛 캐시가 부활 못 하도록
  const clear = await call(`/api/photos/${entityKey}`, { method: 'PUT', token: shopToken, body: { photos: [] } });
  assert(clear.status === 200, `clear status=${clear.status}`);
  const after = await call(`/api/photos/${entityKey}`, { token: shopToken });
  assert(after.data.exists === true && after.data.photos.length === 0, 'tombstone이 유지되지 않음');
});

await test('프로필(매장 전화·주소)이 저장된다', async () => {
  const patch = await call('/api/auth/profile', {
    method: 'PATCH',
    token: shopToken,
    body: { shopName: '아르케스파 1호점', shopType: '에스테틱샵', shopPhone: '02-1234-5678', shopAddress: '서울시 강남구' },
  });
  assert(patch.status === 200, `status=${patch.status}`);
  assert(patch.data.user.shopPhone === '02-1234-5678', `shopPhone=${patch.data.user.shopPhone}`);
});

await pool.end();

if (failures > 0) {
  console.error(`\n${failures}개 테스트 실패`);
  process.exit(1);
}
console.log('\n모든 스모크 테스트 통과');
