import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { periodProgramScenario } from './scenarios';

/** 모바일 폭 기간제 프로그램 흐름 (Pixel 7, 2026-11-19 ㊸) — PC 스펙과 같은 시나리오(e2e/scenarios.ts). 이용 내역 목록은 PC 상세 패널 전용이라 있을 때만 확인한다. */

const acc = makeAccount('PTM');

test('모바일 폭에서도 기간제 프로그램은 횟수 제한 없이 기록되고 만료일·완료 처리·매출이 맞다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 만료일(오늘+90) 계산이 날짜를 넘긴다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await periodProgramScenario(page, acc);
});
