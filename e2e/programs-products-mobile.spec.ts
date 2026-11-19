import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 모바일 폭 회차권·제품 흐름 E2E (Pixel 7, 2026-11-19 ㊴) — PC 스펙(programs-products.spec)과 같은 숫자를 모바일 화면(전체 화면 고객 상세,
 * 카드 목록 products-mobile-list, 바텀시트 창)에서 확인한다.
 * 회차권 10회 300,000 등록·판매 → 시술 기록 차감(1/10회·잔여 9회) → 제품 48,000·재고 12 → 판매 1 → 재고 11 → 매출 348,000 → 판매 취소 → 재고 12·매출 300,000.
 */

const acc = makeAccount('PM');

test('모바일 폭에서도 회차권 판매 → 시술 차감 → 제품 판매·취소가 재고·매출에 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const vis = (name: string | RegExp, exact = true) => page.getByRole('button', typeof name === 'string' ? { name, exact } : { name }).filter({ visible: true }).first();
  const openCustomer = async () => {
    await page.goto('/customers');
    await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('기본 정보').filter({ visible: true }).first()).toBeVisible();
  };
  const card = page.getByTestId('program-card').filter({ hasText: '수분관리 10회권' }).filter({ visible: true }).first();

  // ── 프로그램 등록: 수분관리 10회권 300,000원 ──
  await page.goto('/programs');
  await vis('프로그램 추가').click();
  const progDialog = page.getByRole('dialog', { name: '프로그램 추가' });
  await progDialog.getByLabel('프로그램명').fill('수분관리 10회권');
  await progDialog.getByLabel('총 회차').fill('10');
  await progDialog.getByLabel('판매가').fill('300000');
  await progDialog.getByRole('button', { name: '프로그램 추가' }).click();
  await expect(progDialog).toHaveCount(0);

  // ── 고객에게 판매(결제 300,000) → 모바일 카드 "0/10회 · 잔여 10회" ──
  await openCustomer();
  await vis('프로그램 등록').click();
  const regDialog = page.getByRole('dialog', { name: '프로그램 등록' });
  await regDialog.getByLabel('프로그램 선택').selectOption({ label: '수분관리 10회권 — 300,000원' });
  await expect(regDialog.getByLabel('실제 결제 금액')).toHaveValue(/300,?000/);
  await regDialog.getByRole('button', { name: '프로그램 등록' }).click();
  await expect(regDialog).toHaveCount(0);
  await expect(card).toContainText('0/10회 · 잔여 10회');

  // ── 시술 기록에 회차권 연결(자동) → 저장 → 1/10회 · 잔여 9회 ──
  await page.goto('/treatments?new=1');
  await pickCustomer(page, acc.customer);
  const treatDialog = page.getByRole('dialog', { name: '시술 기록 추가' });
  await expect(treatDialog.getByLabel('프로그램 연결').locator('option:checked')).toHaveText('수분관리 10회권 (0/10회)');
  await treatDialog.getByRole('checkbox', { name: '테스트관리' }).check();
  await treatDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openCustomer();
  await expect(card).toContainText('1/10회 · 잔여 9회');

  // ── 제품 등록(48,000·재고 12) → 카드 목록 → 판매 1개 → 재고 11개 ──
  await page.goto('/products');
  await vis('제품 추가').click();
  await page.getByPlaceholder('제품명 입력').fill('수분 세럼');
  await page.getByLabel('판매가').fill('48000');
  await page.getByLabel('재고', { exact: true }).fill('12');
  await vis('저장').click();
  const list = page.getByTestId('products-mobile-list');
  await expect(list.getByText('수분 세럼')).toBeVisible({ timeout: 10_000 });
  await expect(list.getByText('재고 12개', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: '판매', exact: true }).first().click();
  const saleDialog = page.getByRole('dialog', { name: '제품 판매 기록' });
  await expect(saleDialog.getByLabel('수량')).toHaveValue('1');
  await saleDialog.getByRole('button', { name: '판매 기록' }).click();
  await expect(saleDialog).toHaveCount(0);
  await expect(list.getByText('재고 11개', { exact: true })).toBeVisible();

  // ── 매출: 회차권 300,000 + 제품 48,000 = 348,000 ──
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toHaveText('348,000원');
  await expect(page.getByTestId('sales-treatment-amount')).toHaveText('300,000원');
  await expect(page.getByTestId('sales-product-amount')).toHaveText('48,000원');
  await expect(vis(/결제 내역 \(2\)/)).toBeVisible();

  // ── 판매 취소 → 재고 12개 복구, 제품 결제 삭제 → 총 매출 300,000·결제 1건 ──
  await page.goto('/products');
  await vis(/^판매 기록/).click();
  await vis('판매 취소').click(); // confirm 수락
  await vis('재고 현황').click();
  await expect(list.getByText('재고 12개', { exact: true })).toBeVisible();
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toHaveText('300,000원');
  await expect(page.getByTestId('sales-product-amount')).toHaveText('0원');
  await expect(vis(/결제 내역 \(1\)/)).toBeVisible();
});
