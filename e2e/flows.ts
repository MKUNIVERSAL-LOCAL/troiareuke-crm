import { expect, type Page, type Locator } from '@playwright/test';
import { pickCustomer, visibleButton, type E2EAccount } from './helpers';

/**
 * 업무 흐름 공용 함수 (2026-11-19 ㊷) — PC(chromium)와 모바일(Pixel 7) 스펙이 같은 숫자를 검사하면서 선택자만 달랐던 중복을 한곳으로.
 * 원칙: 폭에 따라 달라지는 건 "보이는 쪽"뿐이므로 role/dialog/testid + visible 필터로 쓰고, 표(PC)와 카드 목록(모바일)처럼
 * 구조가 다른 곳만 두 형태를 모두 받는 locator를 쓴다. 숫자 단언은 전부 정확 일치(toHaveText).
 */

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

// ── 매출·지출·손익 ─────────────────────────────────────────────

/** 결제 등록 창에서 고객을 고르고 금액을 등록 */
export async function registerPayment(page: Page, acc: E2EAccount, amount: number) {
  await page.goto('/sales');
  await visibleButton(page, '결제 등록').click();
  const d = dialog(page, '결제 등록');
  await expect(d).toBeVisible();
  await pickCustomer(page, acc.customer, d);
  await d.getByLabel('결제 금액').fill(String(amount));
  await d.getByRole('button', { name: '결제 등록' }).click();
  await expect(d).toHaveCount(0);
}

/** 지출(매입) 등록 — 기본 분류 '제품 매입'(매출원가) */
export async function registerExpense(page: Page, desc: string, amount: number) {
  await visibleButton(page, '지출 등록').click();
  const d = dialog(page, '지출(매입) 등록');
  await expect(d).toBeVisible();
  await d.getByLabel('내용').fill(desc);
  await d.getByLabel('금액').fill(String(amount));
  await d.getByRole('button', { name: '지출 등록' }).click();
  await expect(d).toHaveCount(0);
}

/** 매출 화면의 탭 — 이름에 건수가 붙는 탭은 정규식으로 */
export const salesTab = (page: Page, name: string | RegExp) => visibleButton(page, name);

/** 손익계산서 탭을 열고 매출원가·매출총이익·영업이익을 정확 일치로 확인 */
export async function expectPnl(page: Page, v: { cogs: string; gross?: string; operating: string }) {
  await salesTab(page, '손익계산서').click();
  await expect(page.getByTestId('pnl-cogs')).toHaveText(v.cogs);
  if (v.gross !== undefined) await expect(page.getByTestId('pnl-gross')).toHaveText(v.gross);
  await expect(page.getByTestId('pnl-operating')).toHaveText(v.operating);
}

/** 매출 현황 카드 금액 — 총/시술/제품 중 넘긴 것만 확인 */
export async function expectSales(page: Page, v: { total?: string; treatment?: string; product?: string; count?: number }) {
  if (v.total !== undefined) await expect(page.getByTestId('sales-total-amount')).toHaveText(v.total);
  if (v.treatment !== undefined) await expect(page.getByTestId('sales-treatment-amount')).toHaveText(v.treatment);
  if (v.product !== undefined) await expect(page.getByTestId('sales-product-amount')).toHaveText(v.product);
  if (v.count !== undefined) await expect(salesTab(page, new RegExp(`결제 내역 \\(${v.count}\\)`))).toBeVisible({ timeout: 10_000 });
}

/** 첫 지출의 분류를 바꾼다 — 표(PC)든 카드 목록(모바일)이든 보이는 연필 아이콘 */
export async function changeFirstExpenseCategory(page: Page, category: string) {
  await salesTab(page, /지출 내역 \(\d+\)/).click();
  await visibleButton(page, '지출 수정').click();
  const d = dialog(page, '지출 수정');
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: category, exact: true }).click();
  await d.getByRole('button', { name: '저장', exact: true }).click();
  await expect(d).toHaveCount(0);
}

/** 첫 결제를 환불 상태로 */
export async function refundFirstPayment(page: Page) {
  await salesTab(page, /결제 내역 \(\d+\)/).click();
  await visibleButton(page, '결제 수정').click();
  const d = dialog(page, '결제 수정');
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: '환불', exact: true }).click();
  await d.getByRole('button', { name: '저장', exact: true }).click();
  await expect(d).toHaveCount(0);
}

// ── 프로그램(회차권·기간제)·고객 상세 ───────────────────────────

/** 프로그램 추가 — 회차권(sessions) 또는 기간제(timed) */
export async function addProgram(page: Page, p: { name: string; price: number; sessions?: number; timed?: boolean; validityDays?: number }) {
  await page.goto('/programs');
  await visibleButton(page, '프로그램 추가').click();
  const d = dialog(page, '프로그램 추가');
  await expect(d).toBeVisible();
  await d.getByLabel('프로그램명').fill(p.name);
  if (p.timed) await d.getByRole('button', { name: '기간제 (무제한)' }).click();
  else if (p.sessions !== undefined) await d.getByLabel('총 회차').fill(String(p.sessions));
  await d.getByLabel('판매가').fill(String(p.price));
  if (p.validityDays !== undefined) await d.getByLabel('유효기간 (일)').fill(String(p.validityDays));
  await d.getByRole('button', { name: '프로그램 추가' }).click();
  await expect(d).toHaveCount(0);
}

