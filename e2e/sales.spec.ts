import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 돈 흐름 E2E (로컬 모드) — 결제 → 지출(매입) → 손익계산서 → 환불이 숫자로 맞게 반영되는지.
 * 상용 CRM에서 가장 비싼 결함은 "화면은 멀쩡한데 금액이 틀린" 것이라 매출·원가·영업이익·환불을 값으로 고정한다 (2026-11-18).
 */

const acc = makeAccount('SL');

/** 매출 현황 카드(라벨 p의 가장 가까운 rounded-2xl 카드) — 금액은 같은 카드 안에 있다 */
const card = (page: import('@playwright/test').Page, label: string) =>
  page.getByText(label, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');

test('결제 → 지출 → 손익계산서 → 환불이 숫자로 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 결제 50,000원(카드) ──
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).first().click();
  const payForm = page.locator('form').filter({ hasText: '결제 구분' });
  await pickCustomer(page, acc.customer, payForm);
  await payForm.getByLabel('결제 금액').fill('50000');
  await payForm.getByRole('button', { name: '결제 등록' }).click();
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expect(card(page, '총 매출')).toContainText('50,000원');
  await expect(card(page, '시술 매출')).toContainText('50,000원');

  // ── 지출(매입) 20,000원 — 기본 분류 '제품 매입'은 매출원가 ──
  await page.getByRole('button', { name: '지출 등록' }).first().click();
  const expenseDialog = page.getByRole('dialog', { name: '지출(매입) 등록' });
  await expect(expenseDialog).toBeVisible();
  await expenseDialog.getByLabel('내용').fill('앰플 20개 매입');
  await expenseDialog.getByLabel('금액').fill('20000');
  await expenseDialog.getByRole('button', { name: '지출 등록' }).click();
  await expect(expenseDialog).toHaveCount(0);
  await expect(page.getByText(/지출 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });

  // ── 손익계산서: 매출 50,000 − 매출원가 20,000 = 영업이익 30,000 (60%) ──
  await page.getByRole('button', { name: '손익계산서' }).click();
  await expect(page.getByText('매출원가 (매입)').first().locator('..')).toContainText('20,000원');
  await expect(page.getByText('매출총이익', { exact: true }).first().locator('..')).toContainText('30,000원');
  await expect(page.getByText('영업이익', { exact: true }).first().locator('..')).toContainText('30,000원');
  await expect(page.getByText('영업이익률', { exact: true }).first().locator('..')).toContainText('60%');

  // ── 환불: 결제 상태를 환불로 바꾸면 매출에서 빠진다 (건수는 남음) ──
  await page.getByRole('button', { name: /결제 내역 \(1\)/ }).click();
  await page.getByRole('button', { name: '결제 수정' }).first().click();
  const editForm = page.locator('form').filter({ hasText: '결제 상태' });
  await editForm.getByRole('button', { name: '환불', exact: true }).click();
  await editForm.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editForm).toHaveCount(0);
  await page.getByRole('button', { name: '매출 현황' }).click();
  await expect(card(page, '총 매출')).toContainText('0원');
  await page.getByRole('button', { name: '손익계산서' }).click();
  await expect(page.getByText('영업이익', { exact: true }).first().locator('..')).toContainText('-20,000원');

  // ── 새로고침 후에도 환불·지출이 남는다 ──
  await page.reload();
  await expect(page.getByText(/지출 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expect(card(page, '총 매출')).toContainText('0원');
});
