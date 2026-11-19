import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 모바일 폭 돈 흐름 E2E (Pixel 7, 2026-11-19 ㊳) — PC 스펙(sales.spec)과 같은 숫자를 모바일 카드 목록·바텀시트 창에서 확인한다.
 * 결제 50,000 → 지출 20,000(제품 매입) → 손익(매출원가 20,000·영업이익 30,000) → 지출 분류 변경(임대료) → 환불 → 새로고침 뒤 유지.
 * 모바일은 표 대신 카드 목록(sales-mobile-list·expense-mobile-list)이고 수정은 연필 아이콘(aria-label)으로 연다.
 */

const acc = makeAccount('SM');

test('모바일 폭에서도 결제 → 지출 → 손익계산서 → 환불이 숫자로 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const vis = (name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();

  // ── 결제 50,000원 ──
  await page.goto('/sales');
  await vis('결제 등록').click();
  const payDialog = page.getByRole('dialog', { name: '결제 등록' });
  await expect(payDialog).toBeVisible();
  await pickCustomer(page, acc.customer, payDialog);
  await payDialog.getByLabel('결제 금액').fill('50000');
  await payDialog.getByRole('button', { name: '결제 등록' }).click();
  await expect(payDialog).toHaveCount(0);
  await expect(vis(/결제 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('sales-total-amount')).toHaveText('50,000원');
  await expect(page.getByTestId('sales-treatment-amount')).toHaveText('50,000원');

  // ── 지출(매입) 20,000원 — 기본 분류 '제품 매입'은 매출원가 ──
  await vis('지출 등록').click();
  const expenseDialog = page.getByRole('dialog', { name: '지출(매입) 등록' });
  await expect(expenseDialog).toBeVisible();
  await expenseDialog.getByLabel('내용').fill('앰플 20개 매입');
  await expenseDialog.getByLabel('금액').fill('20000');
  await expenseDialog.getByRole('button', { name: '지출 등록' }).click();
  await expect(expenseDialog).toHaveCount(0);
  await expect(vis(/지출 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });

  // ── 손익계산서: 매출 50,000 − 매출원가 20,000 = 영업이익 30,000 ──
  await vis('손익계산서').click();
  await expect(page.getByTestId('pnl-cogs')).toHaveText('−20,000원');
  await expect(page.getByTestId('pnl-gross')).toHaveText('30,000원');
  await expect(page.getByTestId('pnl-operating')).toHaveText('30,000원');

  // ── 지출 분류 변경(제품 매입 → 임대료): 카드 목록의 연필로 수정 창 → 매출원가 0, 영업이익 그대로 ──
  await vis(/지출 내역 \(1\)/).click();
  await page.getByTestId('expense-mobile-list').getByRole('button', { name: '지출 수정' }).first().click();
  const editExpense = page.getByRole('dialog', { name: '지출 수정' });
  await expect(editExpense).toBeVisible();
  await editExpense.getByRole('button', { name: '임대료', exact: true }).click();
  await editExpense.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editExpense).toHaveCount(0);
  await vis('손익계산서').click();
  await expect(page.getByTestId('pnl-cogs')).toHaveText('−0원');
  await expect(page.getByTestId('pnl-gross')).toHaveText('50,000원');
  await expect(page.getByTestId('pnl-operating')).toHaveText('30,000원');

  // ── 환불: 카드 목록의 연필로 결제 수정 창 → 환불 → 매출 0원, 영업이익 -20,000원 ──
  await vis(/결제 내역 \(1\)/).click();
  await page.getByTestId('sales-mobile-list').getByRole('button', { name: '결제 수정' }).first().click();
  const editPay = page.getByRole('dialog', { name: '결제 수정' });
  await expect(editPay).toBeVisible();
  await editPay.getByRole('button', { name: '환불', exact: true }).click();
  await editPay.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editPay).toHaveCount(0);
  await vis('매출 현황').click();
  await expect(page.getByTestId('sales-total-amount')).toHaveText('0원');
  await expect(vis(/결제 내역 \(1\)/)).toBeVisible();
  await vis('손익계산서').click();
  await expect(page.getByTestId('pnl-operating')).toHaveText('-20,000원');

  // ── 새로고침 후에도 환불·지출이 남는다 ──
  await page.reload();
  await expect(vis(/지출 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('sales-total-amount')).toHaveText('0원');
});
