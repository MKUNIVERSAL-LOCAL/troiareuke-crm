import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, isNearMidnightSeoul, dismissToasts, visibleButton } from './helpers';
import { staffScenario } from './scenarios';

/**
 * 직원 흐름 E2E (PC 폭, 2026-11-19 ㉙) — 직원을 추가하면 예약 담당 선택지에 바로 뜨고, 완료 예약이 실적 표에 잡히며, 이름을 바꿔도(staffId 연결) 실적이 유지되고,
 * 퇴사 처리하면 새 예약 담당 목록에서 빠지되 기록·실적은 "(퇴사)"로 남는지. 같은 이름 재직자가 있으면 추가·수정·복직 모두 거절.
 * 시나리오 본문은 e2e/scenarios.ts(staffScenario) — 모바일 스펙과 공용 (2026-11-19 ㊸).
 */

const acc = makeAccount('ST');
const acc2 = makeAccount('ST2'); // 인센티브 비율 (233)

test('직원 추가 → 예약 담당 → 실적 → 이름 변경 → 퇴사·복직이 맞게 반영된다', async ({ page }) => {
  test.slow();
  test.skip(isNearMidnightSeoul(), '자정 경계 — 예약을 만든 날과 실적의 이번 달이 달라질 수 있다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await staffScenario(page, acc);
});

test('인센티브 비율을 정하면 직원별 수당 열이 생기고, 잘못된 비율은 하나도 저장하지 않는다 (233, GAP S-1)', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc2);

  await page.goto('/staff');
  const card = page.getByTestId('staff-performance');
  await expect(card).toBeVisible();
  await expect(card.getByText('수당(참고)')).toHaveCount(0); // 비율을 안 정했으면 0원 줄을 보여 주지 않는다

  // ── 비율 패널: 범위를 벗어난 값은 거절하고 아무것도 저장하지 않는다 ──
  await card.getByRole('button', { name: '인센티브 비율' }).click();
  const panel = page.getByTestId('commission-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('매장 기본 시술 비율').fill('60');
  await panel.getByRole('button', { name: '비율 저장' }).click();
  await expect(page.getByText(/비율은 0~50 사이 숫자로/)).toBeVisible();
  await expect(card.getByText('수당(참고)')).toHaveCount(0);
  await dismissToasts(page);

  // ── 정상 비율 저장 → 표에 수당 열과 합계가 생긴다 ──
  await panel.getByLabel('매장 기본 시술 비율').fill('12.5');
  await panel.getByLabel('매장 기본 제품 비율').fill('5');
  await panel.getByRole('button', { name: '비율 저장' }).click();
  await expect(page.getByText('인센티브 비율을 저장했습니다.')).toBeVisible();
  await dismissToasts(page);
  await expect(card.getByText('수당(참고)')).toBeVisible();
  await expect(card.getByTestId('commission-total')).toContainText('시술 12.5% × 실결제액 + 제품 5% × 제품 판매액');
  await expect(card.getByText(/수당은 참고 계산입니다/)).toBeVisible(); // 한계를 함께 적는다

  // ── 새로고침해도 비율이 남는다(설정 행 저장) ──
  await page.reload();
  await expect(page.getByTestId('staff-performance').getByText('수당(참고)')).toBeVisible();
  await visibleButton(page, '인센티브 비율').click();
  await expect(page.getByTestId('commission-panel').getByLabel('매장 기본 시술 비율')).toHaveValue('12.5');
});
