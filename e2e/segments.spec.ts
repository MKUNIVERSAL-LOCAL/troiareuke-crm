import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';

/**
 * 저장 세그먼트(조건 조합) — 고객 목록 칩 필터 + 발송 창 대상 (166, GAP C-6·M-2)
 * 빈 조건은 저장 거절 → "방문 0회·다음 예약 없음" 세그먼트 저장 → 칩 1명 → 목록 좁힘 → 발송 창에서 같은 세그먼트 1명 → 조건 바꿔 0명.
 */

const acc = makeAccount('SG');

test('세그먼트를 조건으로 만들고 고객 목록·발송 대상에 쓴다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/customers');
  const row = page.getByTestId('segment-filter').filter({ visible: true }).first();
  await row.getByRole('button', { name: '+ 세그먼트' }).click();
  const editor = page.getByTestId('segment-editor');
  await editor.getByLabel('세그먼트 이름').fill('첫 방문 전 고객');
  await editor.getByTestId('segment-save').click();
  await expect(page.getByText('조건을 하나 이상 넣어주세요').first()).toBeVisible(); // 빈 조건 거절
  await editor.getByLabel('최대 방문 횟수').fill('0');
  await editor.getByLabel('다음 예약').selectOption('no');
  await expect(editor.getByTestId('segment-count')).toHaveText('1');
  await editor.getByTestId('segment-save').click();
  await expect(editor).toHaveCount(0);

  // 칩 선택 → 목록 좁힘(1명), 설명 title
  const chip = row.getByRole('button', { name: /^첫 방문 전 고객 \d+$/ }); // 편집 버튼(…세그먼트 편집)과 구분
  await expect(chip).toContainText('1');
  await expect(chip).toHaveAttribute('title', '방문 0회 이하 · 다음 예약 없음');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible();

  // 발송 창 대상 칩에 저장 세그먼트가 (1명) 으로 보인다
  await page.goto('/messaging');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  const send = page.getByRole('dialog', { name: '메시지 발송' });
  await send.getByRole('button', { name: '첫 방문 전 고객 (1명)' }).click();
  await expect(send).toContainText('1명');
  await page.keyboard.press('Escape');

  // 빠른 발송 카드에도 세그먼트 카드
  await expect(page.getByRole('button', { name: /첫 방문 전 고객/ }).first()).toContainText('1명');

  // 편집: 조건을 "방문 3회 이상" 으로 → 0명
  await page.goto('/customers');
  await chip.click();
  await row.getByRole('button', { name: '첫 방문 전 고객 세그먼트 편집' }).click();
  await editor.getByLabel('최대 방문 횟수').fill('');
  await editor.getByLabel('최소 방문 횟수').fill('3');
  await expect(editor.getByTestId('segment-count')).toHaveText('0');
  await editor.getByTestId('segment-save').click();
  await expect(chip).toContainText('0');
});
