import type { Page, Route } from '@playwright/test';

/**
 * 어드민 콘솔 — **정상 동작하는** NAS 응답 흉내 (322).
 *
 * 왜 따로 두는가: `admin-nas.spec.ts` 의 mock 은 **고장 시나리오**(매니페스트 끊김·플래그 503·AI 미배포)를
 * 켜 두고 그 상태를 단언하는 것이 목적이다. 접근성 쓸이는 그 반대가 필요하다 — 표에 행이 있고 창이
 * 열리는 **건강한 서버**. 두 목적이 서로를 깨지 않게 모듈을 나눴다(같은 호스트·같은 포괄 404 규칙).
 * 실제 NAS 로는 어떤 요청도 나가지 않는다.
 *
 * 321 까지 `check:modal-a11y` 의 어드민 창 면제 11건은 "접근성 게이트가 로컬 모드 빌드라 서버 행이
 * 없다" 가 사유였다. 그 사유를 없애려면 **게이트 쪽에 흉내 서버를 붙이는** 수밖에 없다 — 이 파일이 그것이다.
 */

export const API = 'https://crm-api.mkcorp.familyds.com';
export const UPDATE = 'https://crm-update.mkcorp.familyds.com';

export const SUPERADMIN = {
  id: 'sa-1', email: 'hq@example.test', name: '본사', shopName: '본사', shopType: 'hq', plan: 'enterprise',
  trialEndsAt: '2030-01-01T00:00:00.000Z', isOnboarded: true, role: 'superadmin', isActive: true,
  status: 'approved', createdAt: '2026-01-01T00:00:00.000Z',
};

const branch = (o: { id: string; email: string; branchId: string; branchName: string } & Record<string, unknown>) => ({
  name: o.branchName, shopName: o.branchName, shopType: 'esthetic', plan: 'pro', trialEndsAt: '2030-01-01T00:00:00.000Z',
  isOnboarded: true, role: 'admin', isActive: true, status: 'approved', createdAt: '2026-06-01T00:00:00.000Z',
  lastAppMode: 'portable', serviceEndsAt: null, lastAppVersion: '1.0.63', lastSeenAt: '2026-11-26T01:00:00.000Z', ...o,
});

export const USERS = [
  branch({ id: 'u-gn-admin', email: 'gangnam@example.test', branchId: 'b-gn', branchName: '강남점' }),
  branch({ id: 'u-pending', email: 'pending@example.test', branchId: 'b-pending', branchName: '신청만한점', status: 'pending', isOnboarded: false, lastAppVersion: null }),
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** 흉내 내지 않은 경로 — 쓸이 끝에 0 인지 확인해 "조용히 404 로 빈 화면" 을 잡는다 */
export const unmocked: string[] = [];

export async function installHealthyNas(page: Page): Promise<void> {
  unmocked.length = 0;
  await page.route(`${API}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route(`${UPDATE}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route('https://cdn.iamport.kr/**', route => route.abort()); // index.html 의 결제 스크립트 — 어드민과 무관

  await page.route(`${API}/api/auth/login`, route => json(route, { token: 'test-token', user: SUPERADMIN }));
  await page.route(`${API}/api/auth/me`, route => json(route, { user: SUPERADMIN }));
  await page.route(`${API}/api/auth/logout`, route => route.fulfill({ status: 204 }));
  await page.route(`${API}/api/admin/users`, route => json(route, { users: USERS }));
  await page.route(`${API}/api/admin/users/*/application`, route => json(route, {
    id: 'u-pending', email: 'pending@example.test', shopName: '신청만한점', shopType: 'esthetic',
    ownerName: '신청자', phone: '010-0000-0000', address: '서울시 어딘가 1-2',
    businessNumber: '123-45-67890', businessLicenseUrl: null, createdAt: '2026-11-20T00:00:00.000Z',
  }));
  await page.route(`${API}/api/admin/users/*`, route => (route.request().method() === 'PATCH'
    ? json(route, { user: { ...USERS[0], temporaryPassword: 'Temp-1234-abcd' } })
    : json(route, { user: USERS[0] })));
  await page.route(`${API}/api/admin/overview`, route => json(route, { branches: [
    { branchId: 'b-gn', branchName: '강남점', userCount: 1, recordCounts: { shop_settings: 1, customers: 12, reservations: 8, payments: 5 }, photoCount: 2, messageCount: 1, lastActivity: '2026-11-26T01:00:00.000Z' },
  ] }));
  await page.route(`${API}/api/admin/login-logs**`, route => json(route, { logs: [
    { id: 'l-1', email: 'gangnam@example.test', branchName: '강남점', at: '2026-11-26T01:00:00.000Z', ok: true, ip: '10.0.0.1', agent: 'portable' },
  ] }));
  await page.route(`${API}/api/announcements**`, route => json(route, { announcements: [] }));
  await page.route(`${API}/api/admin/announcements**`, route => json(route, { announcements: [
    { id: 'a-1', title: '점검 안내', body: '토요일 02시에 점검합니다.', level: 'info', startsAt: null, endsAt: null, isActive: true, createdAt: '2026-11-25T00:00:00.000Z' },
  ] }));
  await page.route(`${API}/api/admin/feature-flags**`, route => json(route, { scopes: {} }));
  await page.route(`${API}/api/feature-flags**`, route => json(route, { flags: {} }));
  await page.route(`${API}/api/admin/ai/summary**`, route => json(route, {
    month: '2026-11', calls: 12, inputTokens: 4000, outputTokens: 800, usd: '0.12', credits: '340',
    activeBranches: 1, failRate: 0, fallbackRate: 0, byModel: [{ provider: 'openai', model: 'gpt-4o-mini', calls: 12, usd: 0.12 }],
  }));
  await page.route(`${API}/api/admin/ai/branches**`, route => json(route, { branches: [
    { branchId: 'b-gn', branchName: '강남점', plan: 'pro', calls: 12, inputTokens: 4000, outputTokens: 800, usd: 0.12, creditsUsed: 340, creditsBalance: 660, lastCallAt: '2026-11-26T01:00:00.000Z' },
  ] }));
  await page.route(`${API}/api/admin/ai/credits/grant`, route => json(route, { balance: 1160 }));
  await page.route(`${API}/api/admin/backups**`, route => json(route, { backups: [
    { id: 'bk-1', branchId: 'b-gn', branchName: '강남점', at: '2026-11-26T02:00:00.000Z', bytes: 123456, kind: 'auto' },
  ] }));
  await page.route(`${UPDATE}/portable/latest.json**`, route => json(route, { version: '1.0.63', releaseDate: '2026-11-25' }));
}

export async function loginAsSuperadmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByPlaceholder('admin@troiareuke.com').fill(SUPERADMIN.email);
  await page.getByPlaceholder('••••••••••').fill('test-password-only-for-mock');
  await page.locator('form button[type="submit"]').first().click();
}
