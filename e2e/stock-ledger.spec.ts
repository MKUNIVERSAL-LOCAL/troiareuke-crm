import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, visibleButton } from './helpers';
import { dialog, addProduct, expectStock, sellProduct, cancelFirstSale } from './flows';

/**
 * 재고 입출고 원장 (145, GAP P-5) — 제품 10개로 시작 → 입고 5(단가 5,000, 지출 기록) → 판매 1 → 실사 12(이유) → 판매 취소.
 * 이력 창에 시작·입고·판매·실사·취소 행이 남고 원장 합계 = 현재 재고. 입고 지출은 매출·손익 지출 내역에 "앰플 5개 입고"로 보인다.
 * 기록 없는 이동(다른 기기)은 "차이를 조정으로 기록"으로 원장을 재고에 맞춘다 — localStorage 를 직접 바꿔 흉내 낸다.
 */

const acc = makeAccount('SL');

async function openLedger(page: import('@playwright/test').Page, name: string) {
  await page.goto('/products');
  await page.getByTestId('product-row').filter({ hasText: name }).filter({ visible: true }).first().getByRole('button', { name: `${name} 재고 이력` }).click();
  const d = dialog(page, '재고 이동 이력');
  await expect(d).toBeVisible();
  return d;
}

test('입고·판매·실사·취소가 재고 이력에 남고 원장 합계가 현재 재고와 맞는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await addProduct(page, { name: '앰플', price: 30000, stock: 10 });

  // 입고 5 (단가 5,000 → 지출 25,000)
  await page.getByTestId('product-row').filter({ hasText: '앰플' }).filter({ visible: true }).first().getByRole('button', { name: '앰플 입고·조정' }).click();
  const adj = dialog(page, '재고 입고·조정');
  await adj.getByLabel('입고 수량').fill('5');
  await adj.getByLabel('매입 단가').fill('5000');
  await adj.getByLabel('메모').fill('11월 발주');
  await adj.getByRole('button', { name: '입고 저장' }).click();
  await expect(adj).toHaveCount(0);
  await expectStock(page, '앰플', 15);

  // 판매 1 → 14
  await sellProduct(page, '앰플');
  await expectStock(page, '앰플', 14);

  let ledger = await openLedger(page, '앰플');
  const rows = ledger.getByTestId('stock-entry');
  await expect(rows).toHaveCount(3); // 시작 10, 입고 +5, 판매 -1
  await expect(rows.nth(0)).toContainText('판매');
  await expect(rows.nth(0)).toContainText('-1개');
  await expect(rows.nth(1)).toContainText('입고');
  await expect(rows.nth(1)).toContainText('+5개');
  await expect(rows.nth(1)).toContainText('단가 5,000원');
  await expect(rows.nth(1)).toContainText('11월 발주');
  await expect(rows.nth(2)).toContainText('시작 재고');
  await expect(ledger.getByTestId('stock-reconcile')).toContainText('원장 합계 14개 · 현재 재고 14개 · 일치');
  await page.keyboard.press('Escape');
  await expect(ledger).toHaveCount(0);

  // 실사 12 (이유) → 조정 -2
  await page.getByTestId('product-row').filter({ hasText: '앰플' }).filter({ visible: true }).first().getByRole('button', { name: '앰플 입고·조정' }).click();
  await adj.getByRole('button', { name: /실사 조정/ }).click();
  await adj.getByLabel('실제 재고 수량').fill('12');
  await adj.getByLabel('조정 이유').fill('파손 2개 폐기');
  await adj.getByRole('button', { name: '조정 저장' }).click();
  await expect(adj).toHaveCount(0);
  await expectStock(page, '앰플', 12);

  // 판매 취소 → 13
  await cancelFirstSale(page);
  await expectStock(page, '앰플', 13);

  ledger = await openLedger(page, '앰플');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('판매 취소');
  await expect(rows.nth(0)).toContainText('+1개');
  await expect(rows.nth(1)).toContainText('실사 조정');
  await expect(rows.nth(1)).toContainText('-2개');
  await expect(rows.nth(1)).toContainText('파손 2개 폐기');
  await expect(ledger.getByTestId('stock-reconcile')).toContainText('원장 합계 13개 · 현재 재고 13개 · 일치');
  await page.keyboard.press('Escape');
  await expect(ledger).toHaveCount(0);

  // 입고 지출이 손익 지출 내역에
  await page.goto('/sales');
  await visibleButton(page, /지출 내역/).click();
  await expect(page.getByText('앰플 5개 입고', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // 기록 없는 이동 흉내: 제품 재고를 저장소에서 11로 바꾸고 새로고침 → 차이 -2 → 조정으로 기록 → 일치
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_products$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    for (const p of list) if (p.name === '앰플') p.stock = 11;
    localStorage.setItem(key, JSON.stringify(list));
  });
  ledger = await openLedger(page, '앰플');
  await expect(ledger.getByTestId('stock-reconcile')).toContainText('차이 -2개');
  await ledger.getByRole('button', { name: '차이를 조정으로 기록' }).click();
  await expect(ledger.getByTestId('stock-reconcile')).toContainText('원장 합계 11개 · 현재 재고 11개 · 일치');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText('조정');
  await expect(rows.nth(0)).toContainText('-2개');
});
