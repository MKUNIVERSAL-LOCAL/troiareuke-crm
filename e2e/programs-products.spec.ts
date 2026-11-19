import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { programsProductsScenario } from './scenarios';

/**
 * 회차권·제품 흐름 E2E (PC 폭) — 에스테틱 CRM의 핵심 비즈니스 로직을 숫자로 고정 (2026-11-19).
 * 회차권: 프로그램(10회 300,000) 등록 → 고객에게 판매(결제) → 시술 기록에서 회차 차감(자동 연결) → 잔여 9회, 매출 300,000.
 * 제품: 제품(48,000·재고 12) 등록 → 판매 1개 → 재고 11, 제품 매출 48,000(합계 348,000) → 판매 취소 → 재고 12·매출 300,000.
 * 시나리오 본문은 e2e/scenarios.ts(programsProductsScenario) — 모바일 스펙과 공용 (2026-11-19 ㊷).
 */

const acc = makeAccount('PP');

test('회차권 판매 → 시술 차감 → 잔여 회차, 제품 판매 → 재고·매출이 맞다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await programsProductsScenario(page, acc);
});
