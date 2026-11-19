import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard } from './helpers';

/**
 * 대량 데이터 안전망 (성능 감사 2026-11-18, 로컬 모드)
 * 고객 2,000명 · 시술 기록 6,000건 · 예약 3,000건 · 결제 4,000건을 localStorage에 직접 심고
 * 고객/시술/예약 화면이 "100건씩 + 더 보기"로 열리며, 검색이 멈추지 않는지, 매출·손익·직원 실적·주간 예약표·예약 추가의 고객 검색이
 * 멈추지 않는지(2026-11-19 ㊲) 확인한다.
 * (수치는 localStorage 5MB 한도 안에서 — 실제 매장 상한 3,000/15,000/8,000의 축소판)
 */

const acc = makeAccount('SCALE');
const CUSTOMERS = 2_000;
const TREATMENTS = 6_000;
const RESERVATIONS = 3_000;
const PAYMENTS = 4_000;

test('고객 2,000명·시술 6,000건·예약 3,000건·결제 4,000건에서도 목록·검색·매출·실적·예약표가 즉시 반응한다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);

  // 스토어 키 형식: crm_<shopId>_<table> — 가입 직후 settings 키에서 shopId를 얻는다
  await page.evaluate(({ CUSTOMERS, TREATMENTS, RESERVATIONS, PAYMENTS }) => {
    const settingsKey = Object.keys(localStorage).find(k => /^crm_.*_settings$/.test(k))!;
    const prefix = settingsKey.replace(/_settings$/, '');
    const shopId = prefix.replace(/^crm_/, '');
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };
    const customers = Array.from({ length: CUSTOMERS }, (_, i) => ({
      id: `scale_c_${i}`, shopId, name: `대량고객${i}`, phone: `010-${String(1000 + (i % 9000)).padStart(4, '0')}-${String(i % 10000).padStart(4, '0')}`,
      gender: 'female', grade: i % 7 === 0 ? 'VIP' : i % 3 === 0 ? '신규' : '일반', totalVisits: i % 20, totalSpent: (i % 50) * 10000,
      lastVisitDate: day(-(i % 400)), registeredAt: new Date(Date.now() - (i % 700) * 86400000).toISOString(), tags: i % 5 === 0 ? ['민감성'] : [], isActive: true,
    }));
    const treatments = Array.from({ length: TREATMENTS }, (_, i) => ({
      id: `scale_t_${i}`, shopId, customerId: `scale_c_${i % CUSTOMERS}`, customerName: `대량고객${i % CUSTOMERS}`, staffName: '김테스트',
      treatmentDate: day(-(i % 365)), sessionsUsed: 0, treatmentDetails: `관리 ${i}`, createdAt: new Date().toISOString(),
    }));
    const reservations = Array.from({ length: RESERVATIONS }, (_, i) => ({
      id: `scale_r_${i}`, customerId: `scale_c_${i % CUSTOMERS}`, customerName: `대량고객${i % CUSTOMERS}`, customerPhone: '010-0000-0000',
      staffId: 'scale_s', staffName: '김테스트', services: [{ serviceId: 'scale_sv', serviceName: '테스트관리', price: 50000, duration: 60 }],
      date: day((i % 120) - 60), startTime: `${String(10 + (i % 8)).padStart(2, '0')}:00`, endTime: `${String(11 + (i % 8)).padStart(2, '0')}:00`,
      status: i % 4 === 0 ? 'completed' : 'confirmed', source: 'manual', totalPrice: 50000,
    }));
    const payments = Array.from({ length: PAYMENTS }, (_, i) => ({
      id: `scale_p_${i}`, shopId, customerId: `scale_c_${i % CUSTOMERS}`, customerName: `대량고객${i % CUSTOMERS}`,
      paymentDate: day(-(i % 365)), type: i % 3 === 0 ? 'product' : 'single_treatment', typeLabel: i % 3 === 0 ? '제품 판매' : '단건 시술',
      amount: 50000 + (i % 5) * 10000, paymentMethod: i % 2 === 0 ? '카드' : '현금', discountAmount: 0,
      status: i % 50 === 0 ? 'refunded' : 'completed', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem(`${prefix}_customers`, JSON.stringify(customers));
    localStorage.setItem(`${prefix}_treatment_logs`, JSON.stringify(treatments));
    localStorage.setItem(`${prefix}_reservations`, JSON.stringify(reservations));
    localStorage.setItem(`${prefix}_payments`, JSON.stringify(payments));
  }, { CUSTOMERS, TREATMENTS, RESERVATIONS, PAYMENTS });

  // 고객 목록 — 100명 + 더 보기, 검색 반응
  let t0 = Date.now();
  await page.goto('/customers');
  const moreCustomers = page.getByRole('button', { name: /더 보기 \(1,?900명 남음\)/ }).filter({ visible: true }).first();
  await expect(moreCustomers).toBeVisible({ timeout: 15_000 });
  const customersMs = Date.now() - t0;
  await moreCustomers.click();
  await expect(page.getByRole('button', { name: /더 보기 \(1,?800명 남음\)/ }).filter({ visible: true }).first()).toBeVisible();
  const searchBox = page.getByPlaceholder('이름, 전화번호 검색').filter({ visible: true }).first();
  t0 = Date.now();
  await searchBox.fill('대량고객1999');
  await expect(page.getByText('대량고객1999').filter({ visible: true }).first()).toBeVisible();
  const searchMs = Date.now() - t0;
  await expect(page.getByRole('button', { name: /더 보기/ }).filter({ visible: true })).toHaveCount(0); // 검색 결과는 1명 — 더 보기 없음

  // 시술 기록 — 100건 + 더 보기
  t0 = Date.now();
  await page.goto('/treatments');
  await expect(page.getByRole('button', { name: /더 보기 \(5,?900건 남음\)/ }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
  const treatmentsMs = Date.now() - t0;

  // 예약 목록 뷰 — 200건 + 더 보기 (PC)
  t0 = Date.now();
  await page.goto('/reservations');
  await page.getByRole('button', { name: '목록', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('button', { name: /더 보기 \(2,?800건 남음\)/ }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
  const reservationsMs = Date.now() - t0;

  // 홈 — 알림 카드(재방문·회차권·내일 예약)까지 포함해 열린다
  t0 = Date.now();
  await page.goto('/');
  await expect(page.getByText('오늘 예약 현황').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
  const dashboardMs = Date.now() - t0;

  // 주간 예약표 — 이번 주 블록(≈175건)이 그려진다 (2026-11-19 ㊲)
  t0 = Date.now();
  await page.goto('/reservations');
  await expect(page.getByTestId('reservation-block').first()).toBeVisible({ timeout: 15_000 });
  const weekMs = Date.now() - t0;

  // 예약 추가의 고객 검색(콤보박스) — 2,000명 중 이름으로 즉시 좁혀진다
  await page.getByRole('button', { name: '예약 추가', exact: true }).click();
  const addDialog = page.getByRole('dialog', { name: '예약 추가' });
  await expect(addDialog).toBeVisible();
  t0 = Date.now();
  await addDialog.getByRole('combobox', { name: '고객' }).fill('대량고객1999');
  await expect(addDialog.getByRole('option', { name: /대량고객1999/ })).toBeVisible({ timeout: 15_000 });
  const comboMs = Date.now() - t0;
  await addDialog.getByRole('button', { name: '닫기', exact: true }).click(); // Esc는 열린 콤보박스 목록부터 닫는다
  await expect(addDialog).toHaveCount(0);

  // 매출 현황·손익계산서 — 결제 4,000건 집계
  t0 = Date.now();
  await page.goto('/sales');
  await expect(page.getByTestId('sales-total-amount')).toBeVisible({ timeout: 15_000 });
  const salesMs = Date.now() - t0;
  t0 = Date.now();
  await page.getByRole('button', { name: '손익계산서' }).click();
  await expect(page.getByTestId('pnl-operating')).toBeVisible({ timeout: 15_000 });
  const pnlMs = Date.now() - t0;

  // 직원 월 실적 — 예약 3,000·시술 6,000을 직원별로 묶는다
  t0 = Date.now();
  await page.goto('/staff');
  await expect(page.getByTestId('staff-performance').locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  const staffMs = Date.now() - t0;

  console.log(`[scale] week ${weekMs}ms, combo ${comboMs}ms, sales ${salesMs}ms, pnl ${pnlMs}ms, staff ${staffMs}ms`);
  expect(weekMs, '주간 예약표 첫 표시').toBeLessThan(10_000);
  expect(comboMs, '예약 추가 고객 검색 반응').toBeLessThan(5_000);
  expect(salesMs, '매출 현황 첫 표시').toBeLessThan(10_000);
  expect(pnlMs, '손익계산서 전환').toBeLessThan(5_000);
  expect(staffMs, '직원 실적 첫 표시').toBeLessThan(10_000);

  console.log(`[scale] customers ${customersMs}ms, search ${searchMs}ms, treatments ${treatmentsMs}ms, reservations(list) ${reservationsMs}ms, dashboard ${dashboardMs}ms`);
  // CI 변동을 감안한 느슨한 상한 — 회귀(수십 초 멈춤)만 잡는다
  expect(customersMs, '고객 목록 첫 표시').toBeLessThan(10_000);
  expect(searchMs, '고객 검색 반응').toBeLessThan(5_000);
  expect(treatmentsMs, '시술 기록 첫 표시').toBeLessThan(10_000);
  expect(dashboardMs, '홈 첫 표시').toBeLessThan(10_000);
});
