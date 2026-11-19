import { expect, type Page } from '@playwright/test';
import { pickCustomer, visibleButton, type E2EAccount } from './helpers';
import {
  dialog,
  registerPayment, registerExpense, expectPnl, expectSales, changeFirstExpenseCategory, refundFirstPayment,
  addProgram, changeGrade, sellProgramToCustomer, expectProgramSessions, logTreatment, openCustomer, programCard,
  addProduct, expectStock, sellProduct, cancelFirstSale,
  addReservation, reservationItems, openReservationDetail, completeReservation, setReservationStatus, expectReservationDetail,
  expectTodayCard, expectStaffPerformance, expectCustomerNoShows,
  plusDaysISO, expectProgramExpiry, expectProgramBadge, openProgramManage, expectTreatmentLinkState, toast,
} from './flows';

/**
 * 끝까지 가는 업무 시나리오 (2026-11-19 ㊷·㊸, 리뷰 반영 ㊺) — PC(chromium)와 모바일(Pixel 7) 스펙이 같은 함수를 호출한다.
 * 숫자가 바뀌면 여기 한 곳만 고친다. 가입·고객 등록은 스펙이 하고(계정 접두사가 다름), 여기는 그 뒤부터.
 */

/** 돈 흐름: 결제 50,000 → 지출 20,000(제품 매입) → 손익 → 지출 분류 임대료 → 환불 → 새로고침 뒤 유지 */
export async function salesScenario(page: Page, acc: E2EAccount) {
  await registerPayment(page, acc, 50000);
  await expectSales(page, { total: '50,000원', treatment: '50,000원', count: 1 });

  await registerExpense(page, '앰플 20개 매입', 20000);
  await expect(visibleButton(page, /지출 내역 \(1\)/)).toBeVisible();

  // 매출 50,000 − 매출원가 20,000 = 영업이익 30,000 (60%)
  await expectPnl(page, { cogs: '−20,000원', gross: '30,000원', operating: '30,000원' });
  await expect(page.getByText('영업이익률', { exact: true }).first().locator('..')).toContainText('60%');

  // 제품 매입 → 임대료: 매출원가 0 → 판관비 20,000, 매출총이익 50,000, 영업이익 그대로
  await changeFirstExpenseCategory(page, '임대료');
  await expectPnl(page, { cogs: '−0원', gross: '50,000원', operating: '30,000원' });

  // 환불: 매출에서 빠진다(건수는 남음), 영업이익 -20,000
  await refundFirstPayment(page);
  await visibleButton(page, '매출 현황').click();
  await expectSales(page, { total: '0원', count: 1 });
  await expectPnl(page, { cogs: '−0원', operating: '-20,000원' });

  await page.reload();
  await expect(visibleButton(page, /지출 내역 \(1\)/)).toBeVisible();
  await expectSales(page, { total: '0원' });
}

