import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, dismissToasts } from './helpers';
import { addReservation, dialog } from './flows';

/**
 * PC 월간 보기 (261, GAP R-1) — 모바일에는 '이번달' 탭이 있는데 PC 에는 한 달을 한눈에 보는 화면이 없었다.
 * 예약 4건(같은 날)을 만들어: 칸에 3건까지 보이고 나머지는 "+N건 더 보기" 로 밝히는지, 칩을 누르면 상세가 열리는지,
 * 날짜를 누르면 그 날 일간 보기로 가는지, 날짜의 ＋ 가 그 날짜로 예약 추가 창을 여는지 본다.
 */

const acc = makeAccount('MV');

test('월간 보기 — 하루 3건까지 칩, 나머지는 +N건, 날짜·칩·＋ 가 각각 제 일을 한다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약을 만든 날과 보는 달이 달라진다');
  page.on('dialog', d => (d.message().includes('이미 예약이 있습니다') ? d.dismiss() : d.accept()));
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/reservations');
  for (const t of ['10:00', '11:00', '13:00', '14:00']) {
    await addReservation(page, acc, t);
    await dismissToasts(page);
  }

  // 월간으로 전환 — 머리글에 그 달 예약 건수가 나온다
  await page.getByRole('button', { name: '월간' }).click();
  const month = page.getByTestId('month-view');
  await expect(month).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toContainText('예약 4건');

  // 오늘 칸: 3건까지만 칩으로, 나머지는 숨기지 않고 "+1건 더 보기"
  const todayKey = new Date().toISOString().slice(0, 10);
  const cell = month.locator(`[data-testid="month-cell"][data-date="${todayKey}"]`);
  await expect(cell.getByTestId('month-chip')).toHaveCount(3);
  await expect(cell.getByTestId('month-chip').first()).toContainText('10:00');
  await expect(cell.getByTestId('month-more')).toContainText('+1건 더 보기');

  // 칩을 누르면 그 예약 상세가 열린다
  await cell.getByTestId('month-chip').first().click();
  const detail = dialog(page, '예약 상세');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(acc.customer);
  await detail.getByRole('button', { name: '닫기' }).first().click();
  await expect(detail).toHaveCount(0);

  // "+1건 더 보기" → 그 날 일간 보기(4건 모두 보인다)
  await cell.getByTestId('month-more').click();
  await expect(page.getByTestId('month-view')).toHaveCount(0);
  for (const t of ['10:00', '11:00', '13:00', '14:00']) {
    await expect(page.locator(`[data-testid="reservation-block"][data-start="${t}"]`).filter({ visible: true }).first()).toBeVisible();
  }

  // 다시 월간 → 날짜의 ＋ 는 그 날짜로 예약 추가 창을 연다(다음 달 칸은 ＋ 가 없다)
  await page.getByRole('button', { name: '월간' }).click();
  await month.locator(`[data-testid="month-cell"][data-date="${todayKey}"]`).getByRole('button', { name: /예약 추가$/ }).click();
  const add = dialog(page, '예약 추가');
  await expect(add).toBeVisible();
  await expect(add.getByLabel('예약 날짜')).toHaveValue(todayKey);
  await page.keyboard.press('Escape');

  // 이전 달로 가면 그 달 예약이 없다는 사실을 그대로 말한다(0건을 꾸미지 않는다)
  await page.getByRole('button', { name: '이전' }).click();
  await expect(page.getByTestId('month-empty')).toBeVisible();
});
