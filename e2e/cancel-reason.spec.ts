import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';
import { addReservation, openReservationDetail } from './flows';

/**
 * 취소·노쇼 사유 (244, GAP R-10 후속) — 취소·노쇼를 숫자로만 세던 것을 "왜" 까지 남긴다.
 * 확인창에서 사유를 고르면 그 예약 상세에 남고 이달 집계 줄에 쌓이며, 되돌리면(복구) 집계에서 빠져야 한다.
 * 사유는 선택 입력이라 적지 않은 건을 "사유 미기록 N건" 으로 정직하게 말하는지도 함께 본다.
 */

const acc = makeAccount('CR');

const statusFilter = (page: import('@playwright/test').Page) =>
  page.getByLabel('예약 상태 필터').filter({ visible: true }).first(); // PC·모바일 두 벌이 DOM 에 있다

test('취소·노쇼에 사유를 남기면 예약 상세와 이달 집계에 쌓이고, 복구하면 빠진다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/reservations');
  // 취소·노쇼가 없을 때는 줄 자체가 없다(장식 UI 금지)
  await expect(page.getByTestId('cancel-reason-summary')).toHaveCount(0);

  await addReservation(page, acc, '11:00');
  await addReservation(page, acc, '13:00');
  await addReservation(page, acc, '15:00');
  await dismissToasts(page);

  // ── ① 취소 처리 + 사유 칩 ──
  let detail = await openReservationDetail(page, '11:00');
  await detail.getByRole('button', { name: '취소처리' }).click();
  const cancelConfirm = page.getByRole('dialog', { name: '예약 취소 처리' });
  await expect(cancelConfirm).toBeVisible();
  await cancelConfirm.getByTestId('confirm-choices').getByRole('radio', { name: '고객 일정 변경' }).click();
  await cancelConfirm.getByRole('button', { name: '취소 처리' }).click();
  await expect(cancelConfirm).toHaveCount(0);
  await dismissToasts(page);

  // 다시 열면 사유가 남아 있다
  detail = await openReservationDetail(page, '11:00');
  await expect(detail.getByTestId('reservation-reason')).toContainText('고객 일정 변경');
  await expect(detail.getByTestId('reservation-reason')).toContainText('취소 사유');
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // ── ② 노쇼 + 직접 입력 사유 ──
  detail = await openReservationDetail(page, '13:00');
  await detail.getByRole('button', { name: '노쇼', exact: true }).click();
  const noShowConfirm = page.getByRole('dialog', { name: '노쇼 처리' });
  await expect(noShowConfirm).toBeVisible();
  await noShowConfirm.getByRole('radio', { name: '직접 입력' }).click();
  await noShowConfirm.getByPlaceholder('사유를 짧게 적어주세요 (30자)').fill('연락처가  바뀌어  안내 못 감');
  await noShowConfirm.getByRole('button', { name: '노쇼 기록' }).click();
  await expect(noShowConfirm).toHaveCount(0);
  await dismissToasts(page);
  detail = await openReservationDetail(page, '13:00');
  await expect(detail.getByTestId('reservation-reason')).toContainText('연락처가 바뀌어 안내 못 감'); // 공백은 한 칸으로 정리된다
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // ── ③ 사유 없이 취소 — 집계가 "사유 미기록" 으로 말해야 한다 ──
  detail = await openReservationDetail(page, '15:00');
  await detail.getByRole('button', { name: '취소처리' }).click();
  const plain = page.getByRole('dialog', { name: '예약 취소 처리' });
  await expect(plain).toBeVisible();
  await plain.getByRole('button', { name: '취소 처리' }).click();
  await expect(plain).toHaveCount(0);
  await dismissToasts(page);
  detail = await openReservationDetail(page, '15:00');
  await expect(detail.getByTestId('reservation-reason')).toHaveCount(0); // 적지 않았으면 없는 척하지 않는다
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // ── 이달 집계 줄 ──
  const summary = page.getByTestId('cancel-reason-summary').filter({ visible: true }).first(); // PC·모바일 두 벌이 DOM 에 있다
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('취소 2건 · 노쇼 1건'); // 앞에는 보고 있는 달(예: 11월)이 붙는다
  await expect(summary).toContainText('고객 일정 변경 1건');
  await expect(summary).toContainText('사유 미기록 1건');

  // ── 복구하면 그 예약의 사유도 사라지고 집계에서 빠진다 ──
  await statusFilter(page).selectOption('cancelled');
  detail = await openReservationDetail(page, '11:00');
  await detail.getByRole('button', { name: '예약 복구' }).click();
  const restore = page.getByRole('dialog', { name: '예약 복구' });
  await expect(restore).toBeVisible();
  await restore.getByRole('button', { name: '복구' }).click();
  await expect(restore).toHaveCount(0);
  await dismissToasts(page);

  await statusFilter(page).selectOption('all');
  detail = await openReservationDetail(page, '11:00');
  await expect(detail.getByTestId('reservation-reason')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  await expect(summary).toContainText('취소 1건 · 노쇼 1건');
  await expect(summary).not.toContainText('고객 일정 변경');
});
