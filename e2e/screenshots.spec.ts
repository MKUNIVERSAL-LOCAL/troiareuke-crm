import { test } from '@playwright/test';
import path from 'node:path';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, solidPng } from './helpers';

/**
 * 화면 스크린샷 세트 생성기 — 시각 QA·스토어 등록 스크린샷용. 기본 E2E에서는 건너뛴다.
 * 실행: SHOTS=1 npx playwright test e2e/screenshots.spec.ts [--project=mobile|chromium]
 * 출력: SHOTS_DIR(기본 test-results/shots)/<project>/<화면>.png
 * 로컬 모드 빌드(dist-e2e)에 고객·시술(사진 2장)·제품·결제를 심어 "데이터가 있는 상태"를 찍는다.
 */

const acc = makeAccount('SS');
const OUT = process.env.SHOTS_DIR || path.join('test-results', 'shots');

test.skip(!process.env.SHOTS, 'SHOTS=1 일 때만 실행');

test('주요 화면 스크린샷', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  page.on('dialog', d => d.accept());
  const dir = path.join(OUT, testInfo.project.name);
  const shot = (name: string) => page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 시술 기록 + 사진 2장 (Before/After 카드가 보이도록)
  await page.goto('/treatments');
  await page.getByRole('button', { name: '시술 기록 추가' }).click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles([
    { name: 'before.png', mimeType: 'image/png', buffer: solidPng(64, [214, 150, 140]) },
    { name: 'after.png', mimeType: 'image/png', buffer: solidPng(64, [150, 200, 170]) },
  ]);
  await page.getByLabel('촬영 각도').nth(0).selectOption('front');
  await page.getByLabel('촬영 각도').nth(1).selectOption('front');
  await shot('treatment-form');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await dismissToasts(page);
  await shot('treatments');

  // 제품 + 결제
  await page.goto('/products');
  await page.getByRole('button', { name: '제품 추가' }).filter({ visible: true }).first().click();
  await page.getByPlaceholder('제품명 입력').fill('수분 세럼 30ml');
  await page.getByPlaceholder('0').nth(0).fill('48000');
  await page.getByPlaceholder('0').nth(1).fill('20000');
  await page.getByPlaceholder('0').nth(2).fill('12');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await dismissToasts(page);
  await shot('products');

  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).filter({ visible: true }).first().click();
  const payForm = page.locator('form').filter({ hasText: '결제 구분' });
  await payForm.locator('select').first().selectOption({ index: 1 });
  await payForm.getByPlaceholder('0').first().fill('120000');
  await payForm.getByRole('button', { name: '결제 등록' }).click();
  await dismissToasts(page);
  await shot('sales-overview');
  await page.getByRole('button', { name: /결제 내역/ }).filter({ visible: true }).first().click();
  await shot('sales-list');

  // 예약
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click();
  await dismissToasts(page);
  await shot('reservations');

  // 고객 상세 (Before/After 포함)
  await page.goto('/customers');
  await shot('customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await page.waitForTimeout(300);
  await shot('customer-detail');
  const compare = page.getByRole('button', { name: '비교 보기' });
  if (await compare.count()) {
    await compare.scrollIntoViewIfNeeded();
    await compare.click();
    await page.waitForTimeout(200);
    await shot('customer-before-after');
  }

  for (const [route, name] of [['/', 'dashboard'], ['/programs', 'programs'], ['/staff', 'staff'], ['/messaging', 'messaging'], ['/settings', 'settings']] as const) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await shot(name);
  }
});
