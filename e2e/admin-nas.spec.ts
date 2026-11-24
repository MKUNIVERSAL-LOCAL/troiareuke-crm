import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * 어드민 콘솔 — NAS(중앙 서버) 응답을 흉내 낸 E2E (8차 어드민 점검, 2026-11-20)
 * 빌드: dist-e2e-nas (VITE_AUTH_API_URL = 운영 crm-api 호스트 — CSP connect-src 때문에 다른 호스트를 쓸 수 없다).
 * 네트워크는 전부 page.route 로 가로챈다: 두 호스트(crm-api·crm-update)에 대한 모든 요청을 먼저 404 로 받는 포괄 라우트를 깔고,
 * 그 위에 시나리오별 응답을 얹는다. 실제 NAS 로는 어떤 요청도 나가지 않는다(끝에 미처리 요청 0 단언).
 *
 * 로컬 모드 빌드(a11y-admin·routes)는 표가 늘 비어 있어 8차 점검의 HIGH 세 건 — 승인 대기 신청자가 지점으로 집계,
 * 최신 버전 미확인 때 "모두 최신", 플래그 로드 실패 뒤 저장 — 을 어느 스펙도 잡지 못했다. 이 스펙이 그 세 건과 로드 실패 위장을 단언한다.
 */

const API = 'https://crm-api.mkcorp.familyds.com';
const UPDATE = 'https://crm-update.mkcorp.familyds.com';

const SUPERADMIN = {
  id: 'sa-1', email: 'hq@example.test', name: '본사', shopName: '본사', shopType: 'hq', plan: 'enterprise', trialEndsAt: '2030-01-01T00:00:00.000Z',
  isOnboarded: true, role: 'superadmin', isActive: true, status: 'approved', createdAt: '2026-01-01T00:00:00.000Z',
};
function branchUser(o: Partial<Record<string, unknown>> & { id: string; email: string; branchId: string; branchName: string }) {
  return {
    name: o.branchName, shopName: o.branchName, shopType: 'esthetic', plan: 'pro', trialEndsAt: '2030-01-01T00:00:00.000Z', isOnboarded: true,
    role: 'admin', isActive: true, status: 'approved', createdAt: '2026-06-01T00:00:00.000Z', lastAppMode: 'portable', serviceEndsAt: null, ...o,
  };
}
// 승인 2지점(강남·판교) + 승인 대기 1 + 거부 1. 강남엔 두 계정(관리자 v1.0.60·직원 v1.0.55 → 지점 대표 버전은 낮은 1.0.55 = 구버전)
const USERS = [
  branchUser({ id: 'u-gn-admin', email: 'gangnam@example.test', branchId: 'b-gn', branchName: '강남점', lastAppVersion: '1.0.60', lastSeenAt: '2026-11-20T01:00:00.000Z' }),
  branchUser({ id: 'u-gn-staff', email: 'gangnam-staff@example.test', branchId: 'b-gn', branchName: '강남점', role: 'staff', lastAppVersion: '1.0.55', lastSeenAt: '2026-11-19T09:00:00.000Z' }),
  branchUser({ id: 'u-pg-admin', email: 'pangyo@example.test', branchId: 'b-pg', branchName: '판교점', lastAppVersion: '1.0.60', lastSeenAt: '2026-11-20T02:00:00.000Z' }),
  branchUser({ id: 'u-pending', email: 'pending@example.test', branchId: 'b-pending', branchName: '신청만한점', status: 'pending', isOnboarded: false, lastAppVersion: null }),
  branchUser({ id: 'u-rejected', email: 'rejected@example.test', branchId: 'b-rejected', branchName: '거부된점', status: 'rejected', isOnboarded: false, lastAppVersion: null }),
];

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** 시나리오 스위치 — 테스트 중간에 바꿔 같은 라우트가 다른 응답을 낸다 */
const INITIAL = { manifestDown: true, flagsDown: true, announcementsDown: true, loginError: '', aiDeployed: false, aiGranted: 0 };
const state = { ...INITIAL };
const unmocked: string[] = [];
const aiGrants: { branchId: string; amount: number; note: string }[] = [];
// 재시도(CI retries 1)는 새 테스트처럼 시작해야 한다 — 테스트 중간에 바꾼 스위치가 남으면 첫 실패 원인이 가려진다 (리뷰 2026-11-20)
test.beforeEach(() => { Object.assign(state, INITIAL); unmocked.length = 0; aiGrants.length = 0; });