/** 고객 상세를 연다 — PC는 오른쪽 패널, 모바일은 전체 화면 오버레이. 둘 다 [프로그램 등록] 버튼이 보이면 열린 것 */
export async function openCustomer(page: Page, acc: E2EAccount) {
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await expect(visibleButton(page, '프로그램 등록')).toBeVisible();
}

/** 고객 상세에서 프로그램을 판매(결제). purchaseDate를 주면 구매 날짜를 바꾼다(만료 시나리오) */
export async function sellProgramToCustomer(page: Page, acc: E2EAccount, optionLabel: string, opts: { purchaseDate?: string; expectPrice?: RegExp } = {}) {
  await openCustomer(page, acc);
  await visibleButton(page, '프로그램 등록').click();
  const d = dialog(page, '프로그램 등록');
  await expect(d).toBeVisible();
  await d.getByLabel('프로그램 선택').selectOption({ label: optionLabel });
  if (opts.expectPrice) await expect(d.getByLabel('실제 결제 금액')).toHaveValue(opts.expectPrice);
  if (opts.purchaseDate) await d.getByLabel('구매 날짜').fill(opts.purchaseDate);
  await d.getByRole('button', { name: '프로그램 등록' }).click();
  await expect(d).toHaveCount(0);
}

/** 보이는 프로그램 카드 (PC 상세 패널 / 모바일 오버레이 모두 data-testid program-card) */
export const programCard = (page: Page, name: string): Locator =>
  page.getByTestId('program-card').filter({ hasText: name }).filter({ visible: true }).first();

/**
 * 회차 표기 — PC는 "사용 N회 / 총 M회"와 "잔여 L회"가 따로, 모바일은 "N/M회 · 잔여 L회" 한 줄.
 * 카드 전체 텍스트에 정규식을 대면 앞 줄의 만료일 숫자와 이어 붙어("…05.180/10회") 오탐·누락이 나므로 요소 단위 정확 일치로 본다.
 */
export async function expectProgramSessions(page: Page, name: string, used: number, total: number) {
  const card = programCard(page, name);
  const left = total - used;
  const mobile = card.getByText(`${used}/${total}회 · 잔여 ${left}회`, { exact: true });
  await expect(card.getByText(`사용 ${used}회 / 총 ${total}회`, { exact: true }).or(mobile).first()).toBeVisible();
  await expect(card.getByText(`잔여 ${left}회`, { exact: true }).or(mobile).first()).toBeVisible();
}

/**
 * 시술 기록 추가 창에서 고객을 고르고(쓸 수 있는 회차권이 1개면 자동 연결) 시술 항목 1개를 체크해 저장.
 * expectLinked: 자동 연결된 option 문구(예: '수분관리 10회권 (0/10회)'), null이면 연결 select가 없어야 함
 */
