import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, dismissToasts } from './helpers';

/**
 * 태그 마스터 E2E (237, GAP C-1)
 * 태그를 매번 손으로 적어 "민감성·민감·민감성피부" 가 따로 쌓이면 태그 필터·발송 대상이 갈라진다 →
 * 매장 태그 목록을 정해 두고 고객 창에서 눌러 넣는다. 목록에서 지워도 고객에 붙은 태그는 남는다.
 */

const acc = makeAccount('TM');

test('태그 목록을 정하고 고객 창에서 눌러 넣는다', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);

  // 고객 등록 창 → 태그 목록 관리
  await page.goto('/customers');
  await page.getByRole('button', { name: '고객 추가' }).click();
  const add = page.getByRole('dialog', { name: '고객 추가' });
  await expect(add).toBeVisible();
  await add.getByTestId('tag-master-open').click();
  const panel = page.getByTestId('tag-master-panel');
  await expect(panel).toBeVisible();

  // 쓸 수 없는 이름은 사유를 알리고 추가되지 않는다
  await panel.getByLabel('새 태그').fill('광고동의:2026-11-26');
  await panel.getByRole('button', { name: '추가' }).click();
  await expect(page.getByText(/동의 설정에서만 관리/)).toBeVisible();
  await dismissToasts(page);
  await expect(panel.getByText('#광고동의:2026-11-26')).toHaveCount(0);

  // 정상 태그 2개 추가, 중복은 거절
  await panel.getByLabel('새 태그').fill('민감성');
  await panel.getByRole('button', { name: '추가' }).click();
  await panel.getByLabel('새 태그').fill(' #민감성 ');
  await panel.getByRole('button', { name: '추가' }).click();
  await expect(page.getByText(/이미 있는 태그/)).toBeVisible();
  await dismissToasts(page);
  await panel.getByLabel('새 태그').fill('재구매');
  await panel.getByRole('button', { name: '추가' }).click();
  await expect(panel.getByText('#민감성')).toBeVisible();
  await expect(panel.getByText('#재구매')).toBeVisible();
  await panel.getByRole('button', { name: '닫기' }).click();

  // 칩을 눌러 태그 입력칸에 들어간다(두 번 눌러도 하나)
  const chips = add.getByTestId('tag-chips');
  await chips.getByRole('button', { name: '#민감성' }).click();
  await chips.getByRole('button', { name: '#재구매' }).click();
  await chips.getByRole('button', { name: '#민감성' }).click();
  await expect(add.getByLabel('태그')).toHaveValue('민감성, 재구매');

  // 고객을 저장하면 태그가 붙는다
  await add.getByPlaceholder('홍길동').fill(acc.customer);
  await add.getByPlaceholder('010-0000-0000').fill(acc.customerPhone);
  await add.getByText('[필수] 개인정보 수집·이용 동의').click();
  await add.getByRole('button', { name: '등록', exact: true }).click();
  await expect(add).toHaveCount(0);
  await dismissToasts(page);
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await expect(page.getByTestId('customer-tags')).toContainText('#민감성');

  // 목록 설정은 새로고침 뒤에도 남는다(설정 행 저장)
  await page.reload();
  await page.getByRole('button', { name: '고객 추가' }).click();
  await expect(page.getByRole('dialog', { name: '고객 추가' }).getByTestId('tag-chips').getByRole('button', { name: '#재구매' })).toBeVisible();
});
