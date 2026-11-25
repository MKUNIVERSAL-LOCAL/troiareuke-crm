import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, dismissToasts } from './helpers';

/**
 * 태그 이름 일괄 변경 E2E (239, GAP C-1)
 * 목록을 정해 둬도 이미 갈라진 태그("민감"·"민감성")는 남는다 → 목록에서 이름을 바꾸면 그 태그가 붙은 고객 태그도 함께 바뀌고,
 * 바꾼 이름이 이미 있으면 하나로 합쳐진다. 고객 수백 명을 건드리는 일이라 미리보기·확인창을 거친다.
 */

const acc = makeAccount('TR');

async function addCustomer(page: import('@playwright/test').Page, name: string, phone: string, tags: string) {
  await page.getByRole('button', { name: '고객 추가' }).click();
  const d = page.getByRole('dialog', { name: '고객 추가' });
  await d.getByPlaceholder('홍길동').fill(name);
  await d.getByPlaceholder('010-0000-0000').fill(phone);
  await d.getByLabel('태그').fill(tags);
  await d.getByText('[필수] 개인정보 수집·이용 동의').click();
  await d.getByRole('button', { name: '등록', exact: true }).click();
  await expect(d).toHaveCount(0);
  await dismissToasts(page);
}

test('태그 이름을 바꾸면 고객 태그도 함께 바뀌고 중복은 합쳐진다', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);

  // 갈라진 태그를 가진 고객 둘 — 한 명은 두 태그를 모두 갖고 있어 합쳐져야 한다
  await page.goto('/customers');
  await addCustomer(page, acc.customer, acc.customerPhone, '민감, 재구매');
  await addCustomer(page, acc.customer + '2', '010-7777-0002', '민감, 민감성');

  // 목록에 '민감' 을 등록하고 이름을 '민감성' 으로 바꾼다
  await page.getByRole('button', { name: '고객 추가' }).click();
  const add = page.getByRole('dialog', { name: '고객 추가' });
  await add.getByTestId('tag-master-open').click();
  const panel = page.getByTestId('tag-master-panel');
  await panel.getByLabel('새 태그').fill('민감');
  await panel.getByRole('button', { name: '추가' }).click();
  await expect(panel.getByText('#민감')).toBeVisible();
  await panel.getByRole('button', { name: '민감 태그 이름 바꾸기' }).click();
  const rename = page.getByTestId('tag-rename');
  await expect(rename).toContainText('하나로 합쳐집니다');
  await rename.getByLabel('바꿀 태그 이름').fill('민감성');
  await rename.getByRole('button', { name: '바꾸기' }).click();

  // 미리보기 수치가 확인창에 그대로 나온다(2명 중 1명 합침)
  const confirm = page.getByTestId('confirm-dialog');
  await expect(confirm).toContainText('고객 2명의 태그가 바뀝니다');
  await expect(confirm).toContainText('1명은 이미 "민감성" 이 있어 하나로 합쳐집니다');
  await confirm.getByRole('button', { name: '이름 바꾸기', exact: true }).click();
  await expect(page.getByText(/고객 2명의 태그를 "민감성" 으로 바꿨습니다/)).toBeVisible({ timeout: 15_000 });
  await dismissToasts(page);
  await expect(panel.getByText('#민감성')).toBeVisible();
  await expect(panel.getByText('#민감', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: '닫기' }).click();
  await page.getByRole('dialog', { name: '고객 추가' }).getByRole('button', { name: '닫기' }).click();

  // 고객 태그 확인 — 둘 다 '민감성', 합쳐진 고객은 중복 없이 하나
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('customer-tags')).toContainText('#민감성');
  await expect(page.getByTestId('customer-tags')).not.toContainText('#민감,');
  await page.goto('/customers');
  await page.getByText(acc.customer + '2').filter({ visible: true }).first().click();
  const tags = page.getByTestId('customer-tags');
  await expect(tags).toContainText('#민감성');
  await expect(tags.getByText('#민감성')).toHaveCount(1); // 합쳐져 하나만
});
