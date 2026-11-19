import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';
import { assertNoBlocking, makeStep, SETTINGS_TAB_READY, type Row } from './a11y-shared';

/**
 * 모달·상세 패널 접근성 게이트 (axe-core, WCAG 2.1 A/AA, 2026-11-19 ㉜) — 라우트 게이트(a11y.spec)는 첫 화면만 보므로
 * 실제 입력이 일어나는 창(고객 추가·프로그램 등록·시술 기록·예약 추가·예약 상세·결제·지출·제품·직원·메시지·설정 탭)을 열어 놓고 분석한다.
 * 창을 열지 못하면 그 자체를 위반(critical open-failed)으로 기록해 조용히 건너뛰지 않는다.
 */

const acc = makeAccount('AM');

test('주요 모달·상세 창에 serious·critical 접근성 위반이 없다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];
  const step = makeStep(page, rows);
  const dialog = (name: string) => page.getByRole('dialog', { name });
  // 입력 폼 창은 Esc를 일부러 받지 않는다(입력 유실 방지, overlayStack escape:false) — [닫기] 버튼이 있으면 그걸로, 없으면 Esc
  const closeDialog = async (name: string) => {
    const d = dialog(name);
    const close = d.getByRole('button', { name: '닫기', exact: true });
    if (await close.count()) await close.first().click(); else await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
  };

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const desk = page.getByTestId('customers-desktop');

  // ── 프로그램: 추가 창 → 저장(아래 고객 등록·관리 창에 쓴다) ──
  await page.goto('/programs');
  await step('/programs 프로그램 추가', async () => {
    await page.getByRole('button', { name: '프로그램 추가' }).first().click();
    await expect(dialog('프로그램 추가')).toBeVisible();
    await dialog('프로그램 추가').getByLabel('프로그램명').fill('접근성 10회권');
    await dialog('프로그램 추가').getByLabel('총 회차').fill('10');
    await dialog('프로그램 추가').getByLabel('판매가').fill('100000');
  });
  await dialog('프로그램 추가').getByRole('button', { name: '프로그램 추가' }).click();
  await expect(dialog('프로그램 추가')).toHaveCount(0);

  // ── 고객: 추가 창, 상세 패널, 프로그램 등록 창, 빠른 시술 기록 창, 프로그램 관리 창 ──
  await page.goto('/customers');
  await step('/customers 고객 추가', async () => {
    await page.getByRole('button', { name: '고객 추가' }).click();
    await expect(dialog('고객 추가')).toBeVisible();
  });
  await closeDialog('고객 추가');
  await step('/customers 상세 패널', async () => {
    await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
    await expect(desk.getByRole('button', { name: '프로그램 등록' }).first()).toBeVisible();
  });
  await step('/customers 프로그램 등록', async () => {
    await desk.getByRole('button', { name: '프로그램 등록' }).first().click();
    await expect(dialog('프로그램 등록')).toBeVisible();
    await dialog('프로그램 등록').getByLabel('프로그램 선택').selectOption({ label: '접근성 10회권 — 100,000원' });
  });
  await dialog('프로그램 등록').getByRole('button', { name: '프로그램 등록' }).click();
  await expect(dialog('프로그램 등록')).toHaveCount(0);
  await step('/customers 시술 기록(빠른 기록)', async () => {
    await desk.getByRole('button', { name: '시술 기록', exact: true }).first().click();
    await expect(dialog('시술 기록 추가')).toBeVisible();
  });
  await closeDialog('시술 기록 추가');
  await step('/customers 프로그램 관리', async () => {
    await desk.getByRole('button', { name: '접근성 10회권 관리' }).click();
    await expect(dialog('프로그램 관리')).toBeVisible();
  });
  await closeDialog('프로그램 관리');

  // ── 예약: 추가 창 → 저장 → 상세 창 → 완료처리 → 결제 창 ──
  await page.goto('/reservations');
  await step('/reservations 예약 추가', async () => {
    await page.getByRole('button', { name: '예약 추가' }).first().click();
    await expect(dialog('예약 추가')).toBeVisible();
    await pickCustomer(page, acc.customer, dialog('예약 추가'));
    await dialog('예약 추가').getByLabel('담당 직원').selectOption({ index: 1 });
    await dialog('예약 추가').getByLabel('시술', { exact: true }).selectOption({ index: 1 });
    await dialog('예약 추가').getByLabel('시작 시간').selectOption('10:00');
  });
  await dialog('예약 추가').getByRole('button', { name: '예약 저장' }).click();
  await expect(dialog('예약 추가')).toHaveCount(0);
  await step('/reservations 예약 상세', async () => {
    await page.locator('[data-testid="reservation-block"][data-start="10:00"]').click();
    await expect(dialog('예약 상세')).toBeVisible();
  });
  await step('/reservations 완료 → 결제 창', async () => {
    await dialog('예약 상세').getByRole('button', { name: '완료처리' }).click();
    await expect(page.getByRole('button', { name: '결제 등록', exact: true })).toBeVisible();
  });
  await page.getByRole('button', { name: '결제 등록 없이 닫기' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 시술 기록 화면의 추가 창 ──
  await step('/treatments 시술 기록 추가', async () => {
    await page.goto('/treatments?new=1');
    await expect(dialog('시술 기록 추가')).toBeVisible();
    await pickCustomer(page, acc.customer);
  });

  // ── 제품: 추가 폼 → 저장 → 판매 창 ──
  await page.goto('/products');
  await step('/products 제품 추가', async () => {
    await page.getByRole('button', { name: '제품 추가' }).first().click();
    await expect(page.getByPlaceholder('제품명 입력')).toBeVisible();
    await page.getByPlaceholder('제품명 입력').fill('접근성 세럼');
    await page.getByLabel('판매가').fill('30000');
    await page.getByLabel('재고', { exact: true }).fill('5');
  });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const row = page.locator('tr').filter({ hasText: '접근성 세럼' }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await step('/products 제품 판매 기록', async () => {
    await row.getByRole('button', { name: '판매', exact: true }).click();
    await expect(dialog('제품 판매 기록')).toBeVisible();
  });

  // ── 매출: 결제 등록 창, 지출 등록 창 ──
  await page.goto('/sales');
  await step('/sales 결제 등록', async () => {
    await page.getByRole('button', { name: '결제 등록' }).first().click();
    await expect(dialog('결제 등록')).toBeVisible();
  });
  await closeDialog('결제 등록');
  await step('/sales 지출(매입) 등록', async () => {
    await page.getByRole('button', { name: '지출 등록' }).first().click();
    await expect(dialog('지출(매입) 등록')).toBeVisible();
  });

  // ── 직원: 추가 창, 상세 창, 수정 창 ──
  await page.goto('/staff');
  await step('/staff 직원 추가', async () => {
    await page.getByRole('button', { name: '직원 추가' }).first().click();
    await expect(dialog('직원 추가')).toBeVisible();
  });
  await closeDialog('직원 추가');
  await step('/staff 직원 상세', async () => {
    await page.getByRole('heading', { name: /^김테스트/ }).first().click();
    await expect(dialog('직원 상세')).toBeVisible();
  });
  await step('/staff 직원 수정', async () => {
    await dialog('직원 상세').getByRole('button', { name: '수정' }).click();
    await expect(dialog('직원 수정')).toBeVisible();
  });

  // ── 문자: 발송 창, 템플릿 추가 창 ──
  await page.goto('/messaging');
  await step('/messaging 메시지 발송', async () => {
    await page.getByRole('button', { name: '메시지 보내기' }).click();
    await expect(dialog('메시지 발송')).toBeVisible();
  });
  await closeDialog('메시지 발송');
  await step('/messaging 템플릿 추가', async () => {
    await page.getByRole('button', { name: '템플릿 관리' }).click();
    await page.getByRole('button', { name: '템플릿 추가' }).first().click();
    await expect(dialog('템플릿 추가')).toBeVisible();
  });

  // ── 설정: 탭 전부 + 시술 추가 창 ──
  await page.goto('/settings');
  for (const tab of Object.keys(SETTINGS_TAB_READY)) {
    await step(`/settings ${tab}`, async () => {
      await page.getByRole('button', { name: tab, exact: true }).filter({ visible: true }).first().click();
      await expect(SETTINGS_TAB_READY[tab](page)).toBeVisible();
    });
  }
  await step('/settings 시술 추가', async () => {
    await page.getByRole('button', { name: '시술 관리', exact: true }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: '시술 추가' }).first().click();
    await expect(dialog('시술 추가')).toBeVisible();
  });

  assertNoBlocking(rows);
});
