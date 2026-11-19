import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { staffScenario } from './scenarios';

/**
 * 직원 흐름 E2E (PC 폭, 2026-11-19 ㉙) — 직원을 추가하면 예약 담당 선택지에 바로 뜨고, 완료 예약이 실적 표에 잡히며, 이름을 바꿔도(staffId 연결) 실적이 유지되고,
 * 퇴사 처리하면 새 예약 담당 목록에서 빠지되 기록·실적은 "(퇴사)"로 남는지. 같은 이름 재직자가 있으면 추가·수정·복직 모두 거절.
 * 시나리오 본문은 e2e/scenarios.ts(staffScenario) — 모바일 스펙과 공용 (2026-11-19 ㊸).
 */

const acc = makeAccount('ST');

test('직원 추가 → 예약 담당 → 실적 → 이름 변경 → 퇴사·복직이 맞게 반영된다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약을 만든 날과 실적의 이번 달이 달라질 수 있다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await staffScenario(page, acc);
});
