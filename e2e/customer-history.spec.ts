import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';
import { openCustomer, changeGrade } from './flows';

/**
 * 고객 정보 변경 이력 (252) — 고객 정보는 덮어쓰기라 누가 언제 무엇을 바꿨는지 남지 않았다.
 * 등급을 누가 내렸는지 물어볼 데가 없어 "내가 안 바꿨다" 로 끝났다(직원 여러 명이 쓰는 매장).
 * 개인정보는 적게 남긴다 — 연락처는 뒤 4자리만, 메모는 바뀐 사실만.
 */

const acc = makeAccount('CH');

test('고객 정보를 고치면 바뀐 항목만 이력에 남고, 연락처·메모는 일부만 남는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await openCustomer(page, acc);
  const history = page.getByTestId('customer-history').filter({ visible: true }).first();
  await expect(history).toBeVisible();
  await expect(history).toContainText('이 PC 에 남은 변경 기록이 없습니다');

  // 등급 변경 — 누가 바꿨는지와 함께 남는다
  await changeGrade(page, '신규', 'VIP');
  await dismissToasts(page);
  await expect(history).toContainText('등급 변경');
  await expect(history).toContainText('등급 신규 → VIP');

  // 정보 수정 — 연락처는 뒤 4자리만, 메모는 "없음 → 있음"
  await page.getByTestId('customers-desktop').getByRole('button', { name: '수정', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '고객 정보 수정' });
  await expect(edit).toBeVisible();
  await edit.getByLabel('전화번호').fill('010-9999-0000');
  await edit.getByLabel('메모').fill('임신 중 — 레이저 제외');
  await edit.getByRole('button', { name: '저장' }).click();
  await expect(edit).toHaveCount(0);
  await dismissToasts(page);

  await expect(history).toContainText('정보 수정');
  await expect(history).toContainText('···0000');            // 뒤 4자리만
  await expect(history).toContainText('메모 없음 → 있음');    // 내용은 남기지 않는다
  await expect(history).not.toContainText('임신 중');
  await expect(history).not.toContainText('010-9999');
  // 한계를 숨기지 않는다
  await expect(history).toContainText('이 PC 에서 한 변경만 남습니다');
});
