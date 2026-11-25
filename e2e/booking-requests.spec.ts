import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, visibleButton } from './helpers';
import { dialog, openReservationDetail, acceptAppConfirm, addReservation } from './flows';

/**
 * 예약 요청함 (143, GAP R-6·R-10) — 카톡으로 온 요청을 접수(처음 고객 → 동의 필수)하면 머리글 버튼에 건수가 붙고,
 * [예약으로 등록]은 예약 폼을 요청 내용(고객·날짜·시간·시술·메모·유입 경로)으로 채운다. 저장하면 요청은 처리됨, 고객은 신규 등록된다.
 * 두 번째 요청은 [거절] → 앱 확인창 → 목록에서 빠진다.
 */

const acc = makeAccount('BR');

test('예약 요청 접수 → 예약으로 등록(폼 프리필·고객 자동 등록) → 거절', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 요청 날짜(오늘)와 예약표의 오늘이 달라진다');
  page.on('dialog', d => d.accept()); // 매장 휴무일 등 예약 폼 확인은 수락
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/reservations');
  await visibleButton(page, /예약 요청함/).click();
  const inbox = dialog(page, '예약 요청함');
  await expect(inbox).toBeVisible();
  await expect(inbox).toContainText('처리 전 요청이 없습니다');
  const form = inbox.getByTestId('booking-request-form');
  await form.getByLabel('요청 채널').selectOption('kakao');
  await form.getByLabel('요청 고객 이름').fill('요청고객');
  await form.getByLabel('요청 전화번호').fill('010-5555-6666');
  await form.getByLabel('요청 시술').selectOption({ index: 1 });
  await form.getByLabel('요청 시간').selectOption('14:00');
  await form.getByLabel('요청 메모').fill('창가 베드 희망');
  await form.getByRole('button', { name: '요청 접수' }).click();
  await expect(form.getByRole('alert')).toContainText('개인정보 수집·이용 동의'); // 처음 고객은 동의 없이 접수 불가
  await form.getByLabel('개인정보 수집·이용 동의 받음').check();
  await form.getByRole('button', { name: '요청 접수' }).click();
  const item = inbox.getByTestId('booking-request-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('요청고객');
  await expect(item).toContainText('신규 고객');
  await expect(item).toContainText('14:00');

  // 대시보드 오늘 할 일에 "예약 요청함 처리 전 요청 확인 1" → 누르면 요청함이 바로 열린다 (188)
  await page.keyboard.press('Escape');
  await expect(inbox).toHaveCount(0);
  await page.goto('/');
  const requestTask = page.getByTestId('today-tasks-card').filter({ visible: true }).first().getByRole('button', { name: /예약 요청함 처리 전 요청 확인/ });
  await expect(requestTask).toContainText('1');
  await requestTask.click();
  await expect(page).toHaveURL(/\/reservations/);
  await expect(inbox).toBeVisible();
  await expect(item).toHaveCount(1);

  // 예약으로 등록 → 예약 폼 프리필
  await item.getByRole('button', { name: '예약으로 등록' }).click();
  await expect(inbox).toHaveCount(0);
  const add = dialog(page, '예약 추가');
  await expect(add).toBeVisible();
  await expect(add.getByLabel('시작 시간')).toHaveValue('14:00');
  await expect(add.getByLabel('메모')).toHaveValue('창가 베드 희망');
  await expect(add.getByLabel('담당 직원')).not.toHaveValue(''); // 직원 1명이면 자동
  await add.getByRole('button', { name: '예약 저장' }).click();
  await expect(add).toHaveCount(0);
  await expect(visibleButton(page, /예약 요청함/)).not.toContainText('1'); // 처리됨 → 건수 사라짐
  const detail = await openReservationDetail(page, '14:00');
  await expect(detail).toContainText('요청고객');
  await expect(detail).toContainText('카카오'); // 유입 경로 = 요청 채널
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // 고객 자동 등록
  await page.goto('/customers');
  await expect(page.getByText('요청고객', { exact: true }).filter({ visible: true }).first()).toBeVisible(); // PC·폰 2중 DOM — 보이는 쪽만

  // 두 번째 요청 — 기존 고객(동의 불필요) → 거절
  await page.goto('/reservations');
  await visibleButton(page, /예약 요청함/).click();
  await expect(inbox).toBeVisible();
  await form.getByLabel('요청 고객 이름').fill('요청고객');
  await form.getByLabel('요청 전화번호').fill('010-5555-6666');
  await form.getByLabel('요청 시술').selectOption({ index: 1 });
  await form.getByLabel('요청 시간').selectOption('16:00');
  await form.getByRole('button', { name: '요청 접수' }).click();
  await expect(item).toHaveCount(1);
  await expect(item).not.toContainText('신규 고객');
  // 같은 날 16:00 예약을 취소 처리하면 그 자리를 원한 대기 요청(16:00)이 안내된다 (185, GAP R-10)
  await page.keyboard.press('Escape');
  await expect(inbox).toHaveCount(0);
  await addReservation(page, acc, '16:00');
  const cancelDetail = await openReservationDetail(page, '16:00');
  await cancelDetail.getByRole('button', { name: '취소처리' }).click();
  await acceptAppConfirm(page, '예약 취소 처리', '취소 처리');
  await expect(page.getByText(/대기 요청 1건\(16:00\)/).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await visibleButton(page, /예약 요청함/).click();
  await expect(inbox).toBeVisible();
  await item.getByRole('button', { name: '거절' }).click();
  await acceptAppConfirm(page, '요청 거절', '거절');
  await expect(item).toHaveCount(0);
  await expect(inbox).toContainText('처리 전 요청이 없습니다');
  await page.keyboard.press('Escape');
  await expect(inbox).toHaveCount(0);
});
