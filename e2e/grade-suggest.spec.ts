import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';
import { registerPayment } from './flows';

/**
 * 고객 등급 자동 제안 E2E (236, GAP C-1)
 * 등급이 전부 수동이라 단골이 '신규' 로 남았다 → 올릴 후보를 보여 주고, 고른 고객만 올린다.
 * 자동으로 바뀌지 않는다는 것이 핵심이라 "후보에 뜬다 → 고르면 바뀐다" 두 단계를 모두 확인한다.
 */

const acc = makeAccount('GR');

test('등급 올릴 후보를 보여 주고 고른 고객만 등급을 올린다', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 방문 기록이 없으면 후보에 뜨지 않는다(결제만으로는 올리지 않는다)
  await page.goto('/sales');
  await registerPayment(page, acc, 900000);
  await dismissToasts(page);
  await page.goto('/customers');
  await expect(page.getByTestId('grade-suggest-open')).toHaveCount(0);

  // 시술 기록 2건(서로 다른 날) → 방문 2회 → '일반' 후보
  for (const date of ['2026-11-10', '2026-11-20']) {
    await page.goto('/treatments');
    await page.getByRole('button', { name: '시술 기록 추가' }).click();
    const d = page.getByRole('dialog', { name: '시술 기록 추가' });
    await d.getByRole('combobox', { name: '고객' }).fill(acc.customer);
    await d.getByRole('option').first().click();
    await d.getByLabel('시술일').fill(date);
    await d.getByRole('button', { name: '저장', exact: true }).click();
    await expect(d).toHaveCount(0);
    await dismissToasts(page);
  }

  await page.goto('/customers');
  const open = page.getByTestId('grade-suggest-open').filter({ visible: true }).first(); // 칩 행은 PC·모바일 2중 DOM
  await expect(open).toBeVisible();
  await expect(open).toContainText('1명');
  await open.click();
  const panel = page.getByTestId('grade-suggest-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(acc.customer);
  await expect(panel).toContainText('신규 →');
  await expect(panel).toContainText('내리는 제안은 하지 않습니다'); // 기준·한계를 숨기지 않는다

  // 선택 해제하고 적용하면 아무것도 바뀌지 않는다(조용한 자동 변경 금지 확인)
  await panel.getByRole('checkbox').first().uncheck();
  await panel.getByRole('button', { name: /등급 올리기/ }).click();
  await expect(page.getByText('적용할 고객을 하나 이상 선택해주세요.')).toBeVisible();
  await dismissToasts(page);

  // 선택하고 적용하면 등급이 올라가고 후보에서 사라진다
  await panel.getByRole('checkbox').first().check();
  await panel.getByRole('button', { name: /등급 올리기/ }).click();
  // 되돌릴 수 없는 변경이라 확인창을 한 번 거친다 (238, 리뷰 H-3)
  const confirm = page.getByTestId('confirm-dialog');
  await expect(confirm).toContainText('1명의 등급을 올릴까요?');
  await expect(confirm).toContainText('되돌리려면 고객 상세에서');
  await confirm.getByRole('button', { name: '등급 올리기', exact: true }).click();
  await expect(page.getByText('1명의 등급을 올렸습니다.')).toBeVisible({ timeout: 10_000 });
  await dismissToasts(page);
  await expect(page.getByTestId('grade-suggest-open')).toHaveCount(0);
});
