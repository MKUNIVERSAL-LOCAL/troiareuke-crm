import { test, expect, type Page, type Route } from '@playwright/test';
import { solidPng } from './helpers';

/**
 * 지점 앱 — NAS(중앙 서버) 응답을 흉내 낸 E2E (9차 점검 3/3, 2026-11-20)
 * admin-nas 와 같은 빌드(dist-e2e-nas)·같은 가로채기 규칙: crm-api·crm-update 포괄 404 라우트 위에 시나리오 응답. 실제 NAS 요청 0.
 * 로컬 모드 빌드로는 닿지 못하던 흐름 — 가입 신청(심사 대기), 재설정 안내 화면, AI 챗 본사 중계 배지·사용량, 결제 요청 PG 준비 중/활성.
 */

const API = 'https://crm-api.mkcorp.familyds.com';
const UPDATE = 'https://crm-update.mkcorp.familyds.com';

const BRANCH_ADMIN = {
  id: 'u-br-1', email: 'branch@example.test', name: '김원장', phone: '010-1234-5678', shopName: '테스트지점', shopType: 'esthetic', plan: 'pro',
  trialEndsAt: '2030-01-01T00:00:00.000Z', isOnboarded: true, role: 'admin', branchId: 'b-1', branchName: '테스트지점', isActive: true, status: 'approved',
  createdAt: '2026-06-01T00:00:00.000Z', serviceEndsAt: null,
};

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const INITIAL = { pgEnabled: false };
const state = { ...INITIAL };
const unmocked: string[] = [];
const created: Record<string, unknown>[] = [];
test.beforeEach(() => { Object.assign(state, INITIAL); unmocked.length = 0; created.length = 0; });

