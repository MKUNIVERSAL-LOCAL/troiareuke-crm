import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, visibleButton } from './helpers';
import { registerPayment } from './flows';

/**
 * 결제 영수증 E2E (235, GAP P-9)
 * 고객이 "영수증 주세요" 할 때 줄 것이 없었다 → 결제 내역의 [영수증] 으로 A4 PDF 를 저장한다.
 * 설정 > 매장 정보의 사업자등록번호·대표자명이 머리말에 들어가고, 없으면 안내가 대신 들어간다(가짜로 비워 인쇄하지 않는다).
 */

const acc = makeAccount('RC');

test('결제 내역에서 영수증 PDF 를 저장한다', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 영수증 인쇄 정보 저장 — 설정 행(NAS 동기)
  await page.goto('/settings');
  await visibleButton(page, '매장 정보').click();
  const info = page.getByTestId('settings-receipt-info');
  await expect(info).toBeVisible();
  await info.getByLabel('사업자등록번호').fill('123-45-67890');
  await info.getByLabel('대표자명').fill('홍길동');
  await info.getByRole('button', { name: '영수증 정보 저장' }).click();
  await expect(page.getByText('영수증 인쇄 정보를 저장했습니다.')).toBeVisible();
  await dismissToasts(page);

  // 결제 1건 등록 → 결제 내역에서 영수증 저장
  await page.goto('/sales');
  await registerPayment(page, acc, 90000);
  await dismissToasts(page);
  await page.getByRole('button', { name: '결제 내역' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '영수증 저장' }).filter({ visible: true }).first().click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/_영수증_\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(file.suggestedFilename()).toContain(acc.customer);
  await expect(page.getByText('영수증 PDF를 저장했습니다.')).toBeVisible({ timeout: 15_000 });

  // 설정값이 새로고침 뒤에도 남는다(다음 영수증에도 찍힌다)
  await page.goto('/settings');
  await visibleButton(page, '매장 정보').click();
  await expect(page.getByTestId('settings-receipt-info').getByLabel('사업자등록번호')).toHaveValue('123-45-67890');
});