async function mockNas(page: Page) {
  // 포괄: 두 호스트로 가는 모든 요청 — 아래 라우트가 받지 않으면 404 (실제 서버로는 절대 나가지 않는다)
  await page.route(`${API}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route(`${UPDATE}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route('https://cdn.iamport.kr/**', route => route.abort()); // index.html 의 결제 스크립트 — 어드민과 무관, 오프라인에서도 같은 결과 (리뷰 2026-11-20)
  await page.route(`${API}/api/auth/login`, route => state.loginError ? json(route, { error: state.loginError }, 403) : json(route, { token: 'test-token', user: SUPERADMIN }));
  await page.route(`${API}/api/auth/me`, route => json(route, { user: SUPERADMIN }));
  await page.route(`${API}/api/auth/logout`, route => route.fulfill({ status: 204 }));
  await page.route(`${API}/api/admin/users`, route => json(route, { users: USERS }));
  // 파일럿 지표(166): 강남 전부 완료·활동 중, 판교 절반·뜸함, 승인 대기 지점은 집계에 없어야 한다
  await page.route(`${API}/api/admin/overview`, route => json(route, { branches: [
    { branchId: 'b-gn', branchName: '강남점', userCount: 2, recordCounts: { shop_settings: 1, staff: 2, services: 5, customers: 40, reservations: 30, payments: 20, treatment_logs: 10, customer_programs: 3 }, photoCount: 4, messageCount: 2, lastActivity: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    { branchId: 'b-pg', branchName: '판교점', userCount: 1, recordCounts: { shop_settings: 1, programs: 1, customers: 3 }, photoCount: 0, messageCount: 0, lastActivity: new Date(Date.now() - 20 * 86_400_000).toISOString() },
    { branchId: 'b-pending', branchName: '신청만한점', userCount: 1, recordCounts: { customers: 1 }, photoCount: 0, messageCount: 0, lastActivity: null },
  ] }));
  await page.route(`${API}/api/admin/login-logs**`, route => json(route, { logs: [] }));
  await page.route(`${API}/api/announcements**`, route => json(route, { announcements: [] }));
  await page.route(`${API}/api/admin/announcements**`, route => state.announcementsDown ? json(route, { error: '서버 점검 중' }, 503) : json(route, { announcements: [] }));
  await page.route(`${API}/api/admin/feature-flags**`, route => state.flagsDown ? json(route, { error: '서버 점검 중' }, 503) : json(route, { scopes: {} }));
  await page.route(`${API}/api/feature-flags**`, route => json(route, { flags: {} }));
  // AI 서비스 관리(162): 서버 모듈(161) 배포 전에는 404 → "미배포" 안내, 배포 뒤 요약·지점·크레딧 지급 계약(AI-GATEWAY-ARCHITECTURE 5절)
  await page.route(`${API}/api/admin/ai/summary**`, route => state.aiDeployed
    ? json(route, { month: '2026-11', calls: 123, inputTokens: 456000, outputTokens: 78000, usd: 1.23, credits: 3444, activeBranches: 2, failRate: 2, fallbackRate: 5, byModel: [{ provider: 'openai', model: 'gpt-4o-mini', calls: 100, usd: 0.5 }] })
    : json(route, { error: 'Not found' }, 404));
  await page.route(`${API}/api/admin/ai/branches**`, route => state.aiDeployed
    ? json(route, { branches: [
        { branchId: 'b-gn', branchName: '강남점', plan: 'pro', calls: 100, inputTokens: 400000, outputTokens: 70000, usd: 1.0, creditsUsed: 2800, creditsBalance: 200 + state.aiGranted, lastCallAt: '2026-11-24T10:00:00.000Z' },
        { branchId: 'b-pg', branchName: '판교점', plan: 'starter', calls: 23, inputTokens: 56000, outputTokens: 8000, usd: 0.23, creditsUsed: 644, creditsBalance: 356, lastCallAt: '2026-11-23T09:00:00.000Z' },
      ] })
    : json(route, { error: 'Not found' }, 404));
  await page.route(`${API}/api/admin/ai/credits/grant`, async route => {
    const body = route.request().postDataJSON() as { branchId: string; amount: number; note: string };
    aiGrants.push(body);
    state.aiGranted += body.amount;
    return json(route, { balance: 200 + state.aiGranted });
  });
  await page.route(`${UPDATE}/portable/latest.json**`, route => state.manifestDown ? route.abort('connectionfailed') : json(route, { version: '1.0.60', releaseDate: '2026-11-20' }));
}

async function adminLogin(page: Page) {
  await page.goto('/admin/login');
  await page.getByPlaceholder('admin@troiareuke.com').fill(SUPERADMIN.email);
  await page.getByPlaceholder('••••••••••').fill('test-password-only-for-mock');
  await page.locator('form button[type="submit"]').first().click();
}

test('어드민 콘솔(NAS 흉내): 승인된 지점만 집계, 최신 버전 미확인은 보류, 로드 실패는 저장 잠금·오류 표시', async ({ page }) => {
  test.slow();
  await mockNas(page);

  // ── 로그인 실패 사유는 서버 문구 그대로 (102 #28) ──
  state.loginError = '가입 심사 대기 중입니다. 본사 승인 후 로그인할 수 있습니다.'; // server.js 가 실제로 보내는 문구
  await adminLogin(page);
  await expect(page.getByText('가입 심사 대기 중입니다').first()).toBeVisible();
  state.loginError = '';
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });

  // ── 대시보드: 승인 대기·거부 신청자는 지점이 아니다 (102 #1) — 전체 지점 2, 사용자 3 ──
  const branchCard = page.getByTestId('admin-stat-전체 지점');
  await expect(branchCard.locator('.text-2xl')).toHaveText('2'); // 4(대기·거부 포함)가 아니라 2
  await expect(branchCard).toContainText('운영 중 2개');
  await expect(page.getByTestId('admin-stat-등록 사용자').locator('.text-2xl')).toHaveText('3');

  // ── 버전 패널: 배포 서버 응답 없음 → "모두 최신"이 아니라 판정 보류 (102 #5) → [다시 확인]이 실제로 다시 읽는다 (102 리뷰 M1) ──
  await expect(page.getByText('구버전 판정을 보류했습니다')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('모두 최신 버전입니다')).toHaveCount(0);
  state.manifestDown = false;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByText('구버전으로 실행 중인 지점 1곳')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('강남점').first()).toBeVisible(); // 직원 PC v1.0.55 가 지점 대표 버전(가장 낮은 버전)
  await expect(page.getByText('v1.0.55')).toBeVisible();
  await expect(page.getByText('신청만한점')).toHaveCount(0);

  // ── 파일럿 지표(166): 승인 2지점만, 덜 된 지점이 위, 남은 단계·활동 등급 ──
  const pilot = page.getByTestId('pilot-metrics');
  await expect(pilot.getByTestId('pilot-row')).toHaveCount(2, { timeout: 15_000 });
  await expect(pilot.getByTestId('pilot-stat-평균 초기 설정 완료율')).toContainText('67%'); // (33 + 100) / 2
  await expect(pilot.getByTestId('pilot-row').first()).toContainText('판교점');
  await expect(pilot.getByTestId('pilot-row').first()).toContainText('직원 1명 이상 · 고객 5명 이상 · 첫 예약 · 첫 결제');
  await expect(pilot.getByTestId('pilot-row').first()).toContainText('뜸함(30일)');
  await expect(pilot.getByTestId('pilot-row').nth(1)).toContainText('강남점');
  await expect(pilot.getByTestId('pilot-row').nth(1)).toContainText('완료');
  await expect(pilot.getByTestId('pilot-row').nth(1)).toContainText('활동 중(7일)');
  await expect(pilot.getByText('신청만한점')).toHaveCount(0);

  // ── 지점 관리: 표에 승인된 2지점만 ──
  await page.goto('/admin/branches');
  await expect(page.getByRole('cell', { name: '강남점' }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('cell', { name: '판교점' }).first()).toBeVisible();
  await expect(page.getByText('신청만한점')).toHaveCount(0);
  await expect(page.getByText('거부된점')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '강남점 지점 정보 수정' })).toBeVisible(); // 아이콘 버튼 이름 (103 #2)
  // [구버전] 칩: 가장 낮은 버전이 최신(1.0.60)보다 낮은 지점만 — 강남점(직원 PC 1.0.55)만 남고 판교점은 빠진다 (105 #11)
  await page.getByRole('button', { name: '구버전', exact: true }).click();
  await expect(page.getByRole('cell', { name: '강남점' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: '판교점' })).toHaveCount(0);
  await page.getByRole('button', { name: '전체', exact: true }).click();

  // ── 사용자 관리: "승인된 계정" 탭 = 승인+거부(대기 제외), 대기 배지 1 ──
  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: '승인된 계정' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('pending@example.test')).toHaveCount(0);
  await expect(page.getByText('rejected@example.test').first()).toBeVisible();
  await page.getByRole('button', { name: /승인 대기/ }).click();
  await expect(page.getByText('pending@example.test').first()).toBeVisible();

  // ── 기능 관리: 플래그 로드 실패 → 저장 잠금 (102 #18) → 복구 뒤 [다시 시도]로 풀린다 ──
  await page.goto('/admin/features');
  await expect(page.getByText('기능 설정을 불러오지 못했습니다').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^저장/ })).toBeDisabled();
  state.flagsDown = false;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByText('기능 설정을 불러오지 못했습니다')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText('신청만한점')).toHaveCount(0); // 지점 칩에도 대기 신청자 없음 (102 #1)

  // ── 공지사항: 로드 실패는 "공지 없음"으로 위장하지 않고 오류 + 작성 잠금 (102 #20, 리뷰 L2) ──
  await page.goto('/admin/announcements');
  await expect(page.getByText('공지 목록을 불러오지 못했습니다').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('등록된 공지사항이 없습니다')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '공지 작성' })).toBeDisabled();
  state.announcementsDown = false;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByText('등록된 공지사항이 없습니다')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: '공지 작성' })).toBeEnabled();

  // ── AI 서비스 관리(162): 서버 모듈 미배포(404)는 "미배포" 안내 — 숫자를 만들지 않는다; 배포 뒤 요약·지점 표·크레딧 지급 계약 ──
  await page.goto('/admin/subscriptions?view=ai');
  await expect(page.getByTestId('ai-not-deployed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ai-stat-이달 호출')).toHaveCount(0);
  state.aiDeployed = true;
  await page.getByTestId('ai-not-deployed').getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByTestId('ai-stat-이달 호출')).toContainText('123', { timeout: 15_000 });
  await expect(page.getByTestId('ai-stat-이달 호출')).toContainText('활성 지점 2곳');
  await expect(page.getByTestId('ai-stat-추정 원가')).toContainText('$1.23');
  await expect(page.getByTestId('ai-stat-추정 원가')).toContainText('[가설 환율'); // 원 환산은 가설 라벨, 마진 카드는 없다(165 리뷰 L-7)
  await expect(page.getByTestId('ai-branch-row')).toHaveCount(2);
  await expect(page.getByTestId('ai-branch-row').filter({ hasText: '강남점' })).toContainText('2,800 / 200');
  await page.getByRole('button', { name: '강남점 크레딧 지급' }).click();
  await page.getByLabel('지급 크레딧').fill('500');
  await page.getByTestId('grant-submit').click(); // 사유 없이 → 거절
  await expect(page.getByText('지급 사유를 입력해주세요').first()).toBeVisible();
  await page.getByLabel('사유').fill('파일럿 보상');
  await page.getByTestId('grant-submit').click();
  await expect(page.getByText('강남점에 500 크레딧을 지급했습니다').first()).toBeVisible({ timeout: 15_000 });
  expect(aiGrants).toEqual([{ branchId: 'b-gn', amount: 500, note: '파일럿 보상' }]);
  await expect(page.getByTestId('ai-branch-row').filter({ hasText: '강남점' })).toContainText('2,800 / 700'); // 지급 뒤 다시 읽어 잔액 반영

  // 실제 NAS 로 새어 나간 요청 없음 — 포괄 라우트가 받은(흉내 내지 않은) 경로는 기록만 남고 404 로 끝났다
  // 포괄 라우트가 받은(흉내 내지 않은) 경로는 지점 데이터 동기화(/api/data/*)뿐이어야 한다 — 어드민 화면이 새 서버 경로를 쓰기 시작하면 여기서 드러난다
  // /api/ai/status 는 aiProxy.refreshAiProxyStatus — 로그인 뒤 '/' 가 잠깐 지점 홈(고객 화면 마운트)을 거치며 호출된다. 어드민 화면과 무관, 404 면 '사용 불가'로 조용히 처리
  const unexpected = [...new Set(unmocked)].filter(p => !p.startsWith('/api/data/') && p !== '/api/ai/status');
  expect(unexpected, '흉내 내지 않은 서버 경로').toEqual([]);
});
