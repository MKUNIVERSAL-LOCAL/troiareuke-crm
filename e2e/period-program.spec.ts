import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer, isNearMidnightSeoul } from './helpers';

/**
 * 기간제(무제한) 프로그램 흐름 E2E (로컬 모드, 2026-11-19 ㉘) — 회차권과 달리 횟수 제한이 없는 프로그램이
 * 등록 → 고객 판매(만료일 = 구매일+유효기간) → 시술 기록 연결(자동 완료되지 않음) → 관리에서 완료 처리 → 매출까지 맞게 흐르는지.
 */

const acc = makeAccount('PT');
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('기간제 프로그램은 횟수 제한 없이 기록되고 만료일·완료 처리·매출이 맞다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 만료일(오늘+90) 계산이 날짜를 넘긴다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const desk = page.getByTestId('customers-desktop');
  const card = desk.getByTestId('program-card').filter({ hasText: '피부진정 기간제' });
  const openCustomer = async () => {
    await page.goto('/customers');
    await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  };

  // ── 프로그램 등록: 기간제(무제한) 200,000원 · 90일 유효 ──
  await page.goto('/programs');
  await page.getByRole('button', { name: '프로그램 추가' }).first().click();
  const progDialog = page.getByRole('dialog', { name: '프로그램 추가' });
  await progDialog.getByLabel('프로그램명').fill('피부진정 기간제');
  await progDialog.getByRole('button', { name: '기간제 (무제한)' }).click();
  await expect(progDialog.getByLabel('총 회차')).toHaveCount(0);
  await progDialog.getByLabel('판매가').fill('200000');
  await progDialog.getByLabel('유효기간 (일)').fill('90');
  await progDialog.getByRole('button', { name: '프로그램 추가' }).click();
  await expect(progDialog).toHaveCount(0);
  const progItem = page.getByTestId('program-item').filter({ hasText: '피부진정 기간제' });
  await expect(progItem.getByText('기간제', { exact: true })).toBeVisible();
  await expect(progItem.getByText('90일 유효')).toBeVisible();

  // ── 고객에게 판매: 결제 200,000 · 만료일 = 오늘+90 · 횟수 표시 없음 ──
  await openCustomer();
  await desk.getByRole('button', { name: '프로그램 등록' }).first().click();
  const regDialog = page.getByRole('dialog', { name: '프로그램 등록' });
  await regDialog.getByLabel('프로그램 선택').selectOption({ label: '피부진정 기간제 — 200,000원' });
  await expect(regDialog.getByLabel('실제 결제 금액')).toHaveValue(/200,?000/);
  await regDialog.getByRole('button', { name: '프로그램 등록' }).click();
  await expect(regDialog).toHaveCount(0);
  const plus90 = new Date(); plus90.setDate(plus90.getDate() + 90);
  await expect(card.getByText('기간제 프로그램')).toBeVisible();
  await expect(card.getByText(`만료일: ${localISO(plus90).replace(/-/g, '.')}`)).toBeVisible();
  await expect(card.getByText(/잔여/)).toHaveCount(0);
  await expect(card.getByText('만료', { exact: true })).toHaveCount(0);

  // ── 시술 기록 2건 연결 — 횟수제가 아니라 몇 번을 써도 완료되지 않는다 ──
  for (let i = 0; i < 2; i++) {
    await page.goto('/treatments?new=1');
    await pickCustomer(page, acc.customer);
    await expect(page.getByLabel('프로그램 연결').locator('option:checked')).toHaveText(`피부진정 기간제 (기간제 · ${i}회 이용)`);
    await page.getByRole('dialog', { name: '시술 기록 추가' }).getByRole('checkbox', { name: '테스트관리' }).check();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await openCustomer();
  await expect(card.getByText('완료', { exact: true })).toHaveCount(0);
  await expect(card.getByText('이용 내역 (2건)')).toBeVisible();
  await expect(card.getByText(/^-\d+회$/)).toHaveCount(0); // 기간제는 '-1회' 같은 차감 표기를 하지 않는다

  // ── 관리: 기간제라 총 회차 입력이 없고, 완료 처리하면 '완료' 배지 + 시술 기록 선택지에서 빠진다 ──
  await card.getByRole('button', { name: '피부진정 기간제 관리' }).click();
  const manage = page.getByRole('dialog', { name: '프로그램 관리' });
  await expect(manage.getByText(/^기간제 · 등록 /)).toBeVisible();
  await expect(manage.getByLabel('총 회차')).toHaveCount(0);
  await manage.getByRole('button', { name: '완료 처리' }).click(); // confirm 수락
  await expect(manage).toHaveCount(0);
  await expect(card.getByText('완료', { exact: true })).toBeVisible();
  await page.goto('/treatments?new=1');
  await pickCustomer(page, acc.customer);
  await expect(page.getByLabel('프로그램 연결')).toHaveCount(0);

  // ── 매출: 기간제 판매 200,000이 시술 매출로 잡힌다 ──
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toHaveText('200,000원');
  await expect(page.getByTestId('sales-treatment-amount')).toHaveText('200,000원');
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible();
});
