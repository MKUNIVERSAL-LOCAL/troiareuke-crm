import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { addProgram, sellProgramToCustomer, logTreatment, openProgramManage, expectProgramSessions, openCustomer } from './flows';

/**
 * 회차권 원장(이력) (146, GAP P-1) — 등록(+10) → 시술(−1) → 총 회차 12 보정(+2, 사유) → 시술 기록 삭제(1회 복원 줄).
 * 관리 창의 "회차 이력"이 날짜순 행과 잔여를 보여 주고, 원장 잔여 = 기록 기준 잔여(일치)가 유지된다.
 */

const acc = makeAccount('PL');

test('회차권 등록·시술·보정·기록 삭제가 회차 이력에 남고 원장 잔여가 기록 기준과 맞는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await addProgram(page, { name: '수분관리 10회권', price: 300000, sessions: 10 });
  await sellProgramToCustomer(page, acc, '수분관리 10회권 — 300,000원');
  await logTreatment(page, acc, '수분관리 10회권 · 잔여 10회 (0/10)');

  await openCustomer(page, acc);
  let manage = await openProgramManage(page, '수분관리 10회권');
  const rows = manage.getByTestId('program-ledger-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('시술');
  await expect(rows.nth(0)).toContainText('-1회');
  await expect(rows.nth(0)).toContainText('잔여 9회');
  await expect(rows.nth(1)).toContainText('등록');
  await expect(rows.nth(1)).toContainText('+10회');
  await expect(rows.nth(1)).toContainText('300,000원');
  await expect(manage.getByTestId('program-ledger')).toContainText('원장 잔여 9회 · 기록 기준 9회 · 일치');

  // 총 회차 10 → 12 (사유)
  await manage.getByLabel('총 회차').fill('12');
  await manage.getByLabel('사유').fill('서비스 2회 추가');
  await manage.getByRole('button', { name: '저장', exact: true }).click();
  await expect(manage).toHaveCount(0);
  await expectProgramSessions(page, '수분관리 10회권', 1, 12);
  manage = await openProgramManage(page, '수분관리 10회권');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('회차 보정');
  await expect(rows.nth(0)).toContainText('+2회');
  await expect(rows.nth(0)).toContainText('잔여 11회');
  await expect(rows.nth(0)).toContainText('서비스 2회 추가');
  await expect(rows.nth(2)).toContainText('총 10회'); // 등록 행은 보정 전 값
  await expect(manage.getByTestId('program-ledger')).toContainText('원장 잔여 11회 · 기록 기준 11회 · 일치');
  await page.keyboard.press('Escape');
  await expect(manage).toHaveCount(0);

  // 시술 기록 삭제 → 1회 복원 줄, 시술 행은 사라진다
  await page.goto('/treatments');
  await page.getByRole('button').filter({ hasText: acc.customer }).filter({ visible: true }).first().click();
  await expect(page.getByText('시술 기록 상세').filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '삭제', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: '정말 삭제', exact: true }).click();
  await expect(page.getByText('시술 기록 상세')).toHaveCount(0);

  await openCustomer(page, acc);
  await expectProgramSessions(page, '수분관리 10회권', 0, 12);
  manage = await openProgramManage(page, '수분관리 10회권');
  await expect(rows).toHaveCount(3); // 등록·보정·복원 (시술 행은 삭제됨)
  await expect(rows.nth(0)).toContainText('복원');
  await expect(rows.nth(0)).toContainText('1회 복원');
  await expect(manage.getByTestId('program-ledger')).toContainText('원장 잔여 12회 · 기록 기준 12회 · 일치');
});
