import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { openCustomer } from './flows';

/**
 * 광고 수신 동의·거부 + 광고 표기·080·법정 시간 (155, GAP C-8·M-4)
 * 동의 없음 → 광고 대상 0명(제외 안내·발송 비활성) / 고객 상세 동의 받음 → 대상 1명 / 080 없이 발송 → 차단 안내 /
 * 설정에서 080 등록 → 미리보기에 (광고)·무료수신거부 자동 / 수신 거부 → 다시 0명.
 * 야간 차단은 순수 규칙 스펙(lib-units)에서 시각을 고정해 검사한다(이 스펙은 발송 시각에 따라 사유가 1~2개라 정규식으로 본다).
 */

const acc = makeAccount('MC');

test('수신 동의·거부가 광고 대상에 반영되고 (광고)·080 표기가 자동으로 붙는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 동의 없음 → 광고 대상 0명, 발송 비활성
  await page.goto('/messaging');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  const send = page.getByRole('dialog', { name: '메시지 발송' });
  await expect(send).toBeVisible();
  await send.getByLabel('광고성 메시지').check();
  await expect(send.getByTestId('ad-recipients')).toContainText('광고 대상 0명 · 동의 없음·거부 1명 제외'); // 동의가 없으면 광고 대상이 아니다
  await send.locator('textarea').fill('11월 이벤트 안내입니다.');
  await expect(send.getByRole('button', { name: '발송하기' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(send).toHaveCount(0);

  // 고객 상세: 동의 받음 → 태그 칩
  await openCustomer(page, acc);
  const consent = page.getByTestId('consent-control').filter({ visible: true }).first();
  await expect(consent).toContainText('광고 수신 동의 없음');
  await consent.getByRole('button', { name: '동의 받음' }).click();
  await expect(consent).toContainText('광고 수신 동의 (');
  await expect(page.getByTestId('customer-tags').filter({ visible: true }).first()).toContainText('#광고수신동의');
  await expect(page.getByTestId('customer-timeline').filter({ visible: true }).first()).toContainText('광고 수신 동의'); // 활동 타임라인에 동의일 한 줄 (179)

  // 광고 대상 1명 — 080 번호 없음 → 발송 차단 안내
  await page.goto('/messaging');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(send).toBeVisible();
  await send.getByLabel('광고성 메시지').check();
  await expect(send.getByTestId('ad-recipients')).toContainText('광고 대상 1명');
  await expect(send.getByTestId('ad-recipients')).toContainText('미등록');
  await send.locator('textarea').fill('11월 이벤트 안내입니다.');
  await send.getByRole('button', { name: '발송하기' }).click();
  await expect(send.getByText(/무료수신거부 080 번호가 없습니다/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(send).toHaveCount(0);

  // 설정 > 알림 설정 > 080 등록
  await page.goto('/settings?tab=notifications');
  const card = page.getByTestId('ad-optout-card');
  await card.getByLabel('무료수신거부 번호').fill('080-123-4567');
  await card.getByRole('button', { name: '저장', exact: true }).click();
  await expect(card).toContainText('현재 080-123-4567');

  // 발송 창: 미리보기에 (광고)·무료수신거부 080 자동
  await page.goto('/messaging');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(send).toBeVisible();
  await send.getByLabel('광고성 메시지').check();
  await expect(send.getByTestId('ad-recipients')).toContainText('광고 대상 1명');
  await send.locator('textarea').fill('11월 이벤트 안내입니다.');
  await expect(send.getByTestId('ad-preview')).toContainText('(광고) 11월 이벤트 안내입니다.');
  await expect(send.getByTestId('ad-preview')).toContainText('무료수신거부 080-123-4567');
  await page.keyboard.press('Escape');
  await expect(send).toHaveCount(0);

  // 수신 거부 → 광고 대상 0명
  await openCustomer(page, acc);
  await consent.getByRole('button', { name: '수신 거부' }).click();
  await expect(consent).toContainText('광고 수신 거부');
  await page.goto('/messaging');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await send.getByLabel('광고성 메시지').check();
  await expect(send.getByTestId('ad-recipients')).toContainText('광고 대상 0명');
  await expect(send.getByRole('button', { name: '발송하기' })).toBeDisabled();
});
