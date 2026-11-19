import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 예약 흐름 E2E (로컬 모드) — 예약 3건(완료·노쇼·취소)이 대시보드 집계, 직원 월 실적, 고객 노쇼 횟수에 숫자로 맞게 반영되는지 (2026-11-19).
 * 검증은 전부 정확 일치(toHaveText) — "1건"이 부제의 "완료 1건"에 부분 일치해 통과하던 허점을 막는다 (리뷰 반영).
 */

const acc = makeAccount('RV');

async function addReservation(page: import('@playwright/test').Page, startTime: string) {
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  const dialog = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc.customer, dialog);
  await dialog.getByLabel('담당 직원').selectOption({ index: 1 });
  await dialog.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('시작 시간').selectOption(startTime);
  await dialog.getByRole('button', { name: '예약 저장' }).click(); // 휴무일 confirm은 dialog 핸들러가 수락
  await expect(dialog).toHaveCount(0);
}

/** 주간 캘린더의 예약 블록을 시작 시간으로 골라 상세를 연다 */
async function openDetail(page: import('@playwright/test').Page, startTime: string) {
  await page.locator(`[data-testid="reservation-block"][data-start="${startTime}"]`).click();
  const detail = page.getByRole('dialog', { name: '예약 상세' });
  await expect(detail).toBeVisible();
  return detail;
}

test('예약 완료·노쇼·취소가 대시보드·직원 실적·고객 노쇼 횟수에 맞게 반영된다', async ({ page }) => {
  test.slow();
  const now = new Date();
  test.skip(now.getHours() === 23 && now.getMinutes() >= 50, '자정 경계 — 예약을 만든 날과 대시보드의 오늘이 달라진다');
  // 겹침(이중예약) 경고만 거절하고 나머지 confirm(휴무일·노쇼·취소)은 수락
  page.on('dialog', d => (d.message().includes('이미 예약이 있습니다') ? d.dismiss() : d.accept()));
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/reservations');
  await addReservation(page, '10:00');
  await addReservation(page, '12:00');
  await addReservation(page, '14:00');
  await expect(page.getByTestId('reservation-block')).toHaveCount(3);

  // ── 이중예약 차단: 같은 담당자 10:00에 다시 잡으면 겹침 confirm → 거절 → 등록되지 않는다 ──
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  const dupDialog = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc.customer, dupDialog);
  await dupDialog.getByLabel('담당 직원').selectOption({ index: 1 });
  await dupDialog.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await dupDialog.getByLabel('시작 시간').selectOption('10:00');
  await dupDialog.getByRole('button', { name: '예약 저장' }).click(); // 겹침 confirm은 핸들러가 거절
  await expect(dupDialog).toBeVisible(); // 거절했으니 창이 그대로 남는다
  await page.keyboard.press('Escape');
  await expect(dupDialog).toHaveCount(0);
  await expect(page.getByTestId('reservation-block')).toHaveCount(3);

  // ── 10시 완료처리 → 결제 등록 창에서 바로 결제 등록(50,000) → 상세는 자동으로 닫힌다 ──
  let detail = await openDetail(page, '10:00');
  await detail.getByRole('button', { name: '완료처리' }).click();
  await page.getByRole('button', { name: '결제 등록', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 완료된 예약을 다시 열면 '완료처리'는 없고(결제도 이미 등록) 상태 배지만 완료 ──
  detail = await openDetail(page, '10:00');
  await expect(detail.getByRole('button', { name: '완료처리' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '결제 등록하기' })).toHaveCount(0);
  await expect(detail.getByText('완료', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // ── 12시 노쇼 (confirm 수락) ──
  detail = await openDetail(page, '12:00');
  await detail.getByRole('button', { name: '노쇼', exact: true }).click();
  await expect(detail).toHaveCount(0);

  // ── 14시 취소처리 (confirm 수락) ──
  detail = await openDetail(page, '14:00');
  await detail.getByRole('button', { name: '취소처리' }).click();
  await expect(detail).toHaveCount(0);
  // 취소된 예약을 다시 열면 '취소처리'·'노쇼'는 없다 (완료처리는 잘못 취소한 예약을 되살리는 길로 남긴다)
  detail = await openDetail(page, '14:00');
  await expect(detail.getByRole('button', { name: '취소처리' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '노쇼', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '완료처리' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // ── 대시보드: 오늘 예약은 노쇼·취소를 뺀 활성 1건, 부제 "완료 1건 · 남은 0건 · 노쇼 1건" ──
  await page.goto('/');
  const todayCard = page.getByTestId('stat-card').filter({ hasText: '오늘 예약' }).first();
  await expect(todayCard.getByTestId('stat-value')).toHaveText('1건');
  await expect(todayCard.getByTestId('stat-subtitle')).toHaveText('완료 1건 · 남은 0건 · 노쇼 1건');

  // ── 직원 월 실적: 완료 건수 1건 · 완료 예약액 50,000원 (노쇼·취소 제외) ──
  await page.goto('/staff');
  const perfRow = page.getByTestId('staff-performance').locator('tbody tr').filter({ hasText: '김테스트' }).first();
  await expect(perfRow.getByTestId('perf-completed')).toHaveText('1건');
  await expect(perfRow.getByTestId('perf-amount')).toHaveText('50,000원');

  // ── 고객 상세: 노쇼 1회 ──
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('noshow-badge').first()).toContainText('노쇼 1회');

  // ── 완료처리 때 등록한 결제가 매출에 50,000원으로 잡힌다 ──
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toHaveText('50,000원');
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible();
});
