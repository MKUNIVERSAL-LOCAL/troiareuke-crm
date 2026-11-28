import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, visibleButton, pickCustomer } from './helpers';
import { dialog, registerPayment, registerExpense, expectSales, toast } from './flows';

/**
 * 매출 지표 확장 + 월 마감 잠금 (147, GAP P-6·P-7) — 결제 50,000 뒤 지표 카드(목표 100,000 → 달성률 50%, 신규 고객 100%, 월말 예상·BEP 표시),
 * 월 마감 → 결제·지출 등록이 "마감돼" 토스트로 거부되고 창이 남는다 → 마감 해제 → 등록된다.
 */

const acc = makeAccount('RM');

/**
 * 297(293~296 리뷰 H-1): 마감을 한 번도 하지 않은 매장에 "이 PC 에 저장 안 됨" 배지가 떠 있었다 —
 * 294 가 표시를 "렌더마다 되읽기" 로 바꾸면서 **빈 주장**(메모리 `[]` vs 디스크에 칸 없음)을 손실로 읽었다.
 * 아무것도 저장하려 하지 않은 자리에서 "저장 안 됨" 을 띄우면 그 화면이 거짓이고, 정작 진짜 실패 때
 * 아무도 믿지 않는다. 그래서 **쓰기를 막지 않은 보통 상태에서는 그 배지가 없어야 한다**.
 */

