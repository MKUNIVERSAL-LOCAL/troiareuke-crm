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
  await expect(confirm).toContainText('전체 증감 합계 -2'); // 앞 3종 예시만 보고 넘기지 않도록 합계를 적는다 (246 리뷰 M-6)
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

test('재고 실사 — 세는 동안 다른 PC 가 재고를 바꾸면 그 사실을 알려 준다 (269)', async ({ page, context }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const accTab = makeAccount('SC2');
  await signupAndOnboard(page, accTab);
  await addProduct(page, { name: '동시앰플', price: 20000, stock: 10 });
  await dismissToasts(page);

  // 실사 창을 열어 수량을 적는 중
  await page.getByTestId('stock-count-open').click();
  const count = page.getByTestId('stock-count');
  await expect(count).toBeVisible();
  await count.getByLabel('동시앰플 실제 수량').fill('9');
  await expect(count.getByTestId('stock-count-changed')).toHaveCount(0); // 아직 아무 일도 없다

  // 그 사이 다른 탭(=다른 PC)에서 판매·입고로 재고가 바뀐다 → storage 이벤트로 이 탭이 알아챈다
  const other = await context.newPage();
  await other.goto('/products');
  await other.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_products$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const p = list.find((x: { name: string }) => x.name === '동시앰플');
    p.stock = 6; // 다른 PC 에서 4개 판매
    localStorage.setItem(key, JSON.stringify(list));
  });
  await expect(count.getByTestId('stock-count-changed')).toContainText('제품 1종의 재고가 다른 곳에서 바뀌었습니다', { timeout: 10_000 });
  await expect(count.getByTestId('stock-count-changed')).toContainText('다시 세어주세요');
  await other.close();

  // 반영을 눌러도 그 제품은 건너뛴다 — 옛 숫자로 덮지 않는다(246 리뷰 M-5)
  await count.getByRole('button', { name: /실사 반영/ }).click();
  // 확인창과 실사 창이 같은 이름을 쓰므로 confirm-dialog 로 집는다
  await page.getByTestId('confirm-dialog').getByRole('button', { name: '실사 반영', exact: true }).click();
  await expect(page.getByText(/그 사이 재고가 바뀌어 건너뛰었습니다|맞출 제품이 없었습니다/).first()).toBeVisible();
  await expectStock(page, '동시앰플', 6); // 다른 PC 가 적은 6 이 그대로 남는다(9 로 덮지 않는다)
});
