import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';
import { assertNoBlocking, makeStep, SETTINGS_TAB_READY, type Row } from './a11y-shared';

/**
 * 모바일 폭 모달·상세 접근성 게이트 (axe-core, WCAG 2.1 A/AA, 2026-11-19 ㉞) — PC 모달 게이트(a11y-modals.spec)와 같은 창을
 * Pixel 7 폭에서 연다. 모바일은 고객 상세가 전체 화면 오버레이, 예약은 카드 목록 → 상세 모달이라 여는 길이 다르다.
 * 파일명에 mobile.spec가 들어가야 mobile 프로젝트가 집어 간다(playwright.config testMatch).
 */

const acc = makeAccount('AN');

test('모바일 폭에서도 주요 모달·상세 창에 serious·critical 접근성 위반이 없다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];
  const step = makeStep(page, rows);
  const dialog = (name: string) => page.getByRole('dialog', { name });
  const vis = (name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
  // 맨 위 창의 [취소]만 — 아래 오버레이의 같은 이름 버튼을 잡지 않게, 닫힌 것까지 확인
  const cancel = async () => {
    const top = page.getByRole('dialog').last();
    const before = await page.getByRole('dialog').count();
    await top.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(before - 1);
  };

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 고객: 추가 창, 상세 오버레이, 시술 기록·프로그램 등록·상담 기록 창 ──
  await page.goto('/customers');
  await step('m/customers 고객 추가', async () => {
    await vis('고객 추가').click();
    await expect(dialog('고객 추가')).toBeVisible();
  });
  await cancel();
  await step('m/customers 상세 오버레이', async () => {
    await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('기본 정보').filter({ visible: true }).first()).toBeVisible();
  });
  await step('m/customers 시술 기록', async () => {
    await vis('시술 기록').click();
    await expect(page.getByRole('heading', { name: '시술 기록' }).filter({ visible: true }).first()).toBeVisible();
  });
  await cancel();
  await step('m/customers 프로그램 등록', async () => {
    await vis('프로그램 등록').click();
    await expect(page.getByRole('heading', { name: '프로그램 등록' }).filter({ visible: true }).first()).toBeVisible();
  });
  await cancel();
  await step('m/customers 상담 기록', async () => {
    await vis('상담 기록').click();
    await expect(dialog('피부 상담')).toBeVisible();
  });

  // ── 예약: 추가 창 → 저장 → 카드 → 상세 → 완료 → 결제 창 ──
  await page.goto('/reservations');
  await step('m/reservations 예약 추가', async () => {
    await vis('예약 추가').click();
    await expect(dialog('예약 추가')).toBeVisible();
    await pickCustomer(page, acc.customer, dialog('예약 추가'));
    await dialog('예약 추가').getByLabel('담당 직원').selectOption({ index: 1 });
    await dialog('예약 추가').getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  });
  await dialog('예약 추가').getByRole('button', { name: '예약 저장' }).click();
  await expect(dialog('예약 추가')).toHaveCount(0);
  await step('m/reservations 예약 상세', async () => {
    await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
    await expect(dialog('예약 상세')).toBeVisible();
  });
  await step('m/reservations 완료 → 결제 창', async () => {
    await dialog('예약 상세').getByRole('button', { name: '완료처리' }).click();
    await expect(page.getByRole('button', { name: '결제 등록', exact: true })).toBeVisible();
  });
  await page.getByRole('button', { name: '결제 등록 없이 닫기' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 시술 기록 화면의 추가 창 ──
  await step('m/treatments 시술 기록 추가', async () => {
    await page.goto('/treatments?new=1');
    await expect(dialog('시술 기록 추가')).toBeVisible();
    await pickCustomer(page, acc.customer);
  });

  // ── 제품: 추가 폼 → 저장 → 입고·조정 창 ──
  await page.goto('/products');
  await step('m/products 제품 추가', async () => {
    await vis('제품 추가').click();
    await expect(page.getByPlaceholder('제품명 입력')).toBeVisible();
    await page.getByPlaceholder('제품명 입력').fill('모바일세럼');
    await page.getByLabel('판매가').fill('30000');
    await page.getByLabel('재고', { exact: true }).fill('5');
  });
  await vis('저장').click();
  await expect(page.getByText('모바일세럼').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await step('m/products 입고·조정', async () => {
    await page.getByRole('button', { name: '모바일세럼 입고·조정' }).click();
    await expect(page.getByLabel('입고 수량')).toBeVisible();
  });

  // ── 매출: 결제 등록·지출 등록 창 ──
  await page.goto('/sales');
  await step('m/sales 결제 등록', async () => {
    await vis('결제 등록').click();
    await expect(dialog('결제 등록')).toBeVisible();
  });
  await dialog('결제 등록').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog('결제 등록')).toHaveCount(0);
  await step('m/sales 지출(매입) 등록', async () => {
    await vis('지출 등록').click();
    await expect(dialog('지출(매입) 등록')).toBeVisible();
  });

  // ── 직원·문자 ──
  await page.goto('/staff');
  await step('m/staff 직원 추가', async () => {
    await vis('직원 추가').click();
    await expect(dialog('직원 추가')).toBeVisible();
  });
  await page.goto('/messaging');
  await step('m/messaging 메시지 발송', async () => {
    await vis('메시지 보내기').click();
    await expect(dialog('메시지 발송')).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(dialog('메시지 발송')).toHaveCount(0);
  await step('m/messaging 템플릿 추가', async () => {
    await vis('템플릿 관리').click();
    await vis('템플릿 추가').click();
    await expect(dialog('템플릿 추가')).toBeVisible();
  });

  // ── 설정 탭 ──
  await page.goto('/settings');
  for (const tab of Object.keys(SETTINGS_TAB_READY)) {
    await step(`m/settings ${tab}`, async () => {
      await vis(tab).click();
      await expect(SETTINGS_TAB_READY[tab](page)).toBeVisible();
    });
  }

  assertNoBlocking(rows);
});
