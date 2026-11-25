import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';
import { addReservation, openReservationDetail } from './flows';

/**
 * 예약 변경 이력 (247) — 예약을 고치면 고친 사실이 어디에도 남지 않았다.
 * "나는 3시로 바꿨는데" 같은 다툼에 매장이 댈 근거가 없었다(코어 예약에는 수정 시각·수정자 칸이 없다).
 * 등록 → 시간 변경 → 취소까지 한 예약의 이력이 사람이 읽을 수 있는 줄로 쌓이는지 본다.
 */

const acc = makeAccount('RH');

test('예약을 고치면 무엇이 언제 바뀌었는지 상세에 남는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/reservations');
  await addReservation(page, acc, '11:00');
  await dismissToasts(page);

  // 등록만 한 상태 — 이력에 "등록" 한 줄
  let detail = await openReservationDetail(page, '11:00');
  const history = detail.getByTestId('reservation-history');
  await expect(history).toBeVisible();
  await expect(history).toContainText('등록');
  await expect(history).toContainText('11:00');
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // 시간을 바꾼다 — 상세 → 수정 → 시작 시간 변경
  detail = await openReservationDetail(page, '11:00');
  await detail.getByRole('button', { name: '수정', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '예약 수정' });
  await expect(edit).toBeVisible();
  await edit.getByLabel('시작 시간').selectOption('15:00');
  await edit.getByRole('button', { name: '예약 저장' }).click();
  await expect(edit).toHaveCount(0);
  await dismissToasts(page);

  // 바뀐 항목이 "날짜·시간 … → …" 으로 남는다
  detail = await openReservationDetail(page, '15:00');
  await expect(detail.getByTestId('reservation-history')).toContainText('날짜·시간');
  await expect(detail.getByTestId('reservation-history')).toContainText('11:00');
  await expect(detail.getByTestId('reservation-history')).toContainText('15:00');
  await expect(detail.getByTestId('reservation-history')).toContainText('수정');

  // 상태 변경도 같은 이력에 쌓인다
  await detail.getByRole('button', { name: '취소처리' }).click();
  const confirm = page.getByRole('dialog', { name: '예약 취소 처리' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '취소 처리' }).click();
  await expect(confirm).toHaveCount(0);
  await dismissToasts(page);

  detail = await openReservationDetail(page, '15:00');
  const afterCancel = detail.getByTestId('reservation-history');
  await expect(afterCancel).toContainText('상태 변경');
  await expect(afterCancel).toContainText('예약확정 → 취소');
  // 세 건이 넘으면 접어 두고, 눌러서 전체를 본다(이 PC 기록이라는 사실도 함께 적는다)
  await expect(afterCancel).toContainText('이 PC');
  const more = detail.getByRole('button', { name: /전체 \d+건 보기/ });
  if (await more.count() > 0) {
    await more.click();
    await expect(detail.getByRole('button', { name: '최근 3건만 보기' })).toBeVisible();
  }
});
