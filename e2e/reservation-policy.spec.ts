import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { addReservation, reservationItems } from './flows';

/**
 * 예약 정책 "겹치는 예약 금지" (173, GAP R-3 2단계) — 꺼짐(기본)이면 겹침 경고 confirm 뒤 등록, 켜면 confirm 없이 막히고 빈 시간을 안내한다.
 */

const acc = makeAccount('RP');

test('겹치는 예약 금지를 켜면 같은 담당자 겹침 예약이 확인창 없이 막힌다', async ({ page }) => {
  test.slow();
  const confirms: string[] = [];
  page.on('dialog', d => { confirms.push(d.message()); return d.accept(); }); // 기본 정책: 겹침 경고도 수락 → 2건 등록
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/reservations');
  await addReservation(page, acc, '14:00');
  await addReservation(page, acc, '14:00'); // 겹침 — 경고 confirm 수락
  expect(confirms.some(m => m.includes('이미 예약이 있습니다'))).toBe(true);
  await expect(reservationItems(page)).toHaveCount(2);

  // 정책 켬
  await page.goto('/settings?tab=hours');
  const card = page.getByTestId('reservation-policy-card');
  await card.getByRole('switch', { name: '겹치는 예약 금지' }).check();
  await expect(page.getByText('겹치는 예약은 이제 저장할 수 없습니다').first()).toBeVisible();

  // 세 번째 겹침 시도 — confirm 없이 막힘(창은 남아 있음), 빈 시간 안내 토스트
  confirms.length = 0;
  await page.goto('/reservations');
  await addReservation(page, acc, '14:00', { expectRejected: true });
  expect(confirms.filter(m => m.includes('이미 예약이 있습니다'))).toEqual([]); // 하드 블록은 묻지 않는다
  await expect(page.getByText(/예약 정책이 겹치는 예약을 막고 있습니다/).first()).toBeVisible();
  await expect(reservationItems(page)).toHaveCount(2);

  // 다른 시각은 그대로 등록된다
  await addReservation(page, acc, '16:00');
  await expect(reservationItems(page)).toHaveCount(3);
});