/** 회차권·제품: 10회 300,000 판매 → 차감 1회 → 제품 48,000 재고 12 → 판매 1 → 매출 348,000 → 판매 취소 → 재고 12·매출 300,000 */
export async function programsProductsScenario(page: Page, acc: E2EAccount) {
  await addProgram(page, { name: '수분관리 10회권', sessions: 10, price: 300000 });
  await sellProgramToCustomer(page, acc, '수분관리 10회권 — 300,000원', { expectPrice: /300,?000/ });
  await expectProgramSessions(page, '수분관리 10회권', 0, 10);

  // 쓸 수 있는 회차권이 1개라 자동 연결 → 저장 뒤 시술 목록에 남고(결제 화면으로 가지 않음) 사용 1회 / 잔여 9회
  await logTreatment(page, acc, '수분관리 10회권 · 잔여 10회 (0/10)');
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
  await addReservation(page, acc, '10:00', { expectRejected: true }); // 같은 담당자 같은 시각 → 겹침 confirm 거절 → 미등록
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

/**
 * 회차권 만료: 구매일 2025-01-01(유효 180일 → 만료일 2025-06-30) → '만료' 배지 → 고객 상세 빠른 기록·시술 기록 화면·예약 칩에서 차감 불가/안내 →
 * 관리 +30일(오늘+30, 변경 기록) → 선택지 복귀·자동 연결·차감 1회 → 총 회차 0 거절 → 완료 처리 → 선택지·안내 없음 → 되돌리기 → 잔여 9회.
 */
export async function programExpiryScenario(page: Page, acc: E2EAccount) {
  const name = '수분관리 10회권';
  await addProgram(page, { name, sessions: 10, price: 300000 }); // 유효기간 기본 180일(addProgram이 확인)
  await sellProgramToCustomer(page, acc, `${name} — 300,000원`, { purchaseDate: '2025-01-01' });
  await expectProgramBadge(page, name, '만료', true);
  await expectProgramExpiry(page, name, '2025-06-30');

  // 고객 상세의 빠른 [시술 기록] 창: 자동 연결 안 되고 선택지는 '선택 없음'뿐, 연장 안내
  await visibleButton(page, '시술 기록').click();
  const quick = page.getByLabel('차감할 프로그램');
  await expect(quick.locator('option')).toHaveCount(1);
  await expect(quick).toHaveValue('');
  await expect(page.getByTestId('expired-program-hint')).toContainText(`만료된 회차권(${name})은 차감할 수 없습니다`);

  // 예약 추가 창의 회차권 잔여 칩에도 '만료'
  await page.goto('/reservations');
  await visibleButton(page, '예약 추가').click();
  const resDialog = dialog(page, '예약 추가');
  await pickCustomer(page, acc.customer, resDialog);
  await expect(resDialog.getByLabel('회차권 잔여')).toContainText(`${name} · 잔여 10회 · 만료`);

  // 시술 기록 화면: 선택지 없음 + 안내
  await expectTreatmentLinkState(page, acc, { select: false, hint: `만료된 회차권(${name})은 차감할 수 없습니다` });

  // 관리 → +30일 → 저장: 만료일 = 오늘+30, 배지 사라짐, 변경 기록에 사유
  await openCustomer(page, acc);
  // 등급 칩 → 메뉴 (PC·모바일 같은 동작, UX 점검 M8)
  await changeGrade(page, '신규', '골드');
  let manage = await openProgramManage(page, name);
  await expect(manage.getByLabel('만료일')).toHaveValue('2025-06-30');
  await manage.getByRole('button', { name: '+30일' }).click();
  const plus30 = plusDaysISO(30);
  await expect(manage.getByLabel('만료일')).toHaveValue(plus30);
  await manage.getByLabel('사유').fill('휴가 복귀 연장');
  await manage.getByRole('button', { name: '저장', exact: true }).click();
  await expect(manage).toHaveCount(0);
  await expectProgramBadge(page, name, '만료', false);
  await expectProgramExpiry(page, name, plus30);
  manage = await openProgramManage(page, name);
  await expect(manage.getByText(/만료일 2025\.06\.30 → \d{4}\.\d{2}\.\d{2} — 휴가 복귀 연장/)).toBeVisible();
  await manage.getByRole('button', { name: '취소', exact: true }).click();
  await expect(manage).toHaveCount(0);

  // 선택지에 돌아오고 안내는 사라진다 → 자동 연결로 저장하면 사용 1회 / 잔여 9회
  await expectTreatmentLinkState(page, acc, { select: true, hint: null });
  await logTreatment(page, acc, `${name} · 잔여 10회 (0/10)`);
  await openCustomer(page, acc);
  await expectProgramSessions(page, name, 1, 10);

  // 총 회차 0은 거절(토스트), 변경 중엔 완료 처리 비활성 → 되돌린 뒤 완료 처리 → '완료' 배지
  manage = await openProgramManage(page, name);
  await manage.getByLabel('총 회차').fill('0');
  await expect(manage.getByRole('button', { name: '완료 처리' })).toBeDisabled();
  await manage.getByRole('button', { name: '저장', exact: true }).click();
  await expect(toast(page, '총 회차는 1 이상이어야 합니다.', 'alert')).toBeVisible();
  await expect(manage).toBeVisible();
  await manage.getByLabel('총 회차').fill('10');
  await manage.getByRole('button', { name: '완료 처리' }).click(); // confirm 수락
  await expect(manage).toHaveCount(0);
  await expectProgramBadge(page, name, '완료', true);

  // 완료된 회차권은 시술 기록 선택지에도, 만료 안내에도 없다
  await expectTreatmentLinkState(page, acc, { select: false, hint: null });

  // 되돌리기 → 잔여 9회 그대로
  await openCustomer(page, acc);
  manage = await openProgramManage(page, name);
  await manage.getByRole('button', { name: '진행중으로 되돌리기' }).click();
  await expect(manage).toHaveCount(0);
  await expectProgramBadge(page, name, '완료', false);
  await expectProgramSessions(page, name, 1, 10);
}

/** 기간제: 등록(총 회차 없음·90일) → 판매(만료일 오늘+90, 잔여 표기 없음) → 기록 2건 연결해도 완료 안 됨 → 관리(총 회차 없음) 완료 처리 → 선택지 없음 → 매출 200,000 */
export async function periodProgramScenario(page: Page, acc: E2EAccount) {
  const name = '피부진정 기간제';
  await addProgram(page, { name, price: 200000, timed: true, validityDays: 90 });
  const progItem = page.getByTestId('program-item').filter({ hasText: name });
  await expect(progItem.getByText('기간제', { exact: true })).toBeVisible();
  await expect(progItem.getByText('90일 유효')).toBeVisible();

  await sellProgramToCustomer(page, acc, `${name} — 200,000원`, { expectPrice: /200,?000/ });
  let card = await programCard(page, name);
  await expect(card.getByText('기간제 프로그램', { exact: true })).toBeVisible();
  await expectProgramExpiry(page, name, plusDaysISO(90));
  await expect(card.getByText(/잔여/)).toHaveCount(0);
  await expectProgramBadge(page, name, '만료', false);

  // 시술 기록 2건 연결 — 횟수제가 아니라 몇 번을 써도 완료되지 않는다
  await logTreatment(page, acc, `${name} · 기간제 (0회 이용)`);
  await logTreatment(page, acc, `${name} · 기간제 (1회 이용)`);
  await openCustomer(page, acc);
  card = await programCard(page, name);
  await expectProgramBadge(page, name, '완료', false);
  await expect(card.getByText('이용 내역 (2건)', { exact: true })).toBeVisible(); // PC·모바일 모두 (㊹)
  await expect(card.getByText(/^-\d+회$/)).toHaveCount(0); // 기간제는 '-1회' 같은 차감 표기를 하지 않는다

  // 관리: 기간제라 총 회차 입력이 없고, 완료 처리하면 '완료' 배지 + 선택지에서 빠진다
  const manage = await openProgramManage(page, name);
  await expect(manage.getByText(/^기간제 · 등록 /)).toBeVisible();
  await expect(manage.getByLabel('총 회차')).toHaveCount(0);
  await manage.getByRole('button', { name: '완료 처리' }).click(); // confirm 수락
  await expect(manage).toHaveCount(0);
  await expectProgramBadge(page, name, '완료', true);
  await expectTreatmentLinkState(page, acc, { select: false, hint: null });

  await page.goto('/sales');
  await expectSales(page, { total: '200,000원', treatment: '200,000원', count: 1 });
}

/**
 * 직원: 추가(같은 이름 재직자 거절) → 예약 담당 선택 → 완료(결제 없이) → [결제 등록하기] → 결제 → 실적 1건·50,000 →
 * 이름 변경에도 실적 유지 → 퇴사(담당 목록 제외·"(퇴사)") → 같은 이름 재직자 있으면 복직 거절 → 복직 → 담당 목록 복귀.
 */
export async function staffScenario(page: Page, acc: E2EAccount) {
  await page.goto('/staff');
  await visibleButton(page, '직원 추가').click();
  const addDialog = dialog(page, '직원 추가');
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel('이름').fill('김테스트');
  await addDialog.getByPlaceholder('010-0000-0000').fill('010-2222-3333');
  await addDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(toast(page, /같은 이름/, 'alert')).toBeVisible(); // 검증 안내는 오류 톤(role=alert)
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel('이름').fill('박신입');
  await addDialog.getByLabel('역할').selectOption('에스테티션');
  await addDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(addDialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^박신입/ }).first()).toBeVisible();

  // 예약: 담당 직원 선택지에 새 직원 → 10:00 예약 → 결제 없이 완료 → 다시 열면 [결제 등록하기] → 결제 → 사라짐
  await page.goto('/reservations');
  await addReservation(page, acc, '10:00', { staff: '박신입 (에스테티션)' });
  let detail = await openReservationDetail(page, '10:00');
  await expect(detail).toContainText('박신입');
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await completeReservation(page, '10:00', false);
  detail = await openReservationDetail(page, '10:00');
  await expect(detail.getByRole('button', { name: '완료처리' })).toHaveCount(0);
  await expect(detail.getByText('완료 처리됐지만 결제가 아직 등록되지 않은 예약입니다.')).toBeVisible();
  await detail.getByRole('button', { name: '결제 등록하기' }).click();
  await expect(page.getByText('완료 처리된 예약입니다. 아직 등록되지 않은 결제')).toBeVisible();
  await page.getByRole('button', { name: '결제 등록', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectReservationDetail(page, '10:00', '완료', { '결제 등록하기': 0, '완료처리': 0 });

  // 직원 실적: 박신입 완료 1건 · 50,000원
  await expectStaffPerformance(page, '박신입', '1건', '50,000원');
  const perf = page.getByTestId('staff-performance');
  const rowOf = (n: string) => perf.locator('tbody tr').filter({ hasText: n }).first();

  // 이름 변경(박신입 → 박선임): 예약은 staffId로 연결돼 실적이 따라온다
  const staffDetail = dialog(page, '직원 상세');
  const editDialog = dialog(page, '직원 수정');
  const rename = async (from: RegExp, to: string, phone?: string) => {
    await page.getByRole('heading', { name: from }).first().click(); // 직원 카드 제목 — '오늘 직원별 예약 현황'의 이름과 구분
    await staffDetail.getByRole('button', { name: '수정' }).click();
    await editDialog.getByLabel('이름').fill(to);
    if (phone) await editDialog.getByLabel('전화번호').fill(phone); // 온보딩으로 만든 직원은 전화번호가 비어 있다
    await editDialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(editDialog).toHaveCount(0);
  };
  await rename(/^박신입/, '박선임');
  await expect(rowOf('박선임').getByTestId('perf-completed')).toHaveText('1건');
  await expect(perf.locator('tbody tr').filter({ hasText: '박신입' })).toHaveCount(0);

  // 퇴사 처리: 새 예약 담당 목록에서 빠지고 실적 표엔 "(퇴사)"
  await page.getByRole('heading', { name: /^박선임/ }).first().click();
  await staffDetail.getByRole('button', { name: '퇴사 처리' }).click(); // confirm 수락
  await expect(toast(page, '퇴사 처리했습니다.')).toBeVisible(); // info 톤도 role=status
  await expect(rowOf('박선임')).toContainText('박선임 (퇴사)');
  await expect(rowOf('박선임').getByTestId('perf-completed')).toHaveText('1건');
  const staffOptions = async () => {
    await page.goto('/reservations');
    await visibleButton(page, '예약 추가').click();
    return dialog(page, '예약 추가').getByLabel('담당 직원').locator('option');
  };
  let options = await staffOptions();
  await expect(options.filter({ hasText: '박선임' })).toHaveCount(0);
  await expect(options.filter({ hasText: '김테스트' })).toHaveCount(1);

  // 복직 전에 같은 이름의 재직자가 있으면 거절 → 이름을 되돌린 뒤 복직 → 담당 목록 복귀
  await page.goto('/staff');
  await visibleButton(page, '재직').click();
  await rename(/^김테스트/, '박선임', '010-1111-2222');
  await visibleButton(page, '퇴사·비활성').click();
  await page.getByRole('heading', { name: /^박선임/ }).first().click(); // 카드 제목에 '퇴사' 배지가 붙어 정확 일치 텍스트로는 못 잡는다
  await staffDetail.getByRole('button', { name: '복직' }).click();
  await expect(toast(page, /같은 이름의 재직 직원이 이미 있어 복직할 수 없습니다/, 'alert')).toBeVisible();
  await expect(staffDetail).toBeVisible(); // 거절이라 창은 그대로
  await page.keyboard.press('Escape');
  await expect(staffDetail).toHaveCount(0);
  await visibleButton(page, '재직').click();
  await rename(/^박선임/, '김테스트');
  await visibleButton(page, '퇴사·비활성').click();
  await page.getByRole('heading', { name: /^박선임/ }).first().click();
  await staffDetail.getByRole('button', { name: '복직' }).click();
  await expect(toast(page, '복직 처리했습니다.')).toBeVisible();
  options = await staffOptions();
  await expect(options.filter({ hasText: '박선임' })).toHaveCount(1);
}
