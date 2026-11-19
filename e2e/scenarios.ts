import { expect, type Page } from '@playwright/test';
import { pickCustomer, visibleButton, type E2EAccount } from './helpers';
import {
  registerPayment, registerExpense, salesTab, expectPnl, expectSales, changeFirstExpenseCategory, refundFirstPayment,
  addProgram, sellProgramToCustomer, expectProgramSessions, logTreatment, openCustomer,
  addProduct, expectStock, sellProduct, cancelFirstSale,
  addReservation, reservationItems, completeReservation, setReservationStatus, expectReservationDetail,
  expectTodayCard, expectStaffPerformance, expectCustomerNoShows,
} from './flows';

/**
 * 끝까지 가는 업무 시나리오 (2026-11-19 ㊷) — PC(chromium)와 모바일(Pixel 7) 스펙이 같은 함수를 호출한다.
 * 숫자가 바뀌면 여기 한 곳만 고친다. 가입·고객 등록은 스펙이 하고(계정 접두사가 다름), 여기는 그 뒤부터.
 */

/** 돈 흐름: 결제 50,000 → 지출 20,000(제품 매입) → 손익 → 지출 분류 임대료 → 환불 → 새로고침 뒤 유지 */
export async function salesScenario(page: Page, acc: E2EAccount) {
  await registerPayment(page, acc, 50000);
  await expectSales(page, { total: '50,000원', treatment: '50,000원', count: 1 });

  await registerExpense(page, '앰플 20개 매입', 20000);
  await expect(salesTab(page, /지출 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });

  // 매출 50,000 − 매출원가 20,000 = 영업이익 30,000 (60%)
  await expectPnl(page, { cogs: '−20,000원', gross: '30,000원', operating: '30,000원' });
  await expect(page.getByText('영업이익률', { exact: true }).first().locator('..')).toContainText('60%');

  // 제품 매입 → 임대료: 매출원가 0 → 판관비 20,000, 매출총이익 50,000, 영업이익 그대로
  await changeFirstExpenseCategory(page, '임대료');
  await expectPnl(page, { cogs: '−0원', gross: '50,000원', operating: '30,000원' });

  // 환불: 매출에서 빠진다(건수는 남음), 영업이익 -20,000
  await refundFirstPayment(page);
  await salesTab(page, '매출 현황').click();
  await expectSales(page, { total: '0원', count: 1 });
  await expectPnl(page, { cogs: '−0원', operating: '-20,000원' });

  await page.reload();
  await expect(salesTab(page, /지출 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expectSales(page, { total: '0원' });
}

/** 회차권·제품: 10회 300,000 판매 → 차감 1회 → 제품 48,000 재고 12 → 판매 1 → 매출 348,000 → 판매 취소 → 재고 12·매출 300,000 */
export async function programsProductsScenario(page: Page, acc: E2EAccount) {
  await addProgram(page, { name: '수분관리 10회권', sessions: 10, price: 300000 });
  await sellProgramToCustomer(page, acc, '수분관리 10회권 — 300,000원', { expectPrice: /300,?000/ });
  await expectProgramSessions(page, '수분관리 10회권', 0, 10);

  // 쓸 수 있는 회차권이 1개라 자동 연결 → 저장 뒤 시술 목록에 남고(결제 화면으로 가지 않음) 사용 1회 / 잔여 9회
  await logTreatment(page, acc, '수분관리 10회권 (0/10회)');
  await expect(page.getByText('수분관리 10회권').filter({ visible: true }).first()).toBeVisible(); // 시술 목록의 프로그램 배지
  await expect(page).toHaveURL(/\/treatments/);
  await openCustomer(page, acc);
  await expectProgramSessions(page, '수분관리 10회권', 1, 10);

  await addProduct(page, { name: '수분 세럼', price: 48000, stock: 12 });
  await expectStock(page, '수분 세럼', 12);
  await sellProduct(page, '수분 세럼');
  await expectStock(page, '수분 세럼', 11);

  await page.goto('/sales');
  await expectSales(page, { total: '348,000원', treatment: '300,000원', product: '48,000원', count: 2 });

  await cancelFirstSale(page);
  await expectStock(page, '수분 세럼', 12);
  await page.goto('/sales');
  await expectSales(page, { total: '300,000원', product: '0원', count: 1 });
}

/** 같은 담당자 같은 시각에 다시 잡으면 겹침 confirm → (스펙 핸들러가 거절) → 등록되지 않고 창이 남는다 */
async function attemptDoubleBooking(page: Page, acc: E2EAccount, startTime: string) {
  await visibleButton(page, '예약 추가').click();
  const d = page.getByRole('dialog', { name: '예약 추가' });
  await expect(d).toBeVisible();
  await pickCustomer(page, acc.customer, d);
  await d.getByLabel('담당 직원').selectOption({ index: 1 });
  await d.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await d.getByLabel('시작 시간').selectOption(startTime);
  await d.getByRole('button', { name: '예약 저장' }).click();
  await expect(d).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
}

/**
 * 예약: 10·12·14시 3건 → 이중예약 차단 → 10시 완료+결제 → 12시 노쇼 → 14시 취소→복구→재취소 →
 * 대시보드 "1건 · 완료 1건 · 남은 0건 · 노쇼 1건" → 직원 실적 1건·50,000 → 고객 노쇼 1회 → 매출 50,000.
 * 스펙의 dialog 핸들러는 '이미 예약이 있습니다'만 거절하고 나머지 confirm은 수락해야 한다.
 */
export async function reservationsScenario(page: Page, acc: E2EAccount) {
  await page.goto('/reservations');
  await addReservation(page, acc, '10:00');
  await addReservation(page, acc, '12:00');
  await addReservation(page, acc, '14:00');
  await expect(reservationItems(page)).toHaveCount(3);
  await attemptDoubleBooking(page, acc, '10:00');
  await expect(reservationItems(page)).toHaveCount(3);

  await completeReservation(page, '10:00', true);
  await expectReservationDetail(page, '10:00', '완료', { '완료처리': 0, '결제 등록하기': 0 });

  await setReservationStatus(page, '12:00', '노쇼');
  await expectReservationDetail(page, '12:00', '노쇼', { '노쇼': 0, '취소처리': 0, '예약 복구': 1 });

  await setReservationStatus(page, '14:00', '취소처리');
  await expectReservationDetail(page, '14:00', '취소', { '취소처리': 0, '노쇼': 0 });
  await setReservationStatus(page, '14:00', '예약 복구');
  await expectReservationDetail(page, '14:00', '예약확정', { '예약 복구': 0 });
  await setReservationStatus(page, '14:00', '취소처리');

  await expectTodayCard(page, '1건', '완료 1건 · 남은 0건 · 노쇼 1건');
  await expectStaffPerformance(page, '김테스트', '1건', '50,000원');
  await expectCustomerNoShows(page, acc, 1);
  await page.goto('/sales');
  await expectSales(page, { total: '50,000원', count: 1 });
}
