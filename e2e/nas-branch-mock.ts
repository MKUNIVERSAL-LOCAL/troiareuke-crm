import type { Page, Route } from '@playwright/test';

/**
 * 서버가 돌려주는 결제 요청 행 — `src/lib/paymentLinks.ts` 의 `PaymentRequestRow` 중 흉내가 채우는 부분만.
 * 그 타입을 직접 가져오면 `authApi`(import.meta.env)까지 e2e 프로그램에 끌려와 `tsc -p e2e` 가 깨진다 —
 * e2e 는 **순수 모듈만** 가져온다(커밋 3a33fb3 실사고). 모양이 갈라지면 아래 단언이 먼저 깨진다.
 */
type MockPaymentRequest = {
  orderName?: string; amount?: number; method?: 'card' | 'vbank' | 'both';
  customerId?: string; customerName?: string; memo?: string;
};

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
  // 328: 만든 요청을 **되돌려 준다** — 서버는 보낸 `orderName`·`amount`·`method` 를 그대로 담아 주는데
  // 흉내가 그걸 빼먹으면 목록 행이 "undefined원" 으로 그려진다(리뷰 M-6, `PaymentRequestRow` 참고).
  await page.route(`${API}/api/payments/requests`, route => {
    if (route.request().method() !== 'POST') return json(route, { enabled: true, requests: [] });
    const sent = JSON.parse(route.request().postData() || '{}') as MockPaymentRequest;
    return json(route, {
      request: {
        id: 'pr-1', status: 'pending', paidAt: null,
        expiresAt: '2030-01-01T00:00:00.000Z', createdAt: '2026-11-27T00:00:00.000Z',
        url: `${API}/pay/pr-1`,
        orderName: sent.orderName ?? '테스트 결제', amount: sent.amount ?? 0, method: sent.method ?? 'card',
        customerId: sent.customerId, customerName: sent.customerName, memo: sent.memo,
      },
    });
  });
  await page.route(`${UPDATE}/portable/latest.json**`, route => json(route, { version: '1.0.63', releaseDate: '2026-11-25' }));
}

export async function loginAsBranchAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('이메일', { exact: true }).fill(BRANCH_ADMIN.email);
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password-only-for-mock');
  await page.locator('form button[type="submit"]').first().click();
}
