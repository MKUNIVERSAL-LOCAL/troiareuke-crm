import { test } from '@playwright/test';
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
});
