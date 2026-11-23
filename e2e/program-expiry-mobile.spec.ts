import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { programExpiryScenario } from './scenarios';

/** 모바일 폭 회차권 만료 흐름 (Pixel 7, 2026-11-19 ㊸) — PC 스펙과 같은 시나리오(e2e/scenarios.ts)를 전체 화면 고객 상세·바텀시트 창에서 돌린다. */

const acc = makeAccount('PXM');

test('모바일 폭에서도 만료된 회차권은 차감할 수 없고, 연장하면 다시 쓸 수 있다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 연장 만료일(오늘+30) 계산이 날짜를 넘긴다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await programExpiryScenario(page, acc);
});
