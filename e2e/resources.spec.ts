import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, visibleButton } from './helpers';
import { dialog, addReservation, openReservationDetail } from './flows';

/**
 * 베드·룸 자원 (142, GAP R-5) — 설정 > 영업시간 탭에서 베드1 을 등록하면 예약이 자동 배정되고(상세에 표시),
 * 같은 시간 두 번째 예약(다른 직원)은 "빈 베드·룸이 없습니다" 확인이 뜬다(막지 않음 — 스펙은 거절). 베드2 를 추가하면 배정돼 저장되고
 * 일간 "직원별 열" 블록에 자원 이름이 보인다.
 */

const acc = makeAccount('RS');

async function addResource(page: import('@playwright/test').Page, name: string) {
  await page.goto('/settings');
  await page.getByRole('button', { name: '영업시간', exact: true }).filter({ visible: true }).first().click();
  const card = page.getByTestId('resources-editor');
  await card.getByLabel('자원 이름').fill(name);
  await card.getByRole('button', { name: '자원 추가' }).click();
  await expect(card.getByText(name, { exact: true })).toBeVisible(); // 추가 즉시 저장
}

test('베드·룸 자원 — 등록 → 예약 자동 배정 → 같은 시간 두 번째는 빈 자원 없음 확인 → 자원 추가 뒤 배정', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약 날짜와 오늘이 달라진다');
  const confirms: string[] = [];
  page.on('dialog', d => { confirms.push(d.message()); if (/빈 베드·룸이 없습니다|이미 쓰고 있습니다/.test(d.message())) d.dismiss(); else d.accept(); });
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await addResource(page, '베드1');

  // 직원 한 명 더 — 같은 시간 다른 담당자의 예약으로 자원 상한을 본다
  await page.goto('/staff');
  await visibleButton(page, '직원 추가').click();
  const addDialog = dialog(page, '직원 추가');
  await addDialog.getByLabel('이름').fill('박신입');
  await addDialog.getByPlaceholder('010-0000-0000').fill('010-2222-3333');
  await addDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(addDialog).toHaveCount(0);

  // 예약 1 — 자동 배정 → 상세에 베드1
  await page.goto('/reservations');
  await addReservation(page, acc, '11:00', { staff: '김테스트 (대표)' });
  const detail = await openReservationDetail(page, '11:00');
  await expect(detail.getByText('베드·룸', { exact: true })).toBeVisible();
  await expect(detail).toContainText('베드1');
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);

  // 예약 2 — 같은 시간, 다른 직원: 빈 자원 없음 → 거절
  await addReservation(page, acc, '11:00', { staff: '박신입 (피부관리사)', expectRejected: true });
  expect(confirms.at(-1)).toContain('빈 베드·룸이 없습니다(베드1 모두 사용 중)');

  // 베드2 추가 → 같은 예약이 들어가고 직원별 열에 자원 이름
  await addResource(page, '베드2');
  await page.goto('/reservations');
  await addReservation(page, acc, '11:00', { staff: '박신입 (피부관리사)' });
  await page.getByRole('button', { name: '일간' }).click();
  await page.getByRole('button', { name: '직원별 열' }).click();
  const columns = page.getByTestId('staff-columns');
  await expect(columns.getByTestId('reservation-block')).toHaveCount(2);
  await expect(columns.getByTestId('reservation-block').filter({ hasText: '베드1' })).toHaveCount(1);
  await expect(columns.getByTestId('reservation-block').filter({ hasText: '베드2' })).toHaveCount(1);

  // 폼의 베드·룸 선택지: 자동 배정·배정 안 함·베드1·베드2
  await visibleButton(page, '예약 추가').click();
  const form = dialog(page, '예약 추가');
  await expect(form.getByLabel('베드·룸')).toBeVisible();
  await expect(form.getByLabel('베드·룸').locator('option')).toHaveCount(4); // 자동·안 함·베드1·베드2
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
});
