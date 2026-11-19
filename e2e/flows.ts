import { expect, type Page, type Locator } from '@playwright/test';
import { pickCustomer, visibleButton, type E2EAccount } from './helpers';

/**
 * 업무 흐름 공용 함수 (2026-11-19 ㊷, 리뷰 반영 ㊺) — PC(chromium)와 모바일(Pixel 7) 스펙이 같은 숫자를 검사하면서 선택자만 달랐던 중복을 한곳으로.
 * 원칙: 폭에 따라 달라지는 건 "보이는 쪽"뿐이므로 role/dialog/testid + visible 필터로 쓰고, 표(PC)와 카드 목록(모바일)처럼 구조가 다른 곳은
 * 양쪽에 같은 data-testid를 달아 한 locator로 잡는다. 레이아웃마다 문구가 다르면 isDesktop으로 갈라 각 형태를 정확 일치로 단언한다(.or로 뭉개지 않음).
 */

export const dialog = (page: Page, name: string): Locator => page.getByRole('dialog', { name });

/** PC 레이아웃인가 — 고객 상세 패널 컨테이너(customers-desktop)가 보이는지로 판단(고객 화면에서만 뜻이 있음) */
export const isDesktop = (page: Page): Promise<boolean> => page.getByTestId('customers-desktop').isVisible();

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

/** 손익계산서 탭을 열고 매출원가·매출총이익·영업이익을 정확 일치로 확인 */
export async function expectPnl(page: Page, v: { cogs: string; gross?: string; operating: string }) {
  await visibleButton(page, '손익계산서').click();
  await expect(page.getByTestId('pnl-cogs')).toHaveText(v.cogs);
  if (v.gross !== undefined) await expect(page.getByTestId('pnl-gross')).toHaveText(v.gross);
  await expect(page.getByTestId('pnl-operating')).toHaveText(v.operating);
}

/** 매출 현황 카드 금액 — 총/시술/제품 중 넘긴 것만, count는 '결제 내역 (N)' 탭 */
export async function expectSales(page: Page, v: { total?: string; treatment?: string; product?: string; count?: number }) {
  if (v.total !== undefined) await expect(page.getByTestId('sales-total-amount')).toHaveText(v.total);
  if (v.treatment !== undefined) await expect(page.getByTestId('sales-treatment-amount')).toHaveText(v.treatment);
  if (v.product !== undefined) await expect(page.getByTestId('sales-product-amount')).toHaveText(v.product);
  if (v.count !== undefined) await expect(visibleButton(page, new RegExp(`결제 내역 \\(${v.count}\\)`))).toBeVisible();
}

/** 첫 지출의 분류를 바꾼다 — 표(PC)든 카드 목록(모바일)이든 보이는 연필 아이콘 */
export async function changeFirstExpenseCategory(page: Page, category: string) {
  await visibleButton(page, /지출 내역 \(\d+\)/).click();
  await visibleButton(page, '지출 수정').click();
  const d = dialog(page, '지출 수정');
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: category, exact: true }).click();
  await d.getByRole('button', { name: '저장', exact: true }).click();
  await expect(d).toHaveCount(0);
}

/** 첫 결제를 환불 상태로 */
export async function refundFirstPayment(page: Page) {
  await visibleButton(page, /결제 내역 \(\d+\)/).click();
  await visibleButton(page, '결제 수정').click();
  const d = dialog(page, '결제 수정');
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: '환불', exact: true }).click();
  await d.getByRole('button', { name: '저장', exact: true }).click();
  await expect(d).toHaveCount(0);
}

/** 첫 결제를 환불로 바꾸려다 막히는 경우 — 안내 토스트가 뜨고 창은 그대로, [닫기]로 닫는다 (68: 사용한 회차권 결제) */
export async function expectRefundBlocked(page: Page, text: string | RegExp) {
  await visibleButton(page, /결제 내역 \(\d+\)/).click();
  await visibleButton(page, '결제 수정').click();
  const d = dialog(page, '결제 수정');
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: '환불', exact: true }).click();
  await d.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('[aria-live="polite"]').getByText(text)).toBeVisible();
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(d).toHaveCount(0);
}

