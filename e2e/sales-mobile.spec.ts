import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, visibleButton } from './helpers';
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

  // 278(GAP Q-3): 이 파일 머리말이 `expense-mobile-list` 를 이름까지 적어 두고도 스펙은 그 목록을 보지 않았다
  // (가드는 "스펙이 아직 없다" 고 셌지만, 사실은 흐름은 돌리고 **카드 한 줄의 내용**만 안 보던 것).
  await visibleButton(page, /지출 내역 \(1\)/).click();
  const expenses = page.getByTestId('expense-mobile-list');
  await expect(expenses).toBeVisible();
  await expect(expenses.getByRole('listitem')).toHaveCount(1);
  await expect(expenses).toContainText('앰플 20개 매입');
  await expect(expenses).toContainText('임대료');   // 시나리오가 바꾼 분류가 카드에도 보인다
  await expect(expenses).toContainText('20,000원');
});
