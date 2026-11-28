import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard } from './helpers';

/**
 * 민감 화면 PIN 잠금 (218) — 샵은 보통 계정 하나로 운영하므로(가입 1계정, 지점 앱에 계정 추가 화면 없음) 역할 분리 대신
 * 같은 계정 안에서 "이 화면은 PIN을 묻기" 로 차등을 둔다. 설정에서 고른 화면만 막히고, 매일 쓰는 예약·시술은 막지 않는다.
 */

const acc = makeAccount('SL');

test('설정에서 PIN을 켜고 민감 화면을 고르면 그 화면만 PIN을 묻고, 맞히면 열린다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);

  // 설정 > 백업·보안에서 PIN 켜기
  await page.goto('/settings');
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  const lockCard = page.getByTestId('app-lock-card');
  await lockCard.getByLabel('새 PIN').fill('4242');
  await lockCard.getByLabel('PIN 확인').fill('4242');
  await lockCard.getByLabel('잠금 대기 시간').selectOption('15');
  await lockCard.getByRole('button', { name: '잠금 켜기' }).click();
  await expect(lockCard.getByText(/사용 중/)).toBeVisible();

  // 전체 잠금은 끈다(218b) — 직원이 프로그램은 쓰고, 고른 화면에서만 PIN 을 묻는 구성
  await lockCard.getByTestId('app-lock-away').getByRole('checkbox').uncheck();
  await expect(page.getByTestId('app-lock')).toHaveCount(0);

  // 잠글 화면으로 "매출·손익" 만 고른다
  const screens = lockCard.getByTestId('app-lock-screens');
  await expect(screens).toBeVisible();
  await screens.getByLabel('매출·손익').check();

  // 매출 화면은 PIN을 묻는다
  await page.goto('/sales');
  const gate = page.getByTestId('screen-lock');
  await expect(gate).toBeVisible();
  await expect(gate).toContainText('매출·손익 화면은 PIN이 필요합니다');

  // 고르지 않은 화면(예약)은 그대로 열린다 — 매일 쓰는 입력을 막지 않는다
  await page.goto('/reservations');
  await expect(page.getByTestId('screen-lock')).toHaveCount(0);

  // 틀린 PIN은 거부, 맞는 PIN이면 열린다
  await page.goto('/sales');
  await gate.getByLabel('PIN').fill('1111');
  await gate.getByRole('button', { name: '확인' }).click();
  await expect(gate.getByRole('alert')).toContainText('PIN이 맞지 않습니다');
  await gate.getByLabel('PIN').fill('4242');
  await gate.getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('screen-lock')).toHaveCount(0);

  // 한 번 맞히면 앱 안에서 화면을 오가도 다시 묻지 않는다(메뉴로 이동 — 실제 사용 경로)
  await page.getByRole('link', { name: '예약 관리' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/reservations/);
  await page.getByRole('link', { name: '매출·손익 관리' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/sales/);
  await expect(page.getByTestId('screen-lock')).toHaveCount(0);

  // 프로그램을 다시 켜면(새로 고침) 다시 묻는다 — 풀어 둔 상태는 메모리에만 있다
  await page.reload();
  await expect(page.getByTestId('screen-lock')).toBeVisible();

  // 잠긴 동안에는 대시보드 금액 카드도 가려진다 — 게이트를 우회해 같은 숫자를 보던 길 (224, 218 리뷰 H-3)
  await page.goto('/');
  await expect(page.getByText('이번 달 총 매출')).toHaveCount(0);
  // PIN 을 통과하면 다시 보인다 — 메뉴로 이동(새로 고침은 잠금을 되살리므로 금액도 다시 가려지는 것이 맞다)
  await page.goto('/sales');
  await gate.getByLabel('PIN').fill('4242');
  await gate.getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('screen-lock')).toHaveCount(0);
  await page.getByRole('link', { name: '대시보드' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('이번 달 총 매출').filter({ visible: true }).first()).toBeVisible(); // PC·모바일 2중 DOM
});
