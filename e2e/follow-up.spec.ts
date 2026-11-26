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

  // 273: 미뤄 둔 고객을 목록에서 숨기면 **숨겼다는 사실**을 칩으로 적는다(조용히 줄어든 숫자는 거짓말이다 — 249).
  // 재방문 권장일이 지난 고객이어야 '연락할 고객' 필터에 들어오므로 마지막 방문일을 60일 전으로 심는다.
  await page.evaluate(name => {
    const ck = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(ck) || '[]') as { id: string; name: string; phone?: string; lastVisitDate?: string; totalVisits?: number }[];
    const old = new Date(); old.setDate(old.getDate() - 60);
    // 이 기기 날짜로 만든다 — toISOString 은 UTC 라 저녁에 하루 어긋난다(src/lib/format.ts 의 formatLocalDate 와 같은 이유)
    const day = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;
    const c = list.find(x => x.name === name)!;
    c.lastVisitDate = day; c.totalVisits = 1;
    localStorage.setItem(ck, JSON.stringify(list));
    // 274(리뷰 L-7): 저장값 폴백(statsFor 의 `?? stored`)과 noVisitRecords 가드 **두 겹에 얹힌** 픽스처였다 —
    // 이 테스트에 완료 예약이나 시술 기록이 하나라도 늘면 totalVisits 가 0 으로 치유돼 조용히 무효가 된다.
    // 60일 전 완료 예약을 함께 심어 재방문 권장일이 **기록에서** 나오게 한다.
    const rk = ck.replace(/_customers$/, '_reservations');
    const resv = JSON.parse(localStorage.getItem(rk) || '[]');
    resv.push({
      id: `seed-${Date.now()}`, customerId: c.id, customerName: c.name, customerPhone: c.phone || '',
      staffId: '', staffName: '', services: [], date: day, startTime: '10:00', endTime: '11:00',
      status: 'completed', source: 'walk-in', totalPrice: 0,
    });
    localStorage.setItem(rk, JSON.stringify(resv));
  }, acc.customer);
  await page.goto('/customers?revisit=1');
  // 274(리뷰 L-3): 이 테스트의 고객은 한 명뿐이라 **필터가 꺼져도** 똑같이 보인다 — 칩이 켜진 것을 함께 본다
  await expect(page.getByLabel('재방문 권장 필터 해제').filter({ visible: true }).first()).toContainText('재방문 권장 1');
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible(); // 필터에 들어왔다
  await expect(page.getByTestId('follow-up-hidden').filter({ visible: true })).toHaveCount(0); // 아직 미루지 않았다

  await openCustomer(page, acc);
  const card2 = page.getByTestId('follow-up').filter({ visible: true }).first();
  await card2.getByTestId('follow-up-open').click();
  await card2.getByRole('radio', { name: '부재·연결 안 됨' }).click();
  await card2.getByTestId('follow-up-save').click();
  await dismissToasts(page);
  await page.goto('/customers?revisit=1');
  await expect(page.getByTestId('follow-up-hidden').filter({ visible: true }).first()).toContainText('미룬 1명 숨김');

  await openCustomer(page, acc);
  await card.getByTestId('follow-up-clear').click();
  await dismissToasts(page);

  // "숨기지 않음(기록만)" 으로도 적을 수 있다 — 기록은 남고 할 일 목록에는 계속 보인다
  await card.getByTestId('follow-up-open').click();
  await card.getByRole('radio', { name: '문자·카톡 보냄' }).click();
  await card.getByLabel('숨길 기간').selectOption('0');
  await card.getByTestId('follow-up-save').click();
  await dismissToasts(page);
  await expect(card.getByTestId('follow-up-last')).toContainText('문자·카톡 보냄');
  await expect(card.getByTestId('follow-up-last')).not.toContainText('까지 미룸');
});
