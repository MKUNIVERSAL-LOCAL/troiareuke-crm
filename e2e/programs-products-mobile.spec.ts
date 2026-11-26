import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { programsProductsScenario } from './scenarios';

/**
 * 모바일 폭 회차권·제품 흐름 E2E (Pixel 7, 2026-11-19 ㊴) — PC 스펙과 같은 시나리오(e2e/scenarios.ts)를
 * 전체 화면 고객 상세·카드 목록(products-mobile-list)·바텀시트 창에서 돌린다.
 */

const acc = makeAccount('PM');

test('모바일 폭에서도 회차권 판매 → 시술 차감 → 제품 판매·취소가 재고·매출에 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await programsProductsScenario(page, acc);

  // 278(GAP Q-3): 판매 기록 카드 목록을 스펙이 보지 않았다 — 취소한 판매가 **취소로 보이고**
  // 목록 자신의 합계에서도 빠지는지(취소분을 매출로 세면 그 화면이 거짓을 말한다).
  await page.goto('/products?tab=sales');
  const sales = page.getByTestId('product-sales-mobile-list');
  await expect(sales).toBeVisible();
  await expect(sales).toContainText('수분 세럼');
  await expect(sales).toContainText('1개 × 48,000원');
  await expect(sales).toContainText('취소(환불)');
  await expect(sales).toContainText('표시분 합계(최근 60건)');
  await expect(sales.getByRole('listitem').last()).toContainText('0원'); // 취소분은 합계에 넣지 않는다
});
