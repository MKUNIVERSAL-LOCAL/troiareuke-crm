import { test, expect, type Page } from '@playwright/test';

/**
 * 핵심 사용 흐름 E2E 스모크 (로컬 모드 빌드, 외부 서버 없음)
 * 가입 → 온보딩(직원 1명·시술 1개) → 고객 등록 → 예약 등록 → 결제 등록 → 매출 반영
 * 릴리스마다 이 흐름이 깨지지 않았음을 보장한다 (파일럿 준비 5/5).
 */

const RUN = Date.now().toString().slice(-7);
const SHOP = `E2E샵${RUN}`;
const EMAIL = `e2e-${RUN}@smoke.test`;
const PASSWORD = 'smoke-pass-1234';
const CUSTOMER = `테스트고객${RUN.slice(-3)}`;
const CUSTOMER_PHONE = `010-${RUN.slice(0, 4)}-${RUN.slice(3, 7)}`;

async function dismissToasts(page: Page) {
  const close = page.getByRole('button', { name: '닫기' });
  while (await close.count()) {
    await close.first().click().catch(() => {});
    if ((await close.count()) === 0) break;
  }
}

test.describe.configure({ mode: 'serial' });

test('가입 → 온보딩 → 고객 → 예약 → 결제가 끊기지 않는다', async ({ page }) => {
  page.on('dialog', d => d.accept());

  // ── 1. 가입 (로컬 모드) ──
  await page.goto('/signup');
  await page.getByPlaceholder('예: 아르케스파 강남점').fill(SHOP);
  await page.getByPlaceholder('example@email.com').fill(EMAIL);
  await page.getByPlaceholder('010-0000-0000').fill('010-1234-5678');
  await page.getByPlaceholder('123-45-67890').fill('1234567890');
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill(PASSWORD);
  await page.getByPlaceholder('비밀번호 재입력').fill(PASSWORD);
  await page.getByRole('button', { name: '다음 단계' }).click();
  await page.getByText('전체 동의', { exact: true }).click();
  await page.getByRole('button', { name: '무료 시작하기' }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });

  // ── 2. 온보딩 ──
  await page.getByPlaceholder('예: 더마 에스테틱').fill(SHOP);
  await page.getByRole('button', { name: '피부관리실', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  // 직원 1명 (예약에 필요)
  await page.getByPlaceholder('직원 1 이름').fill('김테스트');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  // 시술 1개 (예약에 필요)
  await page.getByRole('button', { name: '시술 항목 추가' }).click();
  await page.getByPlaceholder('시술명').fill('테스트관리');
  await page.getByPlaceholder('분', { exact: true }).fill('60');
  await page.getByPlaceholder('가격 (원)').fill('50000');
  await expect(page.getByText(/총 1개 시술 항목이 등록됩니다/)).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click(); // 외부 연동(정보)
  await page.getByRole('button', { name: '다음', exact: true }).click(); // 요금제
  await expect(page.getByText('설정 완료!')).toBeVisible();
  await page.getByRole('button', { name: '더마솔루션 시작하기' }).click();
  await page.waitForURL(url => !/\/onboarding/.test(url.pathname), { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /고객 관리/ }).first()).toBeVisible({ timeout: 15_000 });

  // ── 3. 고객 등록 ──
  await page.goto('/customers');
  await page.getByRole('button', { name: '고객 추가' }).click();
  await page.getByPlaceholder('홍길동').fill(CUSTOMER);
  await page.getByPlaceholder('010-0000-0000').fill(CUSTOMER_PHONE);
  await page.getByText('[필수] 개인정보 수집·이용 동의').click();
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByText(CUSTOMER).filter({ visible: true }).first()).toBeVisible();
  await dismissToasts(page);

  // ── 4. 예약 등록 ──
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click();
  await expect(page.getByText(CUSTOMER).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await dismissToasts(page);

  // ── 5. 결제 등록 → 매출 반영 ──
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).first().click();
  const form = page.locator('form').filter({ hasText: '결제 구분' });
  await form.locator('select').first().selectOption({ index: 1 });
  await form.getByPlaceholder('0').first().fill('50000');
  await form.getByRole('button', { name: '결제 등록' }).click();
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('50,000').first()).toBeVisible();

  // ── 6. 데이터가 새로고침 후에도 남는다 (로컬 저장 회귀) ──
  await page.reload();
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
});

test('로그인 화면은 잘못된 계정을 거부한다', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('example@email.com').fill('nobody@smoke.test');
  await page.getByPlaceholder('비밀번호 입력').fill('wrong-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