// ── 프로그램(회차권·기간제)·고객 상세 ───────────────────────────

/**
 * 프로그램 추가 — 회차권(sessions) 또는 기간제(timed). 유효기간을 안 주면 기본값 180일인지 확인하고, 기간제면 총 회차 입력이 없는지도 확인.
 * 끝나면 목록 카드(program-item)가 보여야 한다.
 */
export async function addProgram(page: Page, p: { name: string; price: number; sessions?: number; timed?: boolean; validityDays?: number | '' }) {
  await page.goto('/programs');
  await visibleButton(page, '프로그램 추가').click();
  const d = dialog(page, '프로그램 추가');
  await expect(d).toBeVisible();
  await d.getByLabel('프로그램명').fill(p.name);
  if (p.timed) {
    await d.getByRole('button', { name: '기간제 (무제한)' }).click();
    await expect(d.getByLabel('총 회차')).toHaveCount(0);
  } else if (p.sessions !== undefined) {
    await d.getByLabel('총 회차').fill(String(p.sessions));
  }
  await d.getByLabel('판매가').fill(String(p.price));
  if (p.validityDays !== undefined) await d.getByLabel('유효기간 (일)').fill(String(p.validityDays));
  else await expect(d.getByLabel('유효기간 (일)')).toHaveValue('180');
  await d.getByRole('button', { name: '프로그램 추가' }).click();
  await expect(d).toHaveCount(0);
  await expect(page.getByTestId('program-item').filter({ hasText: p.name })).toBeVisible();
}

