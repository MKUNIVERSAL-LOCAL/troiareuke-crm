import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { salesScenario } from './scenarios';

/**
 * 돈 흐름 E2E (PC 폭) — 결제 → 지출(매입) → 손익계산서 → 환불이 숫자로 맞게 반영되는지.
 * 상용 CRM에서 가장 비싼 결함은 "화면은 멀쩡한데 금액이 틀린" 것이라 매출·원가·영업이익·환불을 값으로 고정한다 (2026-11-18).
 * 시나리오 본문은 e2e/scenarios.ts(salesScenario) — 모바일 스펙(sales-mobile.spec)과 같은 함수를 쓴다 (2026-11-19 ㊷).
 */

const acc = makeAccount('SL');

test('결제 → 지출 → 손익계산서 → 환불이 숫자로 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await salesScenario(page, acc);
});
