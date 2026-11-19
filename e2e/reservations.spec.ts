import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul } from './helpers';
import { reservationsScenario } from './scenarios';

/**
 * 예약 흐름 E2E (PC 폭) — 예약 3건(완료·노쇼·취소→복구→재취소)이 대시보드 집계, 직원 월 실적, 고객 노쇼 횟수, 매출에 숫자로 맞게 반영되는지 (2026-11-19).
 * 이중예약 차단과 상태별 상세 버튼(완료 예약엔 완료처리 없음, 노쇼엔 취소처리 없음, 취소·노쇼엔 [예약 복구])도 함께.
 * 시나리오 본문은 e2e/scenarios.ts(reservationsScenario) — 모바일 스펙과 공용 (2026-11-19 ㊷).
 */

const acc = makeAccount('RV');

test('예약 완료·노쇼·취소가 대시보드·직원 실적·고객 노쇼 횟수에 맞게 반영된다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약을 만든 날과 대시보드의 오늘이 달라진다');
  // 겹침(이중예약) 경고만 거절하고 나머지 confirm(휴무일·노쇼·취소·복구)은 수락
  page.on('dialog', d => (d.message().includes('이미 예약이 있습니다') ? d.dismiss() : d.accept()));
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await reservationsScenario(page, acc);
});
