import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';

/**
 * 핵심 사용 흐름 E2E 스모크 (로컬 모드 빌드, 외부 서버 없음)
 * 가입 → 온보딩(직원 1명·시술 1개) → 고객 등록 → 예약 등록 → 결제 등록 → 매출 반영
 * 릴리스마다 이 흐름이 깨지지 않았음을 보장한다 (파일럿 준비 5/5).
 */

const acc = makeAccount('E2E');

test.describe.configure({ mode: 'serial' });

test('가입 → 온보딩 → 고객 → 예약 → 결제가 끊기지 않는다', async ({ page }) => {
  page.on('dialog', d => d.accept());

  // ── 1~3. 가입 → 온보딩 → 고객 등록 (공통 헬퍼) ──
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 4. 예약 등록 ──
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click();
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
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
