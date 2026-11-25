import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, dismissToasts } from './helpers';
import { addProduct, sellProduct } from './flows';

/**
 * 발주 제안 (248, GAP P-5 계열) — 재고 알림이 "안전재고보다 적다" 에서 멈춰,
 * 며칠 남았는지·몇 개 주문할지는 사장이 판매 기록을 뒤져 계산했다(그래서 늘 다 떨어진 뒤에 주문한다).
 * 판매가 있는 제품과 없는 제품을 섞어 두고, 제안 수량·근거·복사까지 본다.
 */

const acc = makeAccount('RO');

test('발주 제안 — 판매 속도로 수량을 제안하고 근거를 적고, 목록을 복사한다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);

  // 많이 팔리는 제품(재고 5, 안전재고 3) + 안 팔리지만 재고가 안전재고보다 적은 제품
  await addProduct(page, { name: '발주앰플', price: 30000, stock: 5 });
  await addProduct(page, { name: '발주팩', price: 5000, stock: 1 });
  await dismissToasts(page);

  // 발주앰플 2개 판매(오늘)
  await sellProduct(page, '발주앰플');
  await dismissToasts(page);
  await sellProduct(page, '발주앰플');
  await dismissToasts(page);

  await page.getByTestId('reorder-open').click();
  const panel = page.getByTestId('reorder');
  await expect(panel).toBeVisible();

  // 판매가 있는 제품은 하루 판매량·남은 일수를 근거로 적는다
  const ampoule = panel.getByTestId('reorder-row').filter({ hasText: '발주앰플' });
  await expect(ampoule).toBeVisible();
  await expect(ampoule).toContainText('주문 권장');
  await expect(ampoule).toContainText('2개 판매'); // 센 날수는 첫 판매일 기준이라 "최근 1일" 일 수 있다 (250 리뷰 M-8)
  await expect(ampoule).toContainText('현재고 3개');

  // 한계를 숨기지 않는다
  await expect(panel).toContainText('최근 판매 속도로 계산한 제안입니다');

  // 커버 일수를 늘리면 제안 수량도 커진다(공식이 화면과 맞는지)
  const qtyText = async () => (await ampoule.textContent()) || '';
  const before = await qtyText();
  await panel.getByLabel('며칠분을 채울지').selectOption('60');
  await expect(ampoule).not.toHaveText(before);

  // 복사 — 실제 클립보드 내용까지 확인(가짜 성공 금지)
  await panel.getByTestId('reorder-copy').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('[발주 요청]');
  expect(copied).toContain('발주앰플');
  expect(copied).toContain('수량은 매장이 확인 후 확정합니다');
});