async function mockNas(page: Page) {
  await page.route(`${API}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route(`${UPDATE}/**`, route => { unmocked.push(new URL(route.request().url()).pathname); return json(route, { error: 'not mocked' }, 404); });
  await page.route('https://cdn.iamport.kr/**', route => route.abort());
  await page.route(`${API}/api/auth/login`, route => json(route, { token: 'test-token', user: BRANCH_ADMIN }));
  await page.route(`${API}/api/auth/me`, route => json(route, { user: BRANCH_ADMIN }));
  await page.route(`${API}/api/auth/logout`, route => route.fulfill({ status: 204 }));
  await page.route(`${API}/api/auth/signup`, route => json(route, { user: { ...BRANCH_ADMIN, id: 'u-new', status: 'pending', isOnboarded: false }, pending: true }));
  await page.route(`${API}/api/data/**`, route => (route.request().method() === 'GET' ? json(route, { rows: [] }) : json(route, { ok: true })));
  await page.route(`${API}/api/feature-flags**`, route => json(route, { global: { 'module.aiChat': true } })); // AI 챗은 본사가 켜 주는 모듈(기본 준비 중) — 서버 응답 모양 { global, branch }
  await page.route(`${API}/api/announcements**`, route => json(route, { announcements: [] }));
  await page.route(`${API}/api/ai/status**`, route => json(route, { enabled: true, providers: ['claude'], monthlyLimit: 100, usedThisMonth: 3, remaining: 97 }));
  await page.route(`${API}/api/payments/pg-config`, route => json(route, { enabled: state.pgEnabled, methods: state.pgEnabled ? ['card', 'vbank'] : [] }));
  await page.route(`${API}/api/payments/requests`, route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const request = { id: `pr-${created.length + 1}`, ...body, status: 'pending', paidAt: null, expiresAt: '2030-01-01T00:00:00.000Z', createdAt: new Date().toISOString(), url: `https://crm-api.mkcorp.familyds.com/pay/pr-${created.length + 1}` };
      created.push(request);
      return json(route, { request });
    }
    return json(route, { enabled: state.pgEnabled, requests: created });
  });
  await page.route(`${UPDATE}/portable/latest.json**`, route => json(route, { version: '1.0.60', releaseDate: '2026-11-20' }));
}

test('지점 앱(NAS 흉내): 가입 신청 대기, 재설정 안내, AI 중계 배지·사용량, 결제 요청 준비 중 → 활성 → 링크 생성', async ({ page }) => {
  test.slow();
  await mockNas(page);

  // ── /reset-password: 예전 Supabase 링크 자리 — 발급제 안내만 (106 #1) ──
  await page.goto('/reset-password');
  await expect(page.getByText('본사 관리자가 임시 비밀번호를 발급')).toBeVisible();
  await expect(page.getByText('이메일의 링크에서')).toHaveCount(0);
  await page.getByRole('link', { name: '로그인으로' }).click();
  await expect(page).toHaveURL(/\/login/);

  // ── 가입 1→2→3단계 (NAS: 신청 → 심사 대기 화면) ──
  await page.goto('/signup');
  await page.getByLabel('샵명 *').fill('테스트지점');
  await page.getByLabel('이메일 *').fill('apply@example.test');
  await page.getByLabel('휴대폰 번호 *').fill('01012345678');
  await page.getByLabel('사업자등록번호 *').fill('1234567890');
  await page.getByLabel('비밀번호 * (8자 이상)').fill('test-pass-1234');
  await page.getByLabel('비밀번호 확인 *').fill('test-pass-1234');
  // NAS 가입은 사업자등록증 사진이 필수(본사 승인 확인용) — 숨은 file input 에 테스트 PNG
  await page.locator('input[type="file"]').setInputFiles({ name: 'license.png', mimeType: 'image/png', buffer: solidPng(64, [200, 200, 200]) });
  await expect(page.getByAltText('사업자등록증 미리보기')).toBeVisible();
  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.getByRole('heading', { name: '약관 동의' })).toBeVisible();
  await expect(page.getByText('선택됨')).toHaveCount(0); // 장식 플랜 카드 제거 (106 #6)
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: '가입 신청하기' }).click();
  await expect(page.getByRole('heading', { name: '가입 신청이 접수되었습니다' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('평일 기준 24시간')).toHaveCount(0); // 근거 없는 SLA 문구 제거 (106 #7)

  // ── 로그인 → AI 챗: 본사 중계 배지에 이번 달 사용량, 면책 문구, 키 안내 (106 #11 #13 #10) ──
  await page.goto('/login');
  await page.getByLabel('이메일', { exact: true }).fill(BRANCH_ADMIN.email);
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password-only-for-mock'); // '비밀번호 보기' 버튼의 aria-label 과 겹치지 않게
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.goto('/ai-chat');
  await expect(page.getByText('본사 AI 연결됨 · 이번 달 3/100건')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('AI 답변은 참고용입니다')).toBeVisible();
  await page.getByRole('button', { name: 'API 키 설정' }).click();
  await expect(page.getByText('로그아웃하면 지워집니다')).toBeVisible();

  // ── 매출 [결제 요청]: PG 계약 전 "(준비 중)" 라벨 + 모달 안내·생성 잠금 (107 #19, 106 #21) ──
  await page.goto('/sales');
  const payBtn = page.getByRole('button', { name: '결제 요청 (준비 중)' }).filter({ visible: true }).first();
  await expect(payBtn).toBeVisible({ timeout: 15_000 });
  await payBtn.click();
  const modal = page.getByRole('dialog', { name: '결제 요청' });
  await expect(modal.getByText('온라인 결제 준비 중입니다')).toBeVisible();
  await expect(modal.getByRole('button', { name: /결제 링크 생성 \(준비 중\)/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  // PG 활성화 → 새로 들어오면 라벨이 "결제 요청", 링크를 만들 수 있다
  state.pgEnabled = true;
  await page.reload();
  const payBtn2 = page.getByRole('button', { name: '결제 요청', exact: true }).filter({ visible: true }).first();
  await expect(payBtn2).toBeVisible({ timeout: 15_000 });
  await payBtn2.click();
  const modal2 = page.getByRole('dialog', { name: '결제 요청' });
  await expect(modal2.getByText('온라인 결제 준비 중입니다')).toHaveCount(0);
  await modal2.getByLabel('금액', { exact: true }).fill('50000');
  await modal2.getByLabel('결제 내용').fill('아쿠아필 1회');
  await modal2.getByRole('button', { name: '결제 링크 만들기' }).click();
  await expect(modal2.getByText('결제 링크를 만들었습니다')).toBeVisible({ timeout: 15_000 });
  await expect(modal2.locator('input[readonly]')).toHaveValue(/\/pay\/pr-1$/);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ amount: 50000, orderName: '아쿠아필 1회', method: 'both' });
  await expect(modal2.getByText('아쿠아필 1회').first()).toBeVisible(); // 최근 결제 요청 목록에도

  const unexpected = [...new Set(unmocked)];
  expect(unexpected, '흉내 내지 않은 서버 경로').toEqual([]);
});
