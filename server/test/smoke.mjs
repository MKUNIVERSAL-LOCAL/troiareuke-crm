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
let shopBranchId = '';
let shopUserId = '';
let shop2BranchId = '';

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
  shopBranchId = data.user.branchId;
  shopUserId = data.user.id;
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

await test('빈 요청 본문과 잘못된 관리자 입력은 500이 아닌 검증 오류다', async () => {
  const login = await call('/api/auth/login', { method: 'POST', body: {} });
  assert(login.status === 401 && typeof login.data?.error === 'string', `login status=${login.status}`);
  const profile = await call('/api/auth/profile', { method: 'PATCH', token: shopToken, body: {} });
  assert(profile.status === 400 && typeof profile.data?.error === 'string', `profile status=${profile.status}`);
  const invalidBoolean = await call(`/api/admin/users/${shopUserId}`, {
    method: 'PATCH', token: adminToken, body: { isActive: 'false' },
  });
  assert(invalidBoolean.status === 400, `isActive status=${invalidBoolean.status}`);
  const invalidUuid = await call('/api/admin/users/not-a-uuid', {
    method: 'PATCH', token: adminToken, body: { plan: 'pro' },
  });
  assert(invalidUuid.status === 404, `uuid status=${invalidUuid.status}`);
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
  shop2BranchId = login.data.user.branchId;
  const get = await call('/api/data/customers', { token: shop2Token });
  assert(get.status === 200 && get.data.rows.length === 0, `rows=${get.data?.rows?.length}`);
});

await test('잘못된 행이 섞인 대량 저장은 전체 거부된다', async () => {
  const put = await call('/api/data/customers', {
    method: 'PUT', token: shopToken,
    body: { rows: [{ id: 'valid-before-invalid', name: '저장되면안됨' }, { name: '식별자없음' }] },
  });
  assert(put.status === 400, `status=${put.status}`);
  const get = await call('/api/data/customers', { token: shopToken });
  assert(!get.data.rows.some(row => row.id === 'valid-before-invalid'), '부분 저장이 발생함');
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
      type: 'sms', content: '예약 테스트', phones: ['010-9999-8888', '01099998888'],
    },
  });
  assert(scheduled.status === 201, `status=${scheduled.status} ${JSON.stringify(scheduled.data)}`);
  const id = scheduled.data.scheduled.id;

  const list = await call('/api/messages/scheduled', { token: shopToken });
  assert(list.status === 200 && list.data.scheduled.some(s => s.id === id && s.status === 'pending'), '목록에 없음');
  assert(list.data.scheduled.find(s => s.id === id)?.phones.length === 1, '중복 번호가 제거되지 않음');

  const crossBranchCancel = await call(`/api/messages/scheduled/${id}`, { method: 'DELETE', token: shop2Token });
  assert(crossBranchCancel.status === 404, `cross branch status=${crossBranchCancel.status}`);

  const invalidId = await call('/api/messages/scheduled/not-a-uuid', { method: 'DELETE', token: shopToken });
  assert(invalidId.status === 404, `invalid id status=${invalidId.status}`);

  const cancel = await call(`/api/messages/scheduled/${id}`, { method: 'DELETE', token: shopToken });
  assert(cancel.status === 204, `cancel status=${cancel.status}`);

  const after = await call('/api/messages/scheduled', { token: shopToken });
  assert(after.data.scheduled.find(s => s.id === id)?.status === 'canceled', '취소 반영 안 됨');
});

