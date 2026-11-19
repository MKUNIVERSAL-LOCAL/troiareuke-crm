import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer, isNearMidnightSeoul, visibleButton } from './helpers';

/**
 * 모바일 폭 예약 흐름 E2E (Pixel 7, 2026-11-19 ㊵) — PC 스펙(reservations.spec)과 같은 집계를 모바일 카드 목록·상세 창에서 확인한다.
 * 예약 3건(완료·노쇼·취소→복구→재취소)이 모바일 대시보드 카드, 직원 월 실적, 모바일 고객 상세의 노쇼 횟수, 매출에 숫자로 맞게 반영되는지.
 */

const acc = makeAccount('RM');

test('모바일 폭에서도 예약 완료·노쇼·취소·복구가 대시보드·직원 실적·고객 노쇼 횟수에 맞게 반영된다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약을 만든 날과 대시보드의 오늘이 달라진다');
  page.on('dialog', d => (d.message().includes('이미 예약이 있습니다') ? d.dismiss() : d.accept()));
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const vis = (name: string | RegExp) => visibleButton(page, name);
  const addDialog = page.getByRole('dialog', { name: '예약 추가' });
  const detail = page.getByRole('dialog', { name: '예약 상세' });
  const cards = page.getByTestId('reservation-card').filter({ visible: true });
  const addReservation = async (startTime: string) => {
    await vis('예약 추가').click();
    await expect(addDialog).toBeVisible();
    await pickCustomer(page, acc.customer, addDialog);
    await addDialog.getByLabel('담당 직원').selectOption({ index: 1 });
    await addDialog.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
    await addDialog.getByLabel('시작 시간').selectOption(startTime);
    await addDialog.getByRole('button', { name: '예약 저장' }).click();
    await expect(addDialog).toHaveCount(0);
  };
  const openDetail = async (startTime: string) => {
    await page.locator(`[data-testid="reservation-card"][data-start="${startTime}"]`).filter({ visible: true }).first().click();
    await expect(detail).toBeVisible();
  };

  await page.goto('/reservations'); // 모바일 탭 기본값이 '오늘'
  await addReservation('10:00');
  await addReservation('12:00');
  await addReservation('14:00');
  await expect(cards).toHaveCount(3);

  // ── 10시 완료처리 → 결제 창에서 바로 결제(50,000) ──
  await openDetail('10:00');
  await detail.getByRole('button', { name: '완료처리' }).click();
  await page.getByRole('button', { name: '결제 등록', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 12시 노쇼 → 재오픈: 배지 노쇼, 노쇼·취소처리 없음, [예약 복구] 있음 ──
  await openDetail('12:00');
  await detail.getByRole('button', { name: '노쇼', exact: true }).click();
  await expect(detail).toHaveCount(0);
  await openDetail('12:00');
  await expect(detail.getByTestId('reservation-status')).toHaveText('노쇼');
  await expect(detail.getByRole('button', { name: '노쇼', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '취소처리' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '예약 복구' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // ── 14시 취소 → 복구 → 예약확정 → 재취소 ──
  await openDetail('14:00');
  await detail.getByRole('button', { name: '취소처리' }).click();
  await expect(detail).toHaveCount(0);
  await openDetail('14:00');
  await expect(detail.getByTestId('reservation-status')).toHaveText('취소');
  await detail.getByRole('button', { name: '예약 복구' }).click();
  await expect(detail).toHaveCount(0);
  await openDetail('14:00');
  await expect(detail.getByTestId('reservation-status')).toHaveText('예약확정');
  await detail.getByRole('button', { name: '취소처리' }).click();
  await expect(detail).toHaveCount(0);

  // ── 모바일 대시보드 카드: 활성 1건, "완료 1건 · 남은 0건 · 노쇼 1건" ──
  await page.goto('/');
  const todayCard = page.getByTestId('stat-card').filter({ hasText: '오늘 예약' }).filter({ visible: true }).first();
  await expect(todayCard.getByTestId('stat-value')).toHaveText('1건');
  await expect(todayCard.getByTestId('stat-subtitle')).toHaveText('완료 1건 · 남은 0건 · 노쇼 1건');

  // ── 직원 월 실적: 완료 1건 · 50,000원 ──
  await page.goto('/staff');
  const perfRow = page.getByTestId('staff-performance').locator('tbody tr').filter({ hasText: '김테스트' }).first();
  await expect(perfRow.getByTestId('perf-completed')).toHaveText('1건');
  await expect(perfRow.getByTestId('perf-amount')).toHaveText('50,000원');

  // ── 모바일 고객 상세: 노쇼 1회 ──
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('noshow-count').filter({ visible: true }).first()).toHaveText('1회');

  // ── 매출: 완료 때 등록한 결제 50,000원 ──
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toHaveText('50,000원');
  await expect(vis(/결제 내역 \(1\)/)).toBeVisible();
});
