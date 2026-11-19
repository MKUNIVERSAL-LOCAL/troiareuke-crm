import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { salesScenario } from './scenarios';

/**
 * 모바일 폭 돈 흐름 E2E (Pixel 7, 2026-11-19 ㊳) — PC 스펙(sales.spec)과 같은 시나리오(e2e/scenarios.ts)를
 * 모바일 카드 목록(sales-mobile-list·expense-mobile-list)·바텀시트 창에서 돌린다. 선택자는 "보이는 쪽"만 잡아 폭에 따라 달라지지 않는다.
 */

const acc = makeAccount('SM');

test('모바일 폭에서도 결제 → 지출 → 손익계산서 → 환불이 숫자로 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await salesScenario(page, acc);
});
