import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 회차권 만료 흐름 E2E (로컬 모드, 2026-11-19 ㉗) — 구매일을 과거로 등록해 만료된 회차권이 '만료'로 표시되고,
 * 시술 기록에서 차감 선택지에 뜨지 않으며(안내만), 관리에서 만료일을 연장하면 다시 선택·차감되는지.
 * 완료 처리하면 선택지에서 빠지고(안내도 없음), 되돌리면 잔여 회차가 그대로 돌아온다.
 */

const acc = makeAccount('PX');
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('만료된 회차권은 차감할 수 없고, 연장하면 다시 쓸 수 있다', async ({ page }) => {
  test.slow();
  const now = new Date();
  test.skip(now.getHours() === 23 && now.getMinutes() >= 50, '자정 경계 — 연장 만료일(오늘+30) 계산이 날짜를 넘긴다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const desk = page.getByTestId('customers-desktop');
  const card = desk.getByTestId('program-card').filter({ hasText: '수분관리 10회권' });
  const openCustomer = async () => {
    await page.goto('/customers');
    await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  };

  // ── 프로그램 등록: 수분관리 10회권 300,000원 (유효기간 기본 180일) ──
  await page.goto('/programs');
  await page.getByRole('button', { name: '프로그램 추가' }).first().click();
  const progDialog = page.getByRole('dialog', { name: '프로그램 추가' });
  await progDialog.getByLabel('프로그램명').fill('수분관리 10회권');
  await progDialog.getByLabel('총 회차').fill('10');
  await progDialog.getByLabel('판매가').fill('300000');
  await expect(progDialog.getByLabel('유효기간 (일)')).toHaveValue('180');
  await progDialog.getByRole('button', { name: '프로그램 추가' }).click();
  await expect(progDialog).toHaveCount(0);

  // ── 구매 날짜 2025-01-01 → 만료일 2025-06-30(180일) → '만료' 배지 ──
  await openCustomer();
  await desk.getByRole('button', { name: '프로그램 등록' }).first().click();
  const regDialog = page.getByRole('dialog', { name: '프로그램 등록' });
  await regDialog.getByLabel('프로그램 선택').selectOption({ label: '수분관리 10회권 — 300,000원' });
  await regDialog.getByLabel('구매 날짜').fill('2025-01-01');
  await regDialog.getByRole('button', { name: '프로그램 등록' }).click();
  await expect(regDialog).toHaveCount(0);
  await expect(card.getByText('만료', { exact: true })).toBeVisible();
  await expect(card.getByText('만료일: 2025.06.30')).toBeVisible();

  // ── 고객 상세의 [시술 기록] 창: 자동 연결 안 되고 선택지는 '선택 없음'뿐, 연장 안내 ──
  await desk.getByRole('button', { name: '시술 기록', exact: true }).first().click();
  const quick = page.getByLabel('차감할 프로그램');
  await expect(quick.locator('option')).toHaveCount(1);
  await expect(quick).toHaveValue('');
  await expect(page.getByTestId('expired-program-hint')).toContainText('만료된 회차권(수분관리 10회권)은 차감할 수 없습니다');

  // ── 예약 추가 창의 회차권 잔여 칩에도 '만료'가 보인다 ──
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  const resDialog = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc.customer, resDialog);
  await expect(resDialog.getByLabel('회차권 잔여')).toContainText('수분관리 10회권 · 잔여 10회 · 만료');

  // ── 시술 기록 화면: 만료 회차권은 선택지에 없고 연장 안내만 ──
  await page.goto('/treatments?new=1');
  await pickCustomer(page, acc.customer);
  await expect(page.getByLabel('프로그램 연결')).toHaveCount(0);
  await expect(page.getByTestId('expired-program-hint')).toContainText('만료된 회차권(수분관리 10회권)은 차감할 수 없습니다');

  // ── 관리 → +30일 → 저장: 만료일 = 오늘+30, 배지 사라짐, 변경 기록에 사유가 남는다 ──
  await openCustomer();
  await card.getByRole('button', { name: '수분관리 10회권 관리' }).click();
  const manage = page.getByRole('dialog', { name: '프로그램 관리' });
  await expect(manage.getByLabel('만료일')).toHaveValue('2025-06-30');
  await manage.getByRole('button', { name: '+30일' }).click();
  const plus30 = new Date(); plus30.setDate(plus30.getDate() + 30);
  await expect(manage.getByLabel('만료일')).toHaveValue(localISO(plus30));
  await manage.getByLabel('사유').fill('휴가 복귀 연장');
  await manage.getByRole('button', { name: '저장', exact: true }).click();
  await expect(manage).toHaveCount(0);
  await expect(card.getByText('만료', { exact: true })).toHaveCount(0);
  await expect(card.getByText(`만료일: ${localISO(plus30).replace(/-/g, '.')}`)).toBeVisible();
  await card.getByRole('button', { name: '수분관리 10회권 관리' }).click();
  await expect(manage.getByText(/만료일 2025\.06\.30 → \d{4}\.\d{2}\.\d{2} — 휴가 복귀 연장/)).toBeVisible();
  await manage.getByRole('button', { name: '취소', exact: true }).click();
  await expect(manage).toHaveCount(0);

  // ── 시술 기록: 선택지에 돌아오고(쓸 수 있는 회차권 1개라 자동 연결) 저장하면 사용 1회 / 잔여 9회 ──
  await page.goto('/treatments?new=1');
  await pickCustomer(page, acc.customer);
  await expect(page.getByTestId('expired-program-hint')).toHaveCount(0);
  await expect(page.getByLabel('프로그램 연결')).toHaveValue(/\S/);
  await expect(page.getByLabel('프로그램 연결').locator('option:checked')).toHaveText('수분관리 10회권 (0/10회)');
  await page.getByRole('dialog', { name: '시술 기록 추가' }).getByRole('checkbox', { name: '테스트관리' }).check();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openCustomer();
  await expect(card.getByText('사용 1회 / 총 10회')).toBeVisible();
  await expect(card.getByText('잔여 9회')).toBeVisible();

  // ── 총 회차 0은 거절(토스트), 변경 중엔 완료 처리 비활성 → 되돌린 뒤 완료 처리(confirm 수락) → '완료' 배지 ──
  await card.getByRole('button', { name: '수분관리 10회권 관리' }).click();
  await manage.getByLabel('총 회차').fill('0');
  await expect(manage.getByRole('button', { name: '완료 처리' })).toBeDisabled();
  await manage.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('[aria-live="polite"]').getByText('총 회차는 1 이상이어야 합니다.')).toBeVisible();
  await expect(manage).toBeVisible();
  await manage.getByLabel('총 회차').fill('10');
  await manage.getByRole('button', { name: '완료 처리' }).click();
  await expect(manage).toHaveCount(0);
  await expect(card.getByText('완료', { exact: true })).toBeVisible();

  // ── 완료된 회차권은 시술 기록 선택지에도, 만료 안내에도 없다 ──
  await page.goto('/treatments?new=1');
  await pickCustomer(page, acc.customer);
  await expect(page.getByLabel('프로그램 연결')).toHaveCount(0);
  await expect(page.getByTestId('expired-program-hint')).toHaveCount(0);

  // ── 되돌리기 → 잔여 9회 그대로 ──
  await openCustomer();
  await card.getByRole('button', { name: '수분관리 10회권 관리' }).click();
  await manage.getByRole('button', { name: '진행중으로 되돌리기' }).click();
  await expect(manage).toHaveCount(0);
  await expect(card.getByText('완료', { exact: true })).toHaveCount(0);
  await expect(card.getByText('잔여 9회')).toBeVisible();
});
