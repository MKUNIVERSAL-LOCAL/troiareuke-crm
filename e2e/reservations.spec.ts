import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 예약 흐름 E2E (로컬 모드) — 예약 3건(완료·노쇼·취소)이 대시보드 집계, 직원 월 실적, 고객 노쇼 횟수에 숫자로 맞게 반영되는지 (2026-11-19).
 */

const acc = makeAccount('RV');

async function addReservation(page: import('@playwright/test').Page, startTime: string) {
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  const dialog = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc.customer, dialog);
  await dialog.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await dialog.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await dialog.getByLabel('시작 시간').selectOption(startTime);
  await dialog.getByRole('button', { name: '예약 저장' }).click(); // 휴무일 confirm은 dialog 핸들러가 수락
  await expect(dialog).toHaveCount(0);
}

/** 주간 캘린더의 예약 블록(고객명 텍스트) n번째를 눌러 상세를 연다 */
async function openDetail(page: import('@playwright/test').Page, nth: number) {
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).nth(nth).click();
  const detail = page.getByRole('dialog', { name: '예약 상세' });
  await expect(detail).toBeVisible();
  return detail;
}

test('예약 완료·노쇼·취소가 대시보드·직원 실적·고객 노쇼 횟수에 맞게 반영된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/reservations');
  await addReservation(page, '10:00');
  await addReservation(page, '12:00');
  await addReservation(page, '14:00');
  await expect(page.getByText(acc.customer, { exact: true }).filter({ visible: true })).toHaveCount(3);

  // ── 1건 완료처리 (결제 등록 창은 등록 없이 닫기) ──
  let detail = await openDetail(page, 0);
  await detail.getByRole('button', { name: '완료처리' }).click();
  await page.getByRole('button', { name: '결제 등록 없이 닫기' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 1건 노쇼 (confirm 수락) ──
  detail = await openDetail(page, 1);
  await detail.getByRole('button', { name: '노쇼', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 1건 취소처리 (confirm 수락) ──
  detail = await openDetail(page, 2);
  await detail.getByRole('button', { name: '취소처리' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 대시보드: 오늘 예약은 노쇼·취소를 뺀 1건(활성 기준), 완료 1건 · 대기 0건 ──
  await page.goto('/');
  const todayCard = page.getByText('오늘 예약', { exact: true }).filter({ visible: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await expect(todayCard).toContainText('1건');
  await expect(todayCard).toContainText('완료 1건 · 대기 0건');

  // ── 직원 월 실적: 완료 1건 · 완료 예약액 50,000원 (노쇼·취소는 제외) ──
  await page.goto('/staff');
  const perfRow = page.getByTestId('staff-performance').locator('tr').filter({ hasText: '김테스트' }).first();
  await expect(perfRow).toContainText('1건');
  await expect(perfRow).toContainText('50,000원');

  // ── 고객 상세: 노쇼 1회 ──
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('noshow-badge').first()).toContainText('노쇼 1회');
});
