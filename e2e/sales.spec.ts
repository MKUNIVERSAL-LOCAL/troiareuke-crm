import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, visibleButton } from './helpers';
import { salesScenario } from './scenarios';
import { pickCustomer } from './helpers';
import { dialog, registerPayment, expectSales } from './flows';

/**
 * 돈 흐름 E2E (PC 폭) — 결제 → 지출(매입) → 손익계산서 → 환불이 숫자로 맞게 반영되는지.
 * 상용 CRM에서 가장 비싼 결함은 "화면은 멀쩡한데 금액이 틀린" 것이라 매출·원가·영업이익·환불을 값으로 고정한다 (2026-11-18).
 * 시나리오 본문은 e2e/scenarios.ts(salesScenario) — 모바일 스펙(sales-mobile.spec)과 같은 함수를 쓴다 (2026-11-19 ㊷).
 */

const acc = makeAccount('SL');
const acc2 = makeAccount('SL2'); // 이중 제출 테스트는 매출이 섞이지 않게 별도 매장
const acc3 = makeAccount('SL3'); // 체크아웃 재예약 유도 (231)
const accDup = makeAccount('SL4'); // 중복 결제 경고 (264)

test('결제 → 지출 → 손익계산서 → 환불이 숫자로 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await salesScenario(page, acc);
});

test('같은 고객·같은 금액을 다시 등록하면 중복인지 묻고, 취소하면 저장하지 않는다 (264, GAP P-4)', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 결제일과 보는 달이 달라진다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, accDup);
  await createCustomer(page, accDup);
  await registerPayment(page, accDup, 90000);
  await expectSales(page, { total: '90,000원' });

  // 같은 금액을 한 번 더 — 확인창이 사실(언제 들어온 결제인지)을 보여 주고, [취소하고 확인] 이면 저장되지 않는다
  await visibleButton(page, '결제 등록').click();
  const pay2 = dialog(page, '결제 등록');
  await pickCustomer(page, accDup.customer, pay2);
  await pay2.getByLabel('결제 금액').fill('90000');
  await pay2.getByRole('button', { name: '결제 등록' }).click();
  const warn = page.getByRole('dialog', { name: '같은 금액 결제가 이미 있습니다' });
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('90,000원 결제가 이미 1건');
  await expect(warn).toContainText('이 PC 에 저장된 결제만');
  await warn.getByRole('button', { name: '취소하고 확인' }).click();
  await expect(warn).toHaveCount(0);
  await pay2.getByRole('button', { name: '닫기' }).click();
  await expectSales(page, { total: '90,000원' }); // 저장되지 않았다

  // 두 번째로 정말 받은 돈이면 [그대로 등록] — 막지 않는다
  await visibleButton(page, '결제 등록').click();
  const pay3 = dialog(page, '결제 등록');
  await pickCustomer(page, accDup.customer, pay3);
  await pay3.getByLabel('결제 금액').fill('90000');
  await pay3.getByRole('button', { name: '결제 등록' }).click();
  await page.getByRole('dialog', { name: '같은 금액 결제가 이미 있습니다' }).getByRole('button', { name: '그대로 등록' }).click();
  await expectSales(page, { total: '180,000원' });

  // 금액이 다르면 묻지 않는다(경고가 잦으면 아무도 읽지 않는다)
  await registerPayment(page, accDup, 50000);
  await expectSales(page, { total: '230,000원' });
});

test('결제 등록 버튼을 두 번 빠르게 눌러도 한 건만 저장된다 (221, GAP P-4)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc2);
  await createCustomer(page, acc2);
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).filter({ visible: true }).first().click();
  const d = page.getByRole('dialog', { name: '결제 등록' });
  await expect(d).toBeVisible();
  await pickCustomer(page, acc2.customer, d);
  await d.getByLabel('결제 금액').fill('70000');
  // 먼저 잘못된 금액으로 막아 본다 — 가드가 검증 앞에 걸리면 이 뒤로 저장이 영구히 죽는다 (224, 221 리뷰 H-2)
  await d.getByLabel('결제 금액').fill('5만');
  await d.getByRole('button', { name: '결제 등록' }).click();
  await expect(d).toBeVisible(); // 거부돼 창이 남는다
  await d.getByLabel('결제 금액').fill('70000');
  await d.getByRole('button', { name: '결제 등록' }).dblclick(); // 한 제스처로 두 번 — 이중 제출 가드가 두 번째를 막아야 한다
  await expect(d).toHaveCount(0);
  // 매출 합계가 7만 원 한 건이어야 한다(두 건이면 14만 원·2건)
  await expect(page.getByText('70,000원').first()).toBeVisible();
  await expect(page.getByText('140,000원')).toHaveCount(0);
});

test('결제를 등록하면 다음 방문 예약을 그 자리에서 잡게 안내하고, 그 결과를 지표로 센다 (231·243, GAP R-11)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc3);
  await createCustomer(page, acc3);

  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).filter({ visible: true }).first().click();
  const d = page.getByRole('dialog', { name: '결제 등록' });
  await pickCustomer(page, acc3.customer, d);
  await d.getByLabel('결제 금액').fill('90000');
  await d.getByRole('button', { name: '결제 등록' }).click();
  await expect(d).toHaveCount(0);

  // 결제 직후 추천 — 첫 방문이라 매장 기본 주기(28일)로 안내하고, 근거를 그대로 적는다
  const prompt = page.getByTestId('rebook-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText(acc3.customer);
  await expect(prompt).toContainText('매장 기본 주기 28일');
  await expect(prompt.getByTestId('rebook-date')).not.toHaveText('');

  // [예약 잡기] → 예약 화면의 추가 창이 그 고객·추천 날짜로 열린다
  await prompt.getByRole('button', { name: '예약 잡기' }).click();
  const add = page.getByRole('dialog', { name: '예약 추가' });
  await expect(add).toBeVisible({ timeout: 10_000 });
  await expect(add.getByRole('combobox', { name: '고객' })).toHaveValue(new RegExp(acc3.customer)); // 입력칸은 "이름 (전화)" 로 보여 준다
  const dateValue = await add.getByLabel('예약 날짜').inputValue();
  expect(dateValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const todayISO = new Date().toLocaleDateString('sv-SE'); // 로컬 YYYY-MM-DD
  expect(dateValue > todayISO).toBe(true); // 과거·오늘이 아니라 앞날을 권한다

  // 추천한 날짜에 실제로 예약을 잡는다 — 성과 지표가 이 건을 세야 한다 (243)
  await add.getByLabel('담당 직원').selectOption({ index: 1 });
  await add.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await add.getByLabel('시작 시간').selectOption({ index: 1 });
  await add.getByRole('button', { name: '예약 저장' }).click();
  await expect(add).toHaveCount(0);

  // 안내는 한 번만 — 화면을 다시 열면 남아 있지 않다(결제 때마다 새로 계산한다)
  await page.goto('/sales');
  await expect(page.getByTestId('rebook-prompt')).toHaveCount(0);

  // 성과 지표 — 추천 1건·[예약 잡기] 1건·추천일 예약 1명, 그리고 추정이라는 사실을 함께 적는다 (243)
  const stats = page.getByTestId('rebook-stats');
  await expect(stats).toBeVisible();
  await expect(stats).toContainText('다음 방문 추천 1건');
  await expect(stats).toContainText('[예약 잡기] 1건(100%)');
  await expect(stats).toContainText('추천일에 예약이 잡힌 건 1건(100%)');
  await expect(stats).toContainText('추정');
});
