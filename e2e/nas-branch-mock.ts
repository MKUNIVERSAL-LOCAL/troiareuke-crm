import type { Page, Route } from '@playwright/test';


/**
 * 지점 앱 — **정상 동작하는** NAS 응답 흉내 (325).
 *
 * `nas-admin-mock.ts` 와 같은 뜻: `branch-nas.spec.ts` 의 mock 은 **PG 준비 중 → 활성** 처럼 상태를
 * 바꿔 가며 그 변화를 단언하는 것이 목적이라, 접근성 쓸이가 쓰기엔 결이 다르다. 쓸이는 창이
 * **열리는 상태 하나**만 필요하다(여기서는 PG 가 켜진 상태). 실제 NAS 로는 어떤 요청도 나가지 않는다.
 *
 * 왜 필요한가: `check:modal-a11y` 의 `결제 요청` 창 면제 사유가 "로컬 모드 게이트로는 띄울 수 없다"
 * 였다 — 사실이지만 322·323 에서 어드민 쪽에 쓴 길(흉내 서버 빌드 + axe)이 지점 쪽에도 그대로 통한다.
 */

export const API = 'https://crm-api.mkcorp.familyds.com';
export const UPDATE = 'https://crm-update.mkcorp.familyds.com';

export const BRANCH_ADMIN = {
  id: 'u-br-1', email: 'branch@example.test', name: '김대표', phone: '010-1234-5678', shopName: '테스트지점',
  shopType: 'esthetic', plan: 'pro', trialEndsAt: '2030-01-01T00:00:00.000Z', isOnboarded: true, role: 'admin',
  branchId: 'b-1', branchName: '테스트지점', isActive: true, status: 'approved',
  createdAt: '2026-06-01T00:00:00.000Z', serviceEndsAt: null,
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** 흉내 내지 않은 경로 — 쓸이 끝에 확인해 "조용히 404 로 빈 화면" 을 잡는다 */
export const unmocked: string[] = [];

export async function installHealthyBranchNas(page: Page): Promise<void> {
  unmocked.length = 0;
  await page.route(`${API}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route(`${UPDATE}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route('https://cdn.iamport.kr/**', route => route.abort()); // 결제 스크립트 — 창을 그리는 데 쓰이지 않는다

  await page.route(`${API}/api/auth/login`, route => json(route, { token: 'test-token', user: BRANCH_ADMIN }));
  await page.route(`${API}/api/auth/me`, route => json(route, { user: BRANCH_ADMIN }));
  await page.route(`${API}/api/auth/logout`, route => route.fulfill({ status: 204 }));
  await page.route(`${API}/api/data/**`, route => (route.request().method() === 'GET' ? json(route, { rows: [] }) : json(route, { ok: true })));
  await page.route(`${API}/api/feature-flags**`, route => json(route, { global: {}, appLockResetAt: null }));
  await page.route(`${API}/api/announcements**`, route => json(route, { announcements: [] }));
  await page.route(`${API}/api/ai/status**`, route => json(route, { enabled: false, providers: [], monthlyLimit: 0, usedThisMonth: 0, remaining: 0 }));
  // PG 가 **켜진** 상태 — 결제 요청 창이 안내문이 아니라 입력 폼으로 열린다(쓸이가 보려는 상태)
  await page.route(`${API}/api/payments/pg-config`, route => json(route, { enabled: true, methods: ['card', 'vbank'] }));
  // 331(328~330 리뷰 M-5): 328 이 여기에 "보낸 값을 되돌려 준다" 는 코드를 넣고 그 이유로 "흉내가
  // 빼먹으면 목록 행이 undefined원 으로 그려진다" 고 적었는데, **이 흉내에서는 일어날 수 없다** —
  // 이 흉내를 쓰는 유일한 스펙(`a11y-branch-nas`)은 창을 열어 쓸이만 돌리고 POST 를 보내지 않으며,
  // GET 은 늘 빈 목록을 돌려준다. 읽히지 않는 필드와 타입이었다(CLAUDE.md 2절). 지웠다.
  // 보낸 값을 되돌려 주는 흉내가 정말 필요한 쪽은 `branch-nas.spec.ts` 이고, 거기엔 이미 있다.
  await page.route(`${API}/api/payments/requests`, route => (route.request().method() === 'POST'
    ? json(route, { request: { id: 'pr-1', status: 'pending', paidAt: null, expiresAt: '2030-01-01T00:00:00.000Z', createdAt: '2026-11-27T00:00:00.000Z', url: `${API}/pay/pr-1` } })
    : json(route, { enabled: true, requests: [] })));
  await page.route(`${UPDATE}/portable/latest.json**`, route => json(route, { version: '1.0.63', releaseDate: '2026-11-25' }));
}

export async function loginAsBranchAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('이메일', { exact: true }).fill(BRANCH_ADMIN.email);
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password-only-for-mock');
  await page.locator('form button[type="submit"]').first().click();
}
