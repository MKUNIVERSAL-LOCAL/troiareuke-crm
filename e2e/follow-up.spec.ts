import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';
import { openCustomer } from './flows';

/**
 * 연락 기록·미루기 (249) — "오늘 할 일" 이 매일 같은 고객을 띄우던 것을 끊는다.
 * 직원이 전화해 "다음 달에 갈게요" 를 들어도 적을 곳이 없어 다음 날 또 같은 고객이 떴다(알림 피로·이중 전화).
 * 결과를 적으면 고객 상세에 남고, 미루기 기간·해제가 말한 대로 동작하는지 본다.
 */

const acc = makeAccount('FU');

test('고객 상세에서 연락 결과를 적으면 남고, 미루기를 해제할 수 있다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await openCustomer(page, acc);
  const card = page.getByTestId('follow-up').filter({ visible: true }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('아직 연락 기록이 없습니다');

  // 결과를 고르면 기본 기간이 따라온다(부재 → 3일)
  await card.getByTestId('follow-up-open').click();
  await card.getByRole('radio', { name: '부재·연결 안 됨' }).click();
  await expect(card.getByLabel('숨길 기간')).toHaveValue('3');

  // 기간을 바꿔 저장 — 메모까지
  await card.getByLabel('숨길 기간').selectOption('14');
  await card.getByLabel('메모 (선택 · 40자)').fill('오후에 다시 전화');
  await card.getByTestId('follow-up-save').click();
  await dismissToasts(page);

  // 최근 연락 줄에 결과·기한·메모가 그대로 남는다
  const last = card.getByTestId('follow-up-last');
  await expect(last).toContainText('부재·연결 안 됨');
  await expect(last).toContainText('까지 미룸');
  await expect(last).toContainText('오후에 다시 전화');

  // 미루기 해제 — 기록은 남고 기한만 사라진다
  await card.getByTestId('follow-up-clear').click();
  await dismissToasts(page);
  await expect(card.getByTestId('follow-up-last')).toContainText('부재·연결 안 됨');
  await expect(card.getByTestId('follow-up-last')).not.toContainText('까지 미룸');
  await expect(card.getByTestId('follow-up-clear')).toHaveCount(0);

  // "숨기지 않음(기록만)" 으로도 적을 수 있다 — 기록은 남고 할 일 목록에는 계속 보인다
  await card.getByTestId('follow-up-open').click();
  await card.getByRole('radio', { name: '문자·카톡 보냄' }).click();
  await card.getByLabel('숨길 기간').selectOption('0');
  await card.getByTestId('follow-up-save').click();
  await dismissToasts(page);
  await expect(card.getByTestId('follow-up-last')).toContainText('문자·카톡 보냄');
  await expect(card.getByTestId('follow-up-last')).not.toContainText('까지 미룸');
});
