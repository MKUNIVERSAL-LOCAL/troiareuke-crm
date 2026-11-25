import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, pickCustomer, visibleButton } from './helpers';
import { toast } from './flows';

/**
 * 현장 주의사항 경고 E2E (232, GAP C-11)
 * 알레르기·메모의 주의 줄은 고객 상세에만 있었다 → 예약을 잡는 자리와 시술을 적는 자리에서 보여야 한다.
 * 상용 CRM(Zenoti·Boulevard)의 client alert 와 같은 자리.
 */

const acc = makeAccount('CA');

test('알레르기·메모 주의사항이 예약 창·예약 상세·시술 기록 창에 보인다', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 고객에 알레르기와 메모 주의 줄을 적는다 ──
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  const desk = page.getByTestId('customers-desktop');
  await desk.getByRole('button', { name: '수정', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '고객 정보 수정' });
  await edit.getByLabel('알레르기').fill('레티놀 자극');
  await edit.getByLabel('메모').fill('임신 중\n커피 좋아함');
  await edit.getByRole('button', { name: '저장', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await dismissToasts(page);

  // ── 예약 추가 창: 고객을 고르면 경고가 뜬다 ──
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).filter({ visible: true }).first().click();
  const add = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc.customer, add);
  const alert = add.getByTestId('customer-alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('알레르기·주의: 레티놀 자극');
  await expect(alert).toContainText('임신 중');
  await expect(alert).not.toContainText('커피 좋아함'); // 메모 전문을 띄우지 않는다

  // 예약을 저장하고 상세에서도 같은 경고를 본다(시술 들어가기 직전에 보는 화면)
  await add.getByLabel('담당 직원').selectOption({ index: 1 });
  await add.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await add.getByLabel('시작 시간').selectOption('14:00');
  await add.getByRole('button', { name: '예약 저장' }).click();
  await expect(add).toHaveCount(0);
  await dismissToasts(page);
  await page.locator('[data-testid="reservation-block"][data-start="14:00"], [data-testid="reservation-card"][data-start="14:00"]').filter({ visible: true }).first().click();
  const detail = page.getByRole('dialog', { name: '예약 상세' });
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('customer-alert')).toContainText('레티놀 자극');
  await page.keyboard.press('Escape');

  // ── 시술 기록 창에서도 ──
  await page.goto('/treatments');
  await page.getByRole('button', { name: '시술 기록 추가' }).click();
  const log = page.getByRole('dialog', { name: '시술 기록 추가' });
  await pickCustomer(page, acc.customer, log);
  await expect(log.getByTestId('customer-alert')).toContainText('레티놀 자극');
});

test('매장이 추가한 주의 키워드도 예약 창 경고에 올라간다 (240)', async ({ page }) => {
  page.on('dialog', d => d.accept());
  const acc2 = makeAccount('CA2');
  await signupAndOnboard(page, acc2);
  await createCustomer(page, acc2);

  // 기본 키워드에 없는 말을 메모에 적는다 — 아직은 경고가 뜨지 않는다
  await page.goto('/customers');
  await page.getByText(acc2.customer).filter({ visible: true }).first().click();
  const desk = page.getByTestId('customers-desktop');
  await desk.getByRole('button', { name: '수정', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '고객 정보 수정' });
  await edit.getByLabel('메모').fill('레이저 금지 부위 있음');
  await edit.getByRole('button', { name: '저장', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await dismissToasts(page);

  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).filter({ visible: true }).first().click();
  const add = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc2.customer, add);
  await expect(add.getByTestId('customer-alert')).toHaveCount(0); // 기본 키워드가 아니라 아직 안 뜬다
  await page.keyboard.press('Escape');

  // 설정에서 매장 키워드를 추가하면 같은 메모가 경고로 올라간다
  await page.goto('/settings');
  await visibleButton(page, '매장 정보').click();
  const panel = page.getByTestId('settings-caution-keywords');
  await expect(panel).toBeVisible();
  await panel.getByLabel('새 주의 키워드').fill('약');
  await panel.getByRole('button', { name: '추가' }).click();
  await expect(toast(page, /두 글자 이상/, 'alert')).toBeVisible();   // 한 글자는 거절하고 사유를 알린다(안내문이 아니라 토스트로 확인)
  await dismissToasts(page);
  await panel.getByLabel('새 주의 키워드').fill('레이저 금지');
  await panel.getByRole('button', { name: '추가' }).click();
  await expect(page.getByText('주의 키워드를 추가했습니다.')).toBeVisible();
  await dismissToasts(page);

  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).filter({ visible: true }).first().click();
  const add2 = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc2.customer, add2);
  await expect(add2.getByTestId('customer-alert')).toContainText('레이저 금지 부위 있음');
});
