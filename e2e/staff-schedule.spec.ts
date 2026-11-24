import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, visibleButton } from './helpers';
import { dialog, addReservation } from './flows';

/**
 * 직원 근무표·휴게·정리 버퍼 (141, GAP R-4·R-2) — 직원 수정에서 근무 11:00~18:00·휴게 13:00~14:00·정리 15분을 저장하면
 * (1) 직원 상세 요약, (2) 예약표 일간 "직원별 열" 머리글·음영, (3) 예약 폼 경고(휴게·근무 밖·정리 버퍼)와 빈 시간 제안에 반영된다.
 * 경고는 막지 않고 confirm 으로 묻는다 — 스펙은 근무·휴게·정리 경고만 거절하고 나머지(매장 휴무일 등)는 수락한다.
 */

const acc = makeAccount('SS');
/** 내일(로컬) — 오늘은 지난 시각을 제안하지 않으므로(144 M-5) 빈 시간 기대값이 시각에 따라 달라지지 않게 내일 날짜로 예약한다 */
const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

test('직원 근무표·휴게·정리 버퍼가 직원 상세·직원별 열·예약 폼 경고에 반영된다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약 날짜와 오늘이 달라진다');
  const confirms: string[] = [];
  page.on('dialog', d => { confirms.push(d.message()); if (/근무|휴게|정리|이미 예약이 있습니다/.test(d.message())) d.dismiss(); else d.accept(); });
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 1) 직원 수정 → 근무표
  await page.goto('/staff');
  await page.getByRole('heading', { name: /^김테스트/ }).first().click();
  const detail = dialog(page, '직원 상세');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('staff-schedule-summary')).toContainText('매장 영업시간과 같음');
  await detail.getByRole('button', { name: '수정' }).click();
  const edit = dialog(page, '직원 수정');
  await expect(edit).toBeVisible();
  await edit.getByPlaceholder('010-0000-0000').fill('010-2222-3333'); // 온보딩 직원은 전화가 비어 있어 저장 검증에 걸린다
  await edit.getByLabel('매장 영업시간과 같음').uncheck();
  await edit.getByLabel('월요일 시작').selectOption('11:00');
  await edit.getByLabel('월요일 끝').selectOption('18:00');
  await edit.getByLabel('월요일 휴게 시작').selectOption('13:00');
  await edit.getByLabel('월요일 휴게 끝').selectOption('14:00');
  await edit.getByRole('button', { name: '월요일과 같게 모두 채우기' }).click();
  await expect(edit.getByLabel('금요일 휴게 끝')).toHaveValue('14:00');
  await edit.getByLabel('시술 뒤 정리').selectOption('15');
  await edit.getByRole('button', { name: '저장', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('heading', { name: /^김테스트/ }).first().click();
  await expect(detail.getByTestId('staff-schedule-summary')).toContainText('11:00~18:00 · 휴게 13:00~14:00');
  await expect(detail.getByTestId('staff-schedule-summary')).toContainText('뒤 정리 15분');
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // 2) 예약표 일간 → 직원별 열: 머리글에 근무 창
  await page.goto('/reservations');
  await page.getByRole('button', { name: '일간' }).click();
  await page.getByRole('button', { name: '직원별 열' }).click();
  const column = page.getByTestId('staff-column').filter({ hasText: '김테스트' });
  await expect(column).toContainText('11:00~18:00 · 휴게 13:00~14:00');

  // 3) 예약 폼 — 휴게(13:00) → 거절, 근무 밖(10:00) → 거절, 15:00 → 저장, 16:00 → 정리 15분 겹침 → 거절
  await addReservation(page, acc, '13:00', { expectRejected: true, date: tomorrow });
  expect(confirms.at(-1)).toContain('휴게 시간(13:00~14:00)과 겹칩니다');
  expect(confirms.at(-1)).toContain('김테스트 담당 빈 시간: 11:00, 11:30, 14:00');
  await addReservation(page, acc, '10:00', { expectRejected: true, date: tomorrow });
  expect(confirms.at(-1)).toContain('근무 시간(11:00~18:00) 밖입니다');
  await addReservation(page, acc, '15:00', { date: tomorrow });
  await page.keyboard.press('ArrowRight'); // 일간 뷰 → 내일
  await expect(page.getByTestId('staff-columns').getByTestId('reservation-block')).toHaveCount(1);
  await addReservation(page, acc, '16:00', { expectRejected: true, date: tomorrow });
  expect(confirms.at(-1)).toContain('준비·정리 시간(앞 0분·뒤 15분)을 넣으면 15:00~16:00 예약과 겹칩니다');
  expect(confirms.at(-1)).toContain('빈 시간: 11:00, 11:30, 16:30');
  await expect(page.getByTestId('staff-columns').getByTestId('reservation-block')).toHaveCount(1);

  // 시작 시간 선택지 표시: 13:00 은 '휴게', 10:00 은 '근무 외', 15:00 은 '예약 있음'
  await visibleButton(page, '예약 추가').click();
  const form = dialog(page, '예약 추가');
  await form.getByLabel('담당 직원').selectOption({ index: 1 });
  await form.getByLabel('예약 날짜').fill(tomorrow);
  const start = form.getByLabel('시작 시간');
  await expect(start.locator('option[value="13:00"]')).toHaveText('13:00 · 휴게');
  await expect(start.locator('option[value="10:00"]')).toHaveText('10:00 · 근무 외');
  await expect(start.locator('option[value="15:00"]')).toHaveText('15:00 · 예약 있음');
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
});
