import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, dismissToasts, visibleButton } from './helpers';
import { addProduct, expectStock } from './flows';

/**
 * 전 제품 재고 실사 (245, GAP P-5 후속) — 제품 하나씩 창을 열어 맞추던 실사를 한 화면에서 끝낸다.
 * 가장 중요한 두 가지: ① 빈칸(세지 않은 제품)을 0 으로 맞추지 않는다 ② 맞춘 제품은 원장에 실사 행이 남는다.
 */

const acc = makeAccount('SC');

test('재고 실사 — 적은 제품만 맞추고, 빈칸은 그대로 두고, 원장에 실사 행이 남는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);

  await addProduct(page, { name: '실사앰플', price: 30000, stock: 10 });
  await addProduct(page, { name: '실사팩', price: 5000, stock: 40 });
  await dismissToasts(page);

  await page.getByTestId('stock-count-open').click();
  const count = page.getByTestId('stock-count');
  await expect(count).toBeVisible();

  // 아무것도 적지 않으면 반영 버튼이 비활성(장식 UI 금지)
  await expect(count.getByTestId('stock-count-summary')).toContainText('아직 안 센 제품 2종');
  await expect(count.getByRole('button', { name: /실사 반영/ })).toBeDisabled();

  // 숫자가 아닌 입력은 그 자리에서 오류로 보이고 저장 대상이 되지 않는다
  await count.getByLabel('실사앰플 실제 수량').fill('여덟');
  await expect(count.getByTestId('stock-count-row').filter({ hasText: '실사앰플' })).toContainText('입력 오류');
  await expect(count.getByRole('button', { name: /실사 반영/ })).toBeDisabled();

  // 하나만 세고 하나는 빈칸으로 둔다
  await count.getByLabel('실사앰플 실제 수량').fill('8');
  await expect(count.getByTestId('stock-count-summary')).toContainText('맞출 제품 1종');
  await expect(count.getByTestId('stock-count-summary')).toContainText('아직 안 센 제품 1종');
  await count.getByLabel('실사 메모 (선택 — 원장에 함께 남습니다)').fill('11월 말 실사');
  await count.getByRole('button', { name: '1종 실사 반영' }).click();

  const confirm = page.getByRole('dialog', { name: '재고 실사 반영' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('실사앰플 10→8개');
  await expect(confirm).toContainText('적지 않은 제품 1종은 그대로 둡니다');
  await confirm.getByRole('button', { name: '실사 반영' }).click();
  await expect(count).toHaveCount(0);
  await dismissToasts(page);

  // 적은 제품만 바뀌고, 빈칸으로 둔 제품은 그대로다(0 으로 맞추지 않는다)
  await expectStock(page, '실사앰플', 8);
  await expectStock(page, '실사팩', 40);

  // 원장에 실사 행 — "왜 바뀌었는지" 가 남는다
  await visibleButton(page, '실사앰플 재고 이력', false).click();
  const ledger = page.getByTestId('stock-ledger');
  await expect(ledger).toBeVisible();
  await expect(ledger.getByTestId('stock-entry').filter({ hasText: '실사 조정' })).toContainText('실사 8개');
  await expect(ledger.getByTestId('stock-entry').filter({ hasText: '실사 조정' })).toContainText('11월 말 실사');
  await expect(ledger.getByTestId('stock-reconcile')).toContainText('일치'); // 원장 합 = 현재 재고
});
