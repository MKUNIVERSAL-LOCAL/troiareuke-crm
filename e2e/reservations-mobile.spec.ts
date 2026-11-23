import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { reservationsScenario } from './scenarios';

/**
 * 모바일 폭 예약 흐름 E2E (Pixel 7, 2026-11-19 ㊵) — PC 스펙과 같은 시나리오(e2e/scenarios.ts)를 모바일 카드 목록(reservation-card)·
 * 상세 창·모바일 대시보드 카드·모바일 고객 상세(noshow-count)에서 돌린다.
 */

const acc = makeAccount('RM');

test('모바일 폭에서도 예약 완료·노쇼·취소·복구가 대시보드·직원 실적·고객 노쇼 횟수에 맞게 반영된다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약을 만든 날과 대시보드의 오늘이 달라진다');
  page.on('dialog', d => (d.message().includes('이미 예약이 있습니다') ? d.dismiss() : d.accept()));
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await reservationsScenario(page, acc);
});
