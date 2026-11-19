import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { periodProgramScenario } from './scenarios';

/**
 * 기간제(무제한) 프로그램 흐름 E2E (PC 폭, 2026-11-19 ㉘) — 횟수 제한이 없는 프로그램이 등록 → 판매(만료일 = 구매일+유효기간) → 시술 기록 연결(자동 완료되지 않음)
 * → 관리에서 완료 처리 → 매출까지 맞게 흐르는지. 시나리오 본문은 e2e/scenarios.ts(periodProgramScenario) — 모바일 스펙과 공용 (2026-11-19 ㊸).
 */

const acc = makeAccount('PT');

test('기간제 프로그램은 횟수 제한 없이 기록되고 만료일·완료 처리·매출이 맞다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 만료일(오늘+90) 계산이 날짜를 넘긴다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await periodProgramScenario(page, acc);
});