/** 프로그램 목록 카드의 [수정] 창을 열어 유효기간 칸 값을 확인하고 닫는다 — 무제한(빈칸)이 '180'으로 채워지던 결함(57) 회귀 */
export async function expectProgramEditValidity(page: Page, name: string, value: string) {
  await page.goto('/programs');
  await page.getByRole('button', { name: `${name} 수정` }).click();
  const d = dialog(page, '프로그램 수정');
  await expect(d).toBeVisible();
  await expect(d.getByLabel('유효기간 (일)')).toHaveValue(value);
  await d.getByRole('button', { name: '취소', exact: true }).click();
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

/** 고객 상세 헤더의 등급 칩 → 메뉴에서 등급 변경 (PC·모바일 같은 칩). 변경 뒤 칩 글자와 토스트를 확인 */
export async function changeGrade(page: Page, from: string, to: string) {
  await visibleButton(page, `${from} 등급 변경`).click();
  const menu = page.getByRole('menu', { name: '등급 선택' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitemradio', { name: to }).click();
  await expect(menu).toHaveCount(0);
  await expect(visibleButton(page, `${to} 등급 변경`)).toBeVisible();
  await expect(toast(page, `${to} 등급으로 변경했습니다.`)).toBeVisible();
}

/** 보이는 프로그램 카드 (PC 상세 패널 / 모바일 오버레이 모두 data-testid program-card). 카드가 없으면 count-0 단언이 헛되이 통과하므로 먼저 보이는지 확인한다 */
export async function programCard(page: Page, name: string): Promise<Locator> {
  const card = page.getByTestId('program-card').filter({ hasText: name }).filter({ visible: true }).first();
  await expect(card).toBeVisible();
  return card;
}

/** 회차 표기 — PC는 "사용 N회 / 총 M회"와 "잔여 L회"가 따로, 모바일은 "N/M회 · 잔여 L회" 한 줄. 레이아웃을 갈라 각 형태를 정확 일치로 */
export async function expectProgramSessions(page: Page, name: string, used: number, total: number) {
  const card = await programCard(page, name);
  const left = total - used;
  if (await isDesktop(page)) {
    await expect(card.getByText(`사용 ${used}회 / 총 ${total}회`, { exact: true })).toBeVisible();
    await expect(card.getByText(`잔여 ${left}회`, { exact: true })).toBeVisible();
  } else {
    await expect(card.getByText(`사용 ${used}회 / 총 ${total}회 · 잔여 ${left}회`, { exact: true })).toBeVisible();
  }
}

/** 프로그램 카드의 만료일 — PC "만료일: 2025.06.30", 모바일 "… · 만료일 2025.06.30" */
export async function expectProgramExpiry(page: Page, name: string, iso: string) {
  const card = await programCard(page, name);
  const dotted = iso.replace(/-/g, '.');
  if (await isDesktop(page)) await expect(card.getByText(`만료일: ${dotted}`, { exact: true })).toBeVisible();
  else await expect(card.getByText(new RegExp(`· 만료일 ${dotted.replace(/\./g, '\\.')}$`))).toBeVisible();
}

/** 프로그램 카드의 상태 배지(만료·완료) 유무 */
export async function expectProgramBadge(page: Page, name: string, badge: '만료' | '완료', present: boolean) {
  const card = await programCard(page, name);
  await expect(card.getByText(badge, { exact: true })).toHaveCount(present ? 1 : 0);
}

/** 고객 상세의 [관리] 창을 연다 */
export async function openProgramManage(page: Page, name: string): Promise<Locator> {
  const card = await programCard(page, name);
  await card.getByRole('button', { name: `${name} 관리` }).click();
  const d = dialog(page, '프로그램 관리');
  await expect(d).toBeVisible();
  return d;
}

/**
 * 시술 기록 추가 창에서 고객을 고르고(쓸 수 있는 회차권이 1개면 자동 연결) 시술 항목 1개를 체크해 저장.
 * expectLinked: 자동 연결된 option 문구(예: '수분관리 10회권 (0/10회)') — 이때 만료 안내는 없어야 한다. null이면 연결 select가 없어야 함
 */
export async function logTreatment(page: Page, acc: E2EAccount, expectLinked: string | null) {
  await page.goto('/treatments?new=1');
  const d = dialog(page, '시술 기록 추가');
  await expect(d).toBeVisible();
  await pickCustomer(page, acc.customer);
  if (expectLinked === null) {
    await expect(d.getByLabel('차감할 회차권·프로그램')).toHaveCount(0);
  } else {
    await expect(d.getByLabel('차감할 회차권·프로그램').locator('option:checked')).toHaveText(expectLinked);
    await expect(page.getByTestId('expired-program-hint')).toHaveCount(0);
  }
  await d.getByRole('checkbox', { name: '테스트관리' }).check();
  await d.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** 시술 기록 추가 창을 열고 고객을 고른 뒤 — 연결 select 유무와 만료 안내 유무만 확인(저장하지 않음) */
export async function expectTreatmentLinkState(page: Page, acc: E2EAccount, v: { select: boolean; hint: string | null }) {
  await page.goto('/treatments?new=1');
  await expect(dialog(page, '시술 기록 추가')).toBeVisible();
  await pickCustomer(page, acc.customer);
  await expect(page.getByLabel('차감할 회차권·프로그램')).toHaveCount(v.select ? 1 : 0);
  if (v.hint === null) await expect(page.getByTestId('expired-program-hint')).toHaveCount(0);
  else await expect(page.getByTestId('expired-program-hint')).toContainText(v.hint);
}

// ── 제품·재고 ───────────────────────────────────────────────────

/** 제품 한 줄 — PC 표의 tr, 모바일 카드 목록의 li 모두 data-testid product-row */
const productRow = (page: Page, name: string): Locator =>
  page.getByTestId('product-row').filter({ hasText: name }).filter({ visible: true }).first();

export async function addProduct(page: Page, p: { name: string; price: number; stock: number }) {
  await page.goto('/products');
  await visibleButton(page, '제품 추가').click();
  await page.getByPlaceholder('제품명 입력').fill(p.name);
  await page.getByLabel('판매가').fill(String(p.price));
  await page.getByLabel('재고', { exact: true }).fill(String(p.stock));
  await visibleButton(page, '저장').click();
  await expect(productRow(page, p.name)).toBeVisible();
}

/** 재고 표기 — PC "12개", 모바일 "재고 12개" (단위 '개' 기준) */
export async function expectStock(page: Page, name: string, stock: number) {
  await expect(productRow(page, name).getByText(new RegExp(`^(재고 )?${stock}개$`))).toBeVisible();
}

/** 제품 1개 판매 — 판매 창의 수량 기본값 1 */
export async function sellProduct(page: Page, name: string) {
  await productRow(page, name).getByRole('button', { name: '판매', exact: true }).click();
  const d = dialog(page, '제품 판매 기록');
  await expect(d).toBeVisible();
  await expect(d.getByLabel('수량')).toHaveValue('1');
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

/**
 * 예약 추가 — 담당 직원은 staff(label)가 있으면 그 직원, 없으면 첫 항목; 시술은 첫 항목.
 * expectRejected: 겹침(이중예약) confirm을 스펙 핸들러가 거절했을 때 — 창이 그대로 남아야 하고 Esc로 닫는다.
 */
export async function addReservation(page: Page, acc: E2EAccount, startTime: string, opts: { staff?: string; expectRejected?: boolean } = {}) {
  await visibleButton(page, '예약 추가').click();
  const d = dialog(page, '예약 추가');
  await expect(d).toBeVisible();
  await pickCustomer(page, acc.customer, d);
  if (opts.staff) await d.getByLabel('담당 직원').selectOption({ label: opts.staff });
  else await d.getByLabel('담당 직원').selectOption({ index: 1 });
  await d.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await d.getByLabel('시작 시간').selectOption(startTime);
  await d.getByRole('button', { name: '예약 저장' }).click(); // 휴무일 confirm은 스펙의 dialog 핸들러가 수락
  if (opts.expectRejected) {
    await expect(d).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await expect(d).toHaveCount(0);
}

/** 예약 블록(PC 주간표)·카드(모바일 목록) 중 보이는 쪽 — 두 블록은 lg 기준으로 한쪽만 보인다 */
const reservationItem = (page: Page, startTime: string): Locator =>
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
export async function completeReservation(page: Page, startTime: string, pay: boolean) {
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

/** 고객 상세의 노쇼 횟수 — PC 배지 "노쇼 N회 — …", 모바일 "N회". 둘 다 0회면 렌더되지 않으므로 0 버그는 어느 쪽에서든 실패한다 */
export async function expectCustomerNoShows(page: Page, acc: E2EAccount, n: number) {
  await openCustomer(page, acc);
  const pc = page.getByTestId('noshow-badge').filter({ visible: true });
  const mobile = page.getByTestId('noshow-count').filter({ visible: true });
  await expect(pc.or(mobile)).toHaveText(new RegExp(`^(노쇼 )?${n}회( — |$)`));
}

// ── 날짜·안내 ───────────────────────────────────────────────────

/**
 * 오늘 + n일을 서울 날짜 YYYY-MM-DD로 — 브라우저는 Asia/Seoul(playwright.config)인데 러너(CI는 UTC)의 시계로 재면 KST 00~09시에 하루 어긋난다.
 * 앱의 +30일/+90일도 브라우저 지역 날짜 기준이므로 같은 기준으로 센다 (리뷰 2026-11-19).
 */
export function plusDaysISO(n: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + n * 86_400_000)); // en-CA → YYYY-MM-DD
}

/** 토스트 한 줄 — error 톤은 role=alert, 그 외 role=status (ToastHost) */
export const toast = (page: Page, text: string | RegExp, tone: 'alert' | 'status' = 'status'): Locator =>
  page.locator('[aria-live="polite"]').getByRole(tone).filter({ hasText: text });
