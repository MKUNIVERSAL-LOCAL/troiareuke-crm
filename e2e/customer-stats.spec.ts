import { test, expect, type Page } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, visibleButton, isNearMidnightSeoul } from './helpers';
import { addReservation, completeReservation, logTreatment, openCustomer, refundFirstPayment } from './flows';

/**
 * 고객 누적값 자가 치유 E2E (95, 2026-11-20 — 커버리지 감사 #4).
 * 정의(customerStats): 누적 결제액 = 완료 결제 합 / 방문 횟수 = 완료 예약 날짜 ∪ 시술 기록 날짜의 서로 다른 날 수 / 마지막 방문일은 내리지 않음.
 *  - 같은 날 예약 완료 + 시술 기록 → 방문 1회(코어는 +1+1로 세지만 상세를 열거나 저장 직후 재계산이 흡수)
 *  - 결제 환불 → 누적 결제액 0
 *  - 저장값이 틀어져 있어도(방문 9회로 심어 둠) 상세를 열면 기록대로 돌아오고, 마지막 방문일은 더 이른 날로 내리지 않음
 */

const acc = makeAccount('CS');

async function readCustomer(page: Page, name: string): Promise<{ id: string; totalVisits: number; totalSpent: number; lastVisitDate?: string } | undefined> {
  return page.evaluate((n) => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k));
    const list = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    return list.find((c: { name: string }) => c.name === n);
  }, name);
}

async function patchCustomer(page: Page, name: string, patch: Record<string, unknown>) {
  await page.evaluate(({ n, p }) => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const i = list.findIndex((c: { name: string }) => c.name === n);
    list[i] = { ...list[i], ...p };
    localStorage.setItem(key, JSON.stringify(list));
  }, { n: name, p: patch });
}

test('같은 날 예약 완료 + 시술 기록은 방문 1회, 환불은 누적 결제액 0, 틀어진 저장값은 상세를 열면 기록대로 돌아온다', async ({ page }) => {
  test.skip(isNearMidnightSeoul(), '자정 경계 — 오늘 예약·시술일의 기준일이 바뀐다 (12차 #M6)');
  test.slow();
  // 시술 기록 저장 뒤 "결제도 지금 등록할까요?"는 거절(이미 예약 완료 때 결제했음) — 나머지 confirm은 수락
  page.on('dialog', d => (/매출에 등록할까요/.test(d.message()) ? d.dismiss() : d.accept()));
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 오늘 10:00 예약 → 완료 처리 + 결제 50,000 → 같은 날 시술 기록(회차권 없음)
  await page.goto('/reservations');
  await addReservation(page, acc, '10:00');
  await completeReservation(page, '10:00', true);
  await logTreatment(page, acc, null);

  await openCustomer(page, acc);
  const desk = page.getByTestId('customers-desktop');
  await expect(desk.getByTestId('customer-total-visits')).toHaveText('1회');
  let c = await readCustomer(page, acc.customer);
  expect(c?.totalVisits).toBe(1); // 코어의 +1(완료) +1(시술)을 재계산이 1로
  expect(c?.totalSpent).toBe(50000);

  // 환불 → 누적 결제액 0 (방문은 그대로 1)
  await page.goto('/sales');
  await refundFirstPayment(page);
  await visibleButton(page, '매출 현황').click();
  await openCustomer(page, acc);
  await expect(desk.getByTestId('customer-total-spent')).toHaveText('0원'); // 누적 결제 칸 자체 — 다른 0원(회차권 카드 등)에 가려지지 않게 testid로 (리뷰 97)
  c = await readCustomer(page, acc.customer);
  expect(c?.totalSpent).toBe(0);
  expect(c?.totalVisits).toBe(1);

  // 저장값을 틀어 놓아도(방문 9회, 마지막 방문일 2030-01-01) 상세를 열면 방문은 기록대로 1회, 마지막 방문일은 내리지 않는다
  await patchCustomer(page, acc.customer, { totalVisits: 9, lastVisitDate: '2030-01-01' });
  await page.reload();
  await openCustomer(page, acc);
  await expect(desk.getByTestId('customer-total-visits')).toHaveText('1회');
  c = await readCustomer(page, acc.customer);
  expect(c?.totalVisits).toBe(1);
  expect(c?.lastVisitDate).toBe('2030-01-01');
});
