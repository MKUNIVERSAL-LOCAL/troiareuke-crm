import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 회차권·제품 흐름 E2E (로컬 모드) — 에스테틱 CRM의 핵심 비즈니스 로직을 숫자로 고정 (2026-11-19).
 * 회차권: 프로그램(10회 300,000) 등록 → 고객에게 판매(결제) → 시술 기록에서 회차 차감 → 잔여 9회, 매출 300,000(시술 기록은 결제 없음).
 * 제품: 제품(48,000·재고 12) 등록 → 판매 1개 → 재고 11, 제품 매출 48,000. 합계 총 매출 348,000.
 * 입력은 라벨(aria-label)로, 금액은 정확 일치(toHaveText)로 — 리뷰 반영.
 */

const acc = makeAccount('PP');

test('회차권 판매 → 시술 차감 → 잔여 회차, 제품 판매 → 재고·매출이 맞다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const desk = page.getByTestId('customers-desktop');

  // ── 프로그램 등록: 수분관리 10회권 300,000원 ──
  await page.goto('/programs');
  await page.getByRole('button', { name: '프로그램 추가' }).first().click();
  const progDialog = page.getByRole('dialog', { name: '프로그램 추가' });
  await progDialog.getByLabel('프로그램명').fill('수분관리 10회권');
  await progDialog.getByLabel('총 회차').fill('10');
  await progDialog.getByLabel('판매가').fill('300000');
  await progDialog.getByRole('button', { name: '프로그램 추가' }).click();
  await expect(progDialog).toHaveCount(0);
  await expect(page.getByText('수분관리 10회권').first()).toBeVisible();

  // ── 고객에게 회차권 판매(결제 300,000) → 상세에 사용 0회 / 총 10회 ──
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await desk.getByRole('button', { name: '프로그램 등록' }).first().click();
  const regDialog = page.getByRole('dialog', { name: '프로그램 등록' });
  await regDialog.getByLabel('프로그램 선택').selectOption({ label: '수분관리 10회권 — 300,000원' });
  await expect(regDialog.getByLabel('실제 결제 금액')).toHaveValue(/300,?000/);
  await regDialog.getByRole('button', { name: '프로그램 등록' }).click();
  await expect(regDialog).toHaveCount(0);
  await expect(desk.getByText('사용 0회 / 총 10회')).toBeVisible();
  await expect(desk.getByText('잔여 10회')).toBeVisible();

  // ── 시술 기록에 회차권 연결 → 저장 뒤 시술 목록에 남고(결제 화면으로 가지 않음) 사용 1회 / 잔여 9회 ──
  await page.goto('/treatments?new=1');
  await pickCustomer(page, acc.customer);
  await page.getByLabel('프로그램 연결').selectOption({ label: '수분관리 10회권 (0/10회)' });
  await page.getByText('테스트관리', { exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('수분관리 10회권').filter({ visible: true }).first()).toBeVisible(); // 시술 목록의 프로그램 배지
  await expect(page).toHaveURL(/\/treatments/);
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await expect(desk.getByText('사용 1회 / 총 10회')).toBeVisible();
  await expect(desk.getByText('잔여 9회')).toBeVisible();

  // ── 제품 등록(48,000·재고 12) → 판매 1개 → 재고 11 ──
  await page.goto('/products');
  await page.getByRole('button', { name: '제품 추가' }).first().click();
  await page.getByPlaceholder('제품명 입력').fill('수분 세럼');
  await page.getByLabel('판매가').fill('48000');
  await page.getByLabel('재고', { exact: true }).fill('12');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const row = page.locator('tr').filter({ hasText: '수분 세럼' }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText('12개');
  await row.getByRole('button', { name: '판매', exact: true }).click();
  const saleDialog = page.getByRole('dialog', { name: '제품 판매 기록' });
  await expect(saleDialog.getByLabel('수량')).toHaveValue('1');
  await saleDialog.getByRole('button', { name: '판매 기록' }).click();
  await expect(saleDialog).toHaveCount(0);
  await expect(row).toContainText('11개');

  // ── 매출: 회차권 300,000(시술) + 제품 48,000 = 348,000 ──
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toHaveText('348,000원');
  await expect(page.getByTestId('sales-treatment-amount')).toHaveText('300,000원');
  await expect(page.getByTestId('sales-product-amount')).toHaveText('48,000원');
  await expect(page.getByText(/결제 내역 \(2\)/)).toBeVisible();

  // ── 판매 취소 → 재고 12개로 복구, 제품 결제도 사라져 총 매출 300,000·결제 1건 ──
  await page.goto('/products');
  await page.getByRole('button', { name: /^판매 기록/ }).click(); // 판매가 있으면 '판매 기록 (1)'
  await page.getByRole('button', { name: '판매 취소' }).first().click(); // confirm 수락
  await page.getByRole('button', { name: '재고 현황', exact: true }).click();
  await expect(page.locator('tr').filter({ hasText: '수분 세럼' }).first()).toContainText('12개');
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toHaveText('300,000원');
  await expect(page.getByTestId('sales-product-amount')).toHaveText('0원');
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible();
});