test('지표 카드·월 목표·월 마감 잠금이 동작한다', async ({ page, context }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 결제일과 보는 달이 달라진다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await registerPayment(page, acc, 50000);
  await expectSales(page, { total: '50,000원' });

  const card = page.getByTestId('revenue-metrics');
  // 297: 아무것도 저장하려 하지 않은 상태 — '이 PC 에 저장 안 됨' 배지는 없어야 한다(리뷰 H-1)
  await expect(card.getByTestId('month-close-unsaved')).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(card.getByTestId('metric-achievement')).toHaveText('—');
  // 282(리뷰 L-9): 분모·내역 줄에 testid 가 없어 가드도 스펙도 안 보던 돈 칸 7개 — **그 칸이 말해야 하는 값**으로 고정한다.
  // 값만 보면 "—" 가 목표를 안 적어서인지 계산이 깨져서인지 알 수 없다. 분모 줄이 그 이유를 적는다.
  await expect(card.getByTestId('metric-achievement-sub')).toHaveText('목표를 아래에 적으세요');
  await expect(card.getByTestId('metric-mom-sub')).toHaveText('지난달 0원');   // 전월 '—' 의 이유(기준이 0)
  await expect(card.getByTestId('metric-yoy-sub')).toHaveText('작년 0원');     // 전년 '—' 의 이유
  await expect(card.getByTestId('metric-new-share')).toHaveText('100%'); // 이달 등록한 고객의 결제
  await expect(card.getByTestId('metric-new-share-sub')).toHaveText('신규 50,000원 · 기존 0원'); // 100% 의 분자·분모
  await card.getByLabel(/매출 목표/).fill('100000');
  await card.getByRole('button', { name: '목표 저장' }).click();
  await expect(card.getByTestId('metric-achievement')).toHaveText('50%');
  await expect(card.getByTestId('metric-achievement-sub')).toHaveText('목표 100,000원'); // 50% 의 분모
  await expect(card.getByTestId('metric-projected')).not.toHaveText('—'); // 이달 월말 예상(예측)
  await expect(card.getByTestId('metric-bep')).toHaveText('—'); // 판관비 없음 → 계산하지 않음 (149 L-8)
  await expect(card.getByTestId('metric-bep-sub')).toHaveText('판관비(임대료·인건비 등) 지출이 없으면 계산하지 않습니다'); // '—' 의 이유
  await expect(card.getByTestId('metric-program-sub')).toHaveText(/^실현 0원 \(이달 시술로 소진된 회차/); // 판매 0원의 내역

  // 월말 예상은 "지금까지 매출 ÷ 지난 일수 × 그 달 일수" 다 — 분모 줄의 경과 일수를 읽어 그 나눗셈을 맞춰 본다
  const projSub = (await card.getByTestId('metric-projected-sub').innerText()).trim();
  const days = projSub.match(/^(\d+)\/(\d+)일 경과 · 일평균 × 일수$/);
  expect(days, `월말 예상 분모 줄을 읽지 못했다: ${projSub}`).not.toBeNull();
  const [, elapsed, inMonth] = days!;
  expect(Number(elapsed)).toBeGreaterThan(0);
  await expect(card.getByTestId('metric-projected')).toHaveText(`${Math.round((50000 / Number(elapsed)) * Number(inMonth)).toLocaleString('ko-KR')}원`);

  // 276(GAP Q-3): 한 번도 단언하지 않던 돈 칸 다섯 개 — "비어 있지 않다" 가 아니라 **무엇이 적혀야 하는지**를 본다.
  // 전월·전년은 기준이 0 이므로 비율을 만들지 않아야 한다(0 에서 늘었다고 말하면 거짓 추세다 — 254 HIGH 와 같은 종류).
  await expect(card.getByTestId('metric-mom')).toHaveText('—');
  await expect(card.getByTestId('metric-yoy')).toHaveText('—');
  await expect(card.getByTestId('metric-discount')).toHaveText('0원'); // 할인 없이 받은 50,000
  // 262(리뷰 L-2): 할인이 없으면 "근거 보기" 를 걸지 않는다 — 눌러서 "없습니다" 만 보는 길을 만들지 않는다
  await expect(card.getByTestId('metric-discount-open')).toHaveCount(0);

  await expect(card.getByTestId('metric-program')).toHaveText('0원');  // 회차권 판매 없음
  await expect(card.getByTestId('metric-unused')).toHaveText('0원');   // 미사용 잔액 없음

  // 278: 시간당 매출은 testId 가 없어 가드 목록에도 안 들어오던 돈 칸이다. 분모(영업시간)를 함께 읽어
  // **그 나눗셈이 맞는지** 계산해 본다 — 값만 보면 어떤 숫자든 통과한다(277 의 kpi 타일과 같은 이유).
  const perHourSub = (await card.getByTestId('metric-per-hour-sub').innerText()).trim();
  const openHours = Number((perHourSub.match(/^영업 ([\d.]+)시간$/) ?? [])[1]);
  expect(openHours, `영업시간 줄을 읽지 못했다: ${perHourSub}`).toBeGreaterThan(0);
  await expect(card.getByTestId('metric-per-hour')).toHaveText(`${Math.round(50000 / openHours).toLocaleString('ko-KR')}원`);

  // 260(GAP P-6): 숫자를 눌러 **근거 목록**을 본다 — 합계가 카드 숫자와 같아야 한다(확인할 수 없는 숫자는 쓰이지 않는다)
  await card.getByTestId('metric-new-share-open').click();
  const detail = page.getByTestId('metric-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('metric-detail-row')).toHaveCount(1);
  await expect(detail.getByTestId('metric-detail-row')).toContainText(acc.customer);
  await expect(detail.getByTestId('metric-detail-total')).toHaveText('50,000원'); // 카드의 "신규 50,000원" 과 같다
  await expect(detail).toContainText('기존 고객 매출');                            // 고객 미연결 결제가 어디 있는지 밝힌다
  await detail.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('metric-detail')).toHaveCount(0);

  // 262(리뷰 L-2): 할인이 없으면 "근거 보기" 를 걸지 않는다 — 눌러서 "없습니다" 만 보는 길을 만들지 않는다
  await expect(card.getByTestId('metric-discount-open')).toHaveCount(0);

  // 지출 20,000(기본 분류 '제품 매입'은 원가) → 판관비는 여전히 0 → —
  await registerExpense(page, '앰플 매입', 20000);
  await visibleButton(page, '매출 현황').click();
  await expect(card.getByTestId('metric-bep')).toHaveText('—');

  // 월 마감 → 결제 등록 거부
  await card.getByRole('button', { name: '월 마감' }).click();
  await page.getByRole('dialog', { name: '월 마감', exact: true }).getByRole('button', { name: '마감', exact: true }).click();
  await expect(card.getByTestId('month-closed-badge')).toBeVisible();
  await expect(card.getByTestId('month-close-unsaved')).toHaveCount(0); // 297: 제대로 저장됐으면 경고도 없다
  await visibleButton(page, '결제 등록').click();
  const pay = dialog(page, '결제 등록');
  await expect(pay).toBeVisible();
  await pickCustomer(page, acc.customer, pay);
  await pay.getByLabel('결제 금액').fill('10000');
  await pay.getByRole('button', { name: '결제 등록' }).click();
  await expect(toast(page, /마감돼/, 'alert')).toBeVisible();
  await expect(pay).toBeVisible(); // 창이 그대로
  await pay.getByRole('button', { name: '닫기' }).click(); // 결제 창은 Esc 로 닫히지 않는다(폼 보호)
  await expect(pay).toHaveCount(0);
  await expectSales(page, { total: '50,000원' });

  // 지출 등록도 거부
  await visibleButton(page, '지출 등록').click();
  const exp = dialog(page, '지출(매입) 등록');
  await exp.getByLabel('내용').fill('잠긴 달 지출');
  await exp.getByLabel('금액').fill('5000');
  await exp.getByRole('button', { name: '지출 등록' }).click();
  await expect(toast(page, /마감돼/, 'alert')).toBeVisible();
  await expect(exp).toBeVisible();
  await exp.getByRole('button', { name: '닫기' }).click();
  await expect(exp).toHaveCount(0);

  // 마감 해제 → 등록된다
  await card.getByRole('button', { name: '마감 해제' }).click();
  await page.getByRole('dialog', { name: '월 마감 해제', exact: true }).getByRole('button', { name: '마감 해제', exact: true }).click();
  await expect(card.getByTestId('month-closed-badge')).toHaveCount(0);
  await expect(card.getByTestId('month-close-unsaved')).toHaveCount(0); // 297: 마감 해제도 남았다
  await registerPayment(page, acc, 10000);
  await expectSales(page, { total: '60,000원' });
  await expect(card.getByTestId('metric-achievement')).toHaveText('60%');

  // 281(리뷰 M-5): 할인 합계 근거 창을 어떤 스펙도 열지 않았다(있던 단언은 "할인이 없으면 버튼이 없다" 하나).
  // **테스트 끝**에서 넣는다 — 중간에 결제를 더하면 앞의 달성률·시간당 매출 단언(50,000 기준)이 깨진다.
  await visibleButton(page, '결제 등록').click();
  const disc = dialog(page, '결제 등록');
  await pickCustomer(page, acc.customer, disc);
  await disc.getByLabel('결제 금액').fill('30000');
  await disc.getByLabel('할인 금액').fill('5000');
  await disc.getByRole('button', { name: '결제 등록' }).click();
  await expect(disc).toHaveCount(0);
  await visibleButton(page, '매출 현황').click();
  await expect(card.getByTestId('metric-discount')).toHaveText('5,000원');
  await card.getByTestId('metric-discount-open').click();
  const discDrill = page.getByTestId('metric-detail');
  await expect(discDrill.getByTestId('metric-detail-row')).toHaveCount(1);
  await expect(discDrill.getByTestId('metric-detail-row')).toContainText(acc.customer);
  await expect(discDrill.getByTestId('metric-detail-total')).toHaveText('5,000원'); // 목록 합계 = 카드 숫자
  await discDrill.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('metric-detail')).toHaveCount(0);

  // ── 278: 근거 창의 **빈 상태** — 카드는 줄이 있을 때만 버튼을 걸므로, 창이 열린 동안 ──
  // 다른 기기가 그 자료를 지우는 경우에만 뜬다. 모달이 자료를 매 렌더 읽고(RevenueMetricsCard)
  // 부모가 다른 탭의 쓰기에 다시 계산하므로(useDataRefreshed) 269 의 둘째 탭 기법으로 만들 수 있다.
  // 가드 ALLOWED 에는 "스펙으로 만들 수 없다" 고 적혀 있었는데 그 사유가 틀렸다(277 리뷰 M-6).
  await card.getByTestId('metric-new-share-open').click();
  const live = page.getByTestId('metric-detail');
  await expect(live.getByTestId('metric-detail-row')).toHaveCount(1);
  const other = await context.newPage();
  await other.goto('/sales');
  await other.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_payments$/.test(k))!;
    localStorage.setItem(key, '[]'); // 다른 PC 에서 이달 결제를 지웠다
  });
  await other.close();
  // 창을 열어 둔 채 자료가 사라지면 **옛 목록을 그대로 보여 주지 않고** 없다고 말한다
  await expect(live.getByTestId('metric-detail-empty')).toBeVisible({ timeout: 15_000 });
  await expect(live.getByTestId('metric-detail-row')).toHaveCount(0);
  await live.getByRole('button', { name: '닫기' }).click();
});