export async function logTreatment(page: Page, acc: E2EAccount, expectLinked: string | null) {
  await page.goto('/treatments?new=1');
  const d = dialog(page, '시술 기록 추가');
  await expect(d).toBeVisible();
  await pickCustomer(page, acc.customer);
  if (expectLinked === null) await expect(d.getByLabel('프로그램 연결')).toHaveCount(0);
  else await expect(d.getByLabel('프로그램 연결').locator('option:checked')).toHaveText(expectLinked);
  await d.getByRole('checkbox', { name: '테스트관리' }).check();
  await d.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// ── 제품·재고 ───────────────────────────────────────────────────

export async function addProduct(page: Page, p: { name: string; price: number; stock: number }) {
  await page.goto('/products');
  await visibleButton(page, '제품 추가').click();
  await page.getByPlaceholder('제품명 입력').fill(p.name);
  await page.getByLabel('판매가').fill(String(p.price));
  await page.getByLabel('재고', { exact: true }).fill(String(p.stock));
  await visibleButton(page, '저장').click();
  await expect(productRow(page, p.name)).toBeVisible({ timeout: 10_000 });
}

/** 제품 한 줄 — PC 표의 tr, 모바일 카드 목록의 li 중 보이는 쪽 */
export const productRow = (page: Page, name: string): Locator =>
  page.locator('tr, li').filter({ hasText: name }).filter({ visible: true }).first();

/** 재고 표기 — PC "12개", 모바일 "재고 12개" */
export async function expectStock(page: Page, name: string, stock: number) {
  await expect(productRow(page, name).getByText(new RegExp(`^(재고 )?${stock}개$`))).toBeVisible();
}

export async function sellProduct(page: Page, name: string, qty = 1) {
  await productRow(page, name).getByRole('button', { name: '판매', exact: true }).click();
  const d = dialog(page, '제품 판매 기록');
  await expect(d).toBeVisible();
  if (qty === 1) await expect(d.getByLabel('수량')).toHaveValue('1');
  else await d.getByLabel('수량').fill(String(qty));
  await d.getByRole('button', { name: '판매 기록' }).click();
  await expect(d).toHaveCount(0);
}

/** 판매 기록 탭에서 첫 판매를 취소(confirm은 스펙의 dialog 핸들러가 수락) → 재고 현황 탭으로 */
export async function cancelFirstSale(page: Page) {
  await page.goto('/products');
  await visibleButton(page, /^판매 기록/).click();
  await visibleButton(page, '판매 취소').click();
  await visibleButton(page, '재고 현황').click();
}

// ── 예약 ────────────────────────────────────────────────────────

/** 예약 추가 — 담당 직원·시술은 첫 항목, 시작 시간 지정 */
export async function addReservation(page: Page, acc: E2EAccount, startTime: string) {
  await visibleButton(page, '예약 추가').click();
  const d = dialog(page, '예약 추가');
  await expect(d).toBeVisible();
  await pickCustomer(page, acc.customer, d);
  await d.getByLabel('담당 직원').selectOption({ index: 1 });
  await d.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await d.getByLabel('시작 시간').selectOption(startTime);
  await d.getByRole('button', { name: '예약 저장' }).click(); // 휴무일 confirm은 스펙의 dialog 핸들러가 수락
  await expect(d).toHaveCount(0);
}

/** 예약 블록(PC 주간표)·카드(모바일 목록) 중 보이는 쪽 */
export const reservationItem = (page: Page, startTime: string): Locator =>
  page.locator(`[data-testid="reservation-block"][data-start="${startTime}"], [data-testid="reservation-card"][data-start="${startTime}"]`).filter({ visible: true }).first();

export const reservationItems = (page: Page): Locator =>
  page.locator('[data-testid="reservation-block"], [data-testid="reservation-card"]').filter({ visible: true });

export async function openReservationDetail(page: Page, startTime: string): Promise<Locator> {
  await reservationItem(page, startTime).click();
  const d = dialog(page, '예약 상세');
  await expect(d).toBeVisible();
  return d;
}

/** 완료처리 → 결제 창에서 바로 결제 등록 (pay=false면 결제 없이 닫기) */
export async function completeReservation(page: Page, startTime: string, pay = true) {
  const d = await openReservationDetail(page, startTime);
  await d.getByRole('button', { name: '완료처리' }).click();
  await page.getByRole('button', { name: pay ? '결제 등록' : '결제 등록 없이 닫기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** 상세의 상태 버튼 하나를 누르고 창이 닫히는지 (노쇼·취소처리·예약 복구 — confirm은 스펙 핸들러가 수락) */
export async function setReservationStatus(page: Page, startTime: string, button: '노쇼' | '취소처리' | '예약 복구') {
  const d = await openReservationDetail(page, startTime);
  await d.getByRole('button', { name: button, exact: true }).click();
  await expect(d).toHaveCount(0);
}

/** 상세를 열어 상태 배지와 버튼 유무를 확인하고 Esc로 닫는다 */
export async function expectReservationDetail(page: Page, startTime: string, status: string, buttons: Record<string, number>) {
  const d = await openReservationDetail(page, startTime);
  await expect(d.getByTestId('reservation-status')).toHaveText(status);
  for (const [name, count] of Object.entries(buttons)) await expect(d.getByRole('button', { name, exact: true })).toHaveCount(count);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
}

// ── 집계 ────────────────────────────────────────────────────────

/** 대시보드 '오늘 예약' 카드 — PC StatCard·모바일 카드 모두 stat-card, 보이는 쪽만 */
export async function expectTodayCard(page: Page, value: string, subtitle: string) {
  await page.goto('/');
  const card = page.getByTestId('stat-card').filter({ hasText: '오늘 예약' }).filter({ visible: true }).first();
  await expect(card.getByTestId('stat-value')).toHaveText(value);
  await expect(card.getByTestId('stat-subtitle')).toHaveText(subtitle);
}

/** 직원 월 실적 표의 한 줄 — 완료 건수·완료 예약액 */
export async function expectStaffPerformance(page: Page, staffName: string, completed: string, amount: string) {
  await page.goto('/staff');
  const row = page.getByTestId('staff-performance').locator('tbody tr').filter({ hasText: staffName }).first();
  await expect(row.getByTestId('perf-completed')).toHaveText(completed);
  await expect(row.getByTestId('perf-amount')).toHaveText(amount);
}

/** 고객 상세의 노쇼 횟수 — PC 배지 "노쇼 N회", 모바일 "N회" */
export async function expectCustomerNoShows(page: Page, acc: E2EAccount, n: number) {
  await openCustomer(page, acc);
  const pc = page.getByTestId('noshow-badge').filter({ visible: true });
  if (await pc.count()) await expect(pc.first()).toContainText(`노쇼 ${n}회`);
  else await expect(page.getByTestId('noshow-count').filter({ visible: true }).first()).toHaveText(`${n}회`);
}
