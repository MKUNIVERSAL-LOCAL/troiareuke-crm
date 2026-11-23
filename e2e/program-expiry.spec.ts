import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { programExpiryScenario } from './scenarios';

/**
 * 회차권 만료 흐름 E2E (PC 폭, 2026-11-19 ㉗) — 구매일을 과거로 등록해 만료된 회차권이 '만료'로 표시되고 차감 선택지에 뜨지 않으며(안내만),
 * 관리에서 만료일을 연장하면 다시 선택·차감되는지. 완료 처리하면 선택지에서 빠지고, 되돌리면 잔여 회차가 그대로 돌아온다.
 * 시나리오 본문은 e2e/scenarios.ts(programExpiryScenario) — 모바일 스펙과 공용 (2026-11-19 ㊸).
 */

const acc = makeAccount('PX');

test('만료된 회차권은 차감할 수 없고, 연장하면 다시 쓸 수 있다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 연장 만료일(오늘+30) 계산이 날짜를 넘긴다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await programExpiryScenario(page, acc);
});
