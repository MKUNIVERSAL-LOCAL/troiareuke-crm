import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { staffScenario } from './scenarios';

/** 모바일 폭 직원 흐름 (Pixel 7, 2026-11-19 ㊸) — PC 스펙과 같은 시나리오(e2e/scenarios.ts). 예약은 카드 목록, 직원 카드·상세·수정 창은 공용 레이아웃. */

const acc = makeAccount('STM');

test('모바일 폭에서도 직원 추가 → 예약 담당 → 실적 → 이름 변경 → 퇴사·복직이 맞게 반영된다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약을 만든 날과 실적의 이번 달이 달라질 수 있다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await staffScenario(page, acc);
});
