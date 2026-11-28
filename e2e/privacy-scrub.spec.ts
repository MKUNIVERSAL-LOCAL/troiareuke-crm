import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';
import { addReservation, openReservationDetail } from './flows';

/**
 * 개인정보 파기 — **취소·노쇼에 직접 적은 사유**가 정말 지워지는지, 안 지워지면 화면이 말하는지
 * (324, 321~323 리뷰 H-1·M-7)
 *
 * 왜 필요한가: 직접 입력 사유 30자에는 "○○ 임신으로 중단" 같은 **개인 사정**이 적힌다. 그 기록은
 * 고객 레코드가 아니라 지점 **설정 행**에 있고, 설정 행은 서버 모드에서 NAS 로 동기돼 그 지점 모든
 * PC 로 퍼진다. 그래서 익명화·삭제 때 함께 지워야 한다.
 *
 * 321 이 익명화 쪽 판정을 살렸지만 **삭제 쪽은 지우지도 않고 있었다**(`cancelReasons.ts` 주석은
 * "익명화·삭제 때" 라고 적는데 호출자는 익명화 하나뿐이었다 — 리뷰가 e2e 로 재현했다). 324 가 고쳤고,
 * 이 스펙이 **다음 리팩터가 다시 버리지 못하게** 고정한다(321 은 이 HIGH 에 스펙을 만들지 않았다).
 *
 * 보는 것: ① 삭제하면 사유가 **정말 사라진다** ② 쓰기가 막히면 "지우지 못했습니다" 를 말하고
 * **그 말이 사실이다**(되읽으면 남아 있다) ③ 정상일 때는 그 경고를 **띄우지 않는다**.
 */

const PRIVATE_REASON = '임신으로 중단';

/** 설정 행 키의 쓰기만 막는다 — 코어 `safeSetItem` 이 오류를 삼키는 그 경로(285 의 방식) */
const blockPrefWrites = (page: import('@playwright/test').Page) => page.addInitScript(() => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    if (/^crm_.*_settings$/.test(key)) throw new DOMException('quota (e2e 주입)', 'QuotaExceededError');
    return orig.call(this, key, value);
  };
});

/** 설정 행에 직접 입력 사유가 남아 있는가 — 메모리 캐시가 아니라 디스크를 본다 */
const reasonOnDisk = (page: import('@playwright/test').Page) => page.evaluate((needle: string) => {
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && /^crm_.*_settings$/.test(k) && (localStorage.getItem(k) || '').includes(needle)) return true;
  }
  return false;
}, PRIVATE_REASON);

/** 예약 하나를 노쇼 처리하며 직접 입력 사유를 남긴다 */
async function noShowWithPrivateReason(page: import('@playwright/test').Page, time: string) {
  const detail = await openReservationDetail(page, time);
  await detail.getByRole('button', { name: '노쇼', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '노쇼 처리' });
  await expect(confirm).toBeVisible();
  await confirm.getByTestId('confirm-choices').getByRole('radio', { name: '직접 입력' }).click();
  await confirm.getByLabel('사유 직접 입력').fill(PRIVATE_REASON);
  await confirm.getByRole('button', { name: '노쇼 기록' }).click();
  await expect(confirm).toHaveCount(0);
  await dismissToasts(page);
}

test('고객을 삭제하면 직접 입력한 취소 사유도 함께 지워진다 (324, 리뷰 H-1)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const acc = makeAccount('PS');
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await page.goto('/reservations');
  await addReservation(page, acc, '11:00');
  await dismissToasts(page);
  await noShowWithPrivateReason(page, '11:00');
  expect(await reasonOnDisk(page)).toBe(true); // 적은 것이 설정 행에 들어갔다(전제 확인)

  // 고객 삭제 — 확인창은 askConfirm 창이다
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await page.getByTestId('customers-desktop').getByRole('button', { name: '더보기', exact: true }).click();
  await page.getByRole('menuitem', { name: '고객 삭제' }).click();
  const del = page.getByRole('dialog', { name: '고객 삭제' });
  await expect(del).toBeVisible();
  await del.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(del).toHaveCount(0);

  // ① 사유가 정말 사라졌다 ③ 정상 경로에서는 경고가 없다
  expect(await reasonOnDisk(page)).toBe(false);
  await expect(page.getByText('지우지 못했습니다')).toHaveCount(0);
  await expect(page.getByText('확인할 수 없었습니다')).toHaveCount(0);
});

test('쓰기가 막히면 삭제가 "사유를 지우지 못했습니다" 를 말하고 그 말이 사실이다 (324, 리뷰 H-1)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const acc = makeAccount('PQ');
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await page.goto('/reservations');
  await addReservation(page, acc, '13:00');
  await dismissToasts(page);
  await noShowWithPrivateReason(page, '13:00');
  expect(await reasonOnDisk(page)).toBe(true);

  // 여기서부터 설정 행 쓰기를 막는다(가입·예약까지는 정상이어야 한다)
  await blockPrefWrites(page);
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await page.getByTestId('customers-desktop').getByRole('button', { name: '더보기', exact: true }).click();
  await page.getByRole('menuitem', { name: '고객 삭제' }).click();
  const del = page.getByRole('dialog', { name: '고객 삭제' });
  await expect(del).toBeVisible();
  await del.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(del).toHaveCount(0);

  // ② 말하고, 그 말이 사실이다
  await expect(page.getByText('취소·노쇼에 직접 적은 사유를 이 PC 에서 지우지 못했습니다(저장 공간 부족)').first()).toBeVisible({ timeout: 15_000 });
  expect(await reasonOnDisk(page)).toBe(true);
});