await test('잘못된 사진 데이터는 저장하지 않는다', async () => {
  const put = await call('/api/photos/invalid-photo', {
    method: 'PUT', token: shopToken,
    body: { photos: [{ id: 'ph-bad', dataUrl: 'javascript:alert(1)' }] },
  });
  assert(put.status === 400, `status=${put.status}`);
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

await test('슈퍼어드민이 전체 지점 현황을 조회한다', async () => {
  const { status, data } = await call('/api/admin/overview', { token: adminToken });
  assert(status === 200 && Array.isArray(data?.branches), `status=${status}`);
  const branch = data.branches.find(item => item.branchId === shopBranchId);
  assert(branch, `branchId=${shopBranchId} 누락`);
  assert(branch.branchName === '아르케스파 1호점', `branchName=${branch.branchName}`);
  assert(typeof branch.userCount === 'number', 'userCount 형식 불일치');
  assert(typeof branch.recordCounts === 'object' && typeof branch.recordCounts.customers === 'number', 'recordCounts 형식 불일치');
  assert(typeof branch.photoCount === 'number' && typeof branch.messageCount === 'number', '집계 형식 불일치');
  assert(branch.lastActivity === null || typeof branch.lastActivity === 'string', 'lastActivity 형식 불일치');
});

await test('슈퍼어드민이 지점 컬렉션 데이터를 검색·조회한다', async () => {
  const saved = await call('/api/data/customers', {
    method: 'PUT', token: shopToken,
    body: { rows: [{ id: 'admin-view-1', name: '관리자조회대상' }] },
  });
  assert(saved.status === 200, `seed status=${saved.status}`);
  const path = `/api/admin/data/${encodeURIComponent(shopBranchId)}/customers?q=${encodeURIComponent('관리자조회대상')}&limit=200&offset=0`;
  const { status, data } = await call(path, { token: adminToken });
  assert(status === 200 && typeof data?.total === 'number' && Array.isArray(data?.rows), `status=${status}`);
  const row = data.rows.find(item => item.id === 'admin-view-1');
  assert(row?.data?.name === '관리자조회대상', '검색 결과 누락');
  assert(typeof row.updatedAt === 'string', 'updatedAt 형식 불일치');
});

await test('슈퍼어드민 일반 데이터 API는 지점 데이터에 쓰기 접근하지 않는다', async () => {
  const patch = await call('/api/data/customers/admin-view-1', {
    method: 'PATCH', token: adminToken, body: { updates: { name: '스코프침범' } },
  });
  assert(patch.status === 404, `patch status=${patch.status}`);
  const tenant = await call('/api/data/customers', { token: shopToken });
  assert(tenant.data.rows.find(row => row.id === 'admin-view-1')?.name === '관리자조회대상', '지점 데이터가 변경됨');
  const other = await call('/api/data/customers', { token: shop2Token });
  assert(!other.data.rows.some(row => row.id === 'admin-view-1'), `다른 지점(${shop2BranchId})에 데이터 노출`);
});

await test('슈퍼어드민이 지점 메시지 로그와 예약을 조회한다', async () => {
  const { status, data } = await call(`/api/admin/messages/${encodeURIComponent(shopBranchId)}`, { token: adminToken });
  assert(status === 200, `status=${status}`);
  assert(Array.isArray(data?.sendLog) && data.sendLog.length >= 1, 'sendLog 형식 불일치');
  assert(Array.isArray(data?.scheduled) && data.scheduled.length >= 1, 'scheduled 형식 불일치');
});

await test('슈퍼어드민이 지점 사진 개수만 조회한다', async () => {
  const { status, data } = await call(`/api/admin/photos/${encodeURIComponent(shopBranchId)}`, { token: adminToken });
  assert(status === 200 && Array.isArray(data?.entities), `status=${status}`);
  const entity = data.entities.find(item => item.entityKey === 'treatment:t1');
  assert(entity && typeof entity.photoCount === 'number' && typeof entity.updatedAt === 'string', 'entities 형식 불일치');
  assert(entity.photos === undefined, '사진 본문이 노출됨');
});

await test('일반 계정은 슈퍼어드민 데이터 조회 API 4종에 접근할 수 없다', async () => {
  const paths = [
    '/api/admin/overview',
    `/api/admin/data/${encodeURIComponent(shopBranchId)}/customers`,
    `/api/admin/messages/${encodeURIComponent(shopBranchId)}`,
    `/api/admin/photos/${encodeURIComponent(shopBranchId)}`,
  ];
  for (const path of paths) {
    const { status } = await call(path, { token: shopToken });
    assert(status === 403, `${path} status=${status}`);
  }
});

await test('지점별 백업이 CRM-BACKUP 구조로 파일을 만든다', async () => {
  // 백업할 데이터 준비
  await call('/api/data/customers', {
    method: 'PUT', token: shopToken,
    body: { rows: [{ id: 'c2', name: '김백업', branch_id: 'ignored' }] },
  });

  // 일반 계정은 백업 트리거 불가
  const forbidden = await call('/api/admin/backup', { method: 'POST', token: shopToken });
  assert(forbidden.status === 403, `non-admin status=${forbidden.status}`);

  const res = await call('/api/admin/backup', { method: 'POST', token: adminToken });
  assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.branches >= 1 && res.data.files >= 1, `branches=${res.data.branches} files=${res.data.files}`);

  // 실제 파일 확인: <지점폴더>/<날짜>/customers.json 안에 김백업이 있어야 한다
  const fsMod = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const backupRoot = process.env.BACKUP_DIR;
  const branchDirs = await fsMod.readdir(backupRoot);
  let found = false;
  let successMarkerFound = false;
  for (const branchDir of branchDirs) {
    const dates = await fsMod.readdir(pathMod.join(backupRoot, branchDir));
    for (const date of dates) {
      try {
        const raw = await fsMod.readFile(pathMod.join(backupRoot, branchDir, date, 'customers.json'), 'utf8');
        if (raw.includes('김백업')) {
          found = true;
          const marker = await fsMod.readFile(pathMod.join(backupRoot, branchDir, date, '_SUCCESS.json'), 'utf8');
          successMarkerFound = JSON.parse(marker).branchId === shopBranchId;
        }
      } catch { /* 해당 지점엔 customers 없음 */ }
    }
  }
  assert(found, 'customers.json에 백업 데이터가 없음');
  assert(successMarkerFound, '완료 마커가 없거나 지점 정보가 다름');
});

await test('사용기간(serviceEndsAt) 설정·만료 차단·해제가 동작한다', async () => {
  // 1) 미래 날짜 설정 — 로그인 유지, 응답에 serviceEndsAt 노출
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const setFuture = await call(`/api/admin/users/${shopUserId}`, {
    method: 'PATCH', token: adminToken, body: { serviceEndsAt: future },
  });
  assert(setFuture.status === 200, `set status=${setFuture.status} ${JSON.stringify(setFuture.data)}`);
  assert(typeof setFuture.data.user.serviceEndsAt === 'string', 'serviceEndsAt 미노출');
  const okLogin = await call('/api/auth/login', {
    method: 'POST', body: { email: shopEmail, password: 'new-password-123' },
  });
  assert(okLogin.status === 200, `future login status=${okLogin.status}`);

  // 2) 과거 날짜로 단축 — 기존 세션 즉시 종료 + 로그인 403
  const setPast = await call(`/api/admin/users/${shopUserId}`, {
    method: 'PATCH', token: adminToken, body: { serviceEndsAt: '2020-01-01' },
  });
  assert(setPast.status === 200, `past status=${setPast.status}`);
  const revoked = await call('/api/auth/me', { token: okLogin.data.token });
  assert(revoked.status === 401, `revoked status=${revoked.status}`);
  const blockedLogin = await call('/api/auth/login', {
    method: 'POST', body: { email: shopEmail, password: 'new-password-123' },
  });
  assert(blockedLogin.status === 403, `expired login status=${blockedLogin.status}`);
  assert(String(blockedLogin.data?.error || '').includes('사용 기간'), `error=${blockedLogin.data?.error}`);

  // 3) 잘못된 날짜는 400
  const invalid = await call(`/api/admin/users/${shopUserId}`, {
    method: 'PATCH', token: adminToken, body: { serviceEndsAt: 'not-a-date' },
  });
  assert(invalid.status === 400, `invalid status=${invalid.status}`);

  // 4) null로 해제 — 무제한 복귀, 로그인 가능 (이후 테스트를 위해 shopToken 갱신)
  const clear = await call(`/api/admin/users/${shopUserId}`, {
    method: 'PATCH', token: adminToken, body: { serviceEndsAt: null },
  });
  assert(clear.status === 200 && clear.data.user.serviceEndsAt === null, `clear status=${clear.status}`);
  const restored = await call('/api/auth/login', {
    method: 'POST', body: { email: shopEmail, password: 'new-password-123' },
  });
  assert(restored.status === 200, `restored login status=${restored.status}`);
  shopToken = restored.data.token;
});

await test('어드민 통계·손익이 실데이터 형태(snake_case)를 집계한다', async () => {
  // 클라이언트 toDbPayment/toDbExpense와 동일한 snake_case 행을 심는다
  const thisMonth = new Date().toISOString().slice(0, 7);
  const year = thisMonth.slice(0, 4);
  await call('/api/data/payments', {
    method: 'PUT', token: shopToken,
    body: {
      rows: [{
        id: 'pnl-pay-1', payment_date: `${thisMonth}-05`, type: 'single_treatment',
        type_label: '단건 시술', amount: 110000, payment_method: '카드',
        discount_amount: 0, status: 'completed', created_at: new Date().toISOString(),
      }],
    },
  });
  await call('/api/data/expenses', {
    method: 'PUT', token: shopToken,
    body: {
      rows: [{
        id: 'pnl-exp-1', expense_date: `${thisMonth}-06`, category: '제품 매입',
        description: '테스트 매입', amount: 40000, payment_method: '계좌이체',
        created_at: new Date().toISOString(),
      }],
    },
  });

  // analytics: 월별 매출 버킷에 잡혀야 한다 (camelCase 조회 회귀 방지)
  const analytics = await call('/api/admin/analytics', { token: adminToken });
  assert(analytics.status === 200, `analytics status=${analytics.status}`);
  const branch = analytics.data.branches.find(b => b.branchId === shopBranchId);
  assert(branch, '지점 누락');
  const monthBucket = branch.revenueMonthly.find(m => m.month === thisMonth);
  assert(monthBucket && monthBucket.revenue >= 110000, `월별 매출 미집계: ${JSON.stringify(branch.revenueMonthly)}`);

  // pnl: 매출 구분·지출 분류가 월 단위로 집계돼야 한다
  const pnl = await call(`/api/admin/pnl?year=${year}`, { token: adminToken });
  assert(pnl.status === 200, `pnl status=${pnl.status}`);
  const rev = pnl.data.revenue.find(r => r.branchId === shopBranchId && r.month === thisMonth && r.type === 'treatment');
  assert(rev && rev.amount >= 110000, `pnl 매출 미집계: ${JSON.stringify(pnl.data.revenue)}`);
  const exp = pnl.data.expenses.find(x => x.branchId === shopBranchId && x.month === thisMonth && x.category === '제품 매입');
  assert(exp && exp.amount >= 40000, `pnl 지출 미집계: ${JSON.stringify(pnl.data.expenses)}`);

  // 일반 계정 접근 차단
  const forbidden = await call(`/api/admin/pnl?year=${year}`, { token: shopToken });
  assert(forbidden.status === 403, `pnl forbidden status=${forbidden.status}`);
});

await test('결제 요청 링크 생성·페이지·취소가 동작한다', async () => {
  // pg-config: CI는 더미 TOSS 키가 설정돼 enabled=true
  const config = await call('/api/payments/pg-config', { token: shopToken });
  assert(config.status === 200 && config.data.enabled === true, `config=${JSON.stringify(config.data)}`);

  // 금액 검증
  const badAmount = await call('/api/payments/requests', {
    method: 'POST', token: shopToken, body: { amount: 500, orderName: '소액' },
  });
  assert(badAmount.status === 400, `bad amount status=${badAmount.status}`);

  // 생성
  const created = await call('/api/payments/requests', {
    method: 'POST', token: shopToken,
    body: { amount: 55000, orderName: '아쿠아필 1회', method: 'both', customerName: '김테스트' },
  });
  assert(created.status === 201, `create status=${created.status} ${JSON.stringify(created.data)}`);
  const request = created.data.request;
  assert(request.url.includes(`/pay/${request.id}`), `url=${request.url}`);

  // 고객용 결제 페이지 (공개, HTML)
  const pageResponse = await fetch(`${API}/pay/${request.id}`);
  const pageHtml = await pageResponse.text();
  assert(pageResponse.status === 200, `page status=${pageResponse.status}`);
  assert(pageHtml.includes('아쿠아필 1회') && pageHtml.includes('55,000'), '결제 페이지에 주문 정보 누락');
  assert(pageHtml.includes('tosspayments.com/v1/payment'), '결제 SDK 미포함');

  // 목록 (지점 스코프)
  const list = await call('/api/payments/requests', { token: shopToken });
  assert(list.status === 200 && list.data.requests.some(r => r.id === request.id), '목록에 없음');
  const otherList = await call('/api/payments/requests', { token: shop2Token });
  assert(!otherList.data.requests.some(r => r.id === request.id), '다른 지점에 결제 요청 노출');

  // 타 지점은 취소 불가
  const crossCancel = await call(`/api/payments/requests/${request.id}/cancel`, { method: 'POST', token: shop2Token });
  assert(crossCancel.status === 404, `cross cancel status=${crossCancel.status}`);

  // 취소 → 페이지가 취소 안내로 바뀐다
  const cancel = await call(`/api/payments/requests/${request.id}/cancel`, { method: 'POST', token: shopToken });
  assert(cancel.status === 200 && cancel.data.request.status === 'canceled', `cancel=${JSON.stringify(cancel.data)}`);
  const canceledHtml = await (await fetch(`${API}/pay/${request.id}`)).text();
  assert(canceledHtml.includes('취소'), '취소 페이지 미표시');

  // 웹훅은 검증 실패 시에도 200 (토스 재시도 폭주 방지) + 상태 불변
  const webhook = await call('/api/payments/webhook', { method: 'POST', body: { orderId: request.id, status: 'DONE' } });
  assert(webhook.status === 200, `webhook status=${webhook.status}`);
  const after = await call('/api/payments/requests', { token: shopToken });
  assert(after.data.requests.find(r => r.id === request.id)?.status === 'canceled', '웹훅이 취소 건을 변조함');
});

await test('결제 페이지가 스크립트 주입을 이스케이프한다 (XSS 회귀 방지)', async () => {
  const payload = '</scr' + 'ipt><img src=x onerror=alert(1)>';
  const created = await call('/api/payments/requests', {
    method: 'POST', token: shopToken,
    body: { amount: 12000, orderName: payload, method: 'card', customerName: payload },
  });
  assert(created.status === 201, `create status=${created.status}`);
  const id = created.data.request.id;

  const html = await (await fetch(`${API}/pay/${id}`)).text();
  assert(!html.includes('</scr' + 'ipt><img'), '스크립트 종료 태그가 그대로 출력됨(XSS)');
  assert(!html.includes('onerror=alert(1)'), '이벤트 핸들러가 원문으로 출력됨(XSS)');
  assert(html.includes('\\u003c'), '인라인 스크립트 값이 유니코드 이스케이프되지 않음');
  // 본문 표시부는 HTML 엔티티로 이스케이프되어야 한다
  assert(html.includes('&lt;') , '본문 표시부 이스케이프 누락');

  await call(`/api/payments/requests/${id}/cancel`, { method: 'POST', token: shopToken });
});

await test('공지사항 생성·게시·수정·삭제가 동작한다', async () => {
  // 어드민이 공지 생성
  const created = await call('/api/admin/announcements', {
    method: 'POST', token: adminToken,
    body: { title: 'v-test 업데이트 안내', content: '지출·손익계산서 기능이 추가되었습니다.', type: 'update', isActive: true },
  });
  assert(created.status === 201, `create status=${created.status} ${JSON.stringify(created.data)}`);
  const annId = created.data.announcement.id;

  // 지점 계정에서 게시 중 공지가 보인다
  const visible = await call('/api/announcements', { token: shopToken });
  assert(visible.status === 200, `list status=${visible.status}`);
  assert(visible.data.announcements.some(a => a.id === annId), '지점에 공지가 안 보임');

  // 숨기면 지점 목록에서 사라진다
  const hide = await call(`/api/admin/announcements/${annId}`, {
    method: 'PATCH', token: adminToken, body: { isActive: false },
  });
  assert(hide.status === 200, `hide status=${hide.status}`);
  const hidden = await call('/api/announcements', { token: shopToken });
  assert(!hidden.data.announcements.some(a => a.id === annId), '숨긴 공지가 지점에 보임');

  // 일반 계정은 어드민 공지 API 접근 불가
  const forbidden = await call('/api/admin/announcements', { token: shopToken });
  assert(forbidden.status === 403, `forbidden status=${forbidden.status}`);

  // 빈 제목은 400
  const invalid = await call('/api/admin/announcements', {
    method: 'POST', token: adminToken, body: { title: '', content: 'x' },
  });
  assert(invalid.status === 400, `invalid status=${invalid.status}`);

  // 삭제
  const del = await call(`/api/admin/announcements/${annId}`, { method: 'DELETE', token: adminToken });
  assert(del.status === 204, `delete status=${del.status}`);
});

await test('운영 조회용 인덱스와 복구 컬럼이 생성된다', async () => {
  const { rows: indexRows } = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname::text = ANY($1::text[])
  `, [[
    'crm_records_branch_collection_updated_idx',
    'scheduled_messages_branch_send_idx',
    'scheduled_messages_stale_idx',
    'message_send_log_reminder_idx',
  ]]);
  assert(indexRows.length === 4, `index count=${indexRows.length}`);
  const { rows: columnRows } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name IN ('scheduled_messages', 'message_send_log')
      AND column_name IN ('attempt_count', 'scheduled_message_id')
  `);
  assert(columnRows.length === 2, `column count=${columnRows.length}`);
});

await pool.end();

if (failures > 0) {
  console.error(`\n${failures}개 테스트 실패`);
  process.exit(1);
}
console.log('\n모든 스모크 테스트 통과');
