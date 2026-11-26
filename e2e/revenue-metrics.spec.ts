import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, visibleButton, pickCustomer } from './helpers';
import { dialog, registerPayment, registerExpense, expectSales, toast } from './flows';

/**
 * 매출 지표 확장 + 월 마감 잠금 (147, GAP P-6·P-7) — 결제 50,000 뒤 지표 카드(목표 100,000 → 달성률 50%, 신규 고객 100%, 월말 예상·BEP 표시),
 * 월 마감 → 결제·지출 등록이 "마감돼" 토스트로 거부되고 창이 남는다 → 마감 해제 → 등록된다.
 */

const acc = makeAccount('RM');

test('지표 카드·월 목표·월 마감 잠금이 동작한다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 결제일과 보는 달이 달라진다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await registerPayment(page, acc, 50000);
  await expectSales(page, { total: '50,000원' });

  const card = page.getByTestId('revenue-metrics');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('metric-achievement')).toHaveText('—');
  await expect(card.getByTestId('metric-new-share')).toHaveText('100%'); // 이달 등록한 고객의 결제
  await card.getByLabel(/매출 목표/).fill('100000');
  await card.getByRole('button', { name: '목표 저장' }).click();
  await expect(card.getByTestId('metric-achievement')).toHaveText('50%');
  await expect(card.getByTestId('metric-projected')).not.toHaveText('—'); // 이달 월말 예상(예측)
  await expect(card.getByTestId('metric-bep')).toHaveText('—'); // 판관비 없음 → 계산하지 않음 (149 L-8)

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

  // 할인 없는 달은 "없다" 고 말한다(0원이라고 꾸미지 않는다)
  await card.getByTestId('metric-discount-open').click();
  await expect(page.getByTestId('metric-detail-empty')).toBeVisible();
  await page.getByTestId('metric-detail').getByRole('button', { name: '닫기' }).click();

  // 지출 20,000(기본 분류 '제품 매입'은 원가) → 판관비는 여전히 0 → —
  await registerExpense(page, '앰플 매입', 20000);
  await visibleButton(page, '매출 현황').click();
  await expect(card.getByTestId('metric-bep')).toHaveText('—');

  // 월 마감 → 결제 등록 거부
  await card.getByRole('button', { name: '월 마감' }).click();
  await page.getByRole('dialog', { name: '월 마감', exact: true }).getByRole('button', { name: '마감', exact: true }).click();
  await expect(card.getByTestId('month-closed-badge')).toBeVisible();
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
  await registerPayment(page, acc, 10000);
  await expectSales(page, { total: '60,000원' });
  await expect(card.getByTestId('metric-achievement')).toHaveText('60%');
});
