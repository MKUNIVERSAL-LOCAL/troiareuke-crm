import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, visibleButton } from './helpers';
import { addProgram, sellProgramToCustomer, refundFirstPayment, expectSales, openCustomer, expectProgramBadge, expectTreatmentLinkState, openProgramManage, logTreatment } from './flows';

/**
 * 회차권 결제의 돈을 지우는 두 경로 E2E (95, 2026-11-20 — 커버리지 감사 #1·#2)
 *  - 쓰지 않은 회차권 결제를 매출에서 환불 → 회차권이 함께 종료되고(배지 '완료'), 시술 기록에서 더 차감되지 않고, 매출 0원
 *  - 고객 상세 [관리] > [등록 취소] → 연결 결제가 함께 삭제되고 카드가 사라지며 매출에서도 빠진다. 한 번이라도 쓴 회차권에는 버튼 자체가 없다
 * 둘 다 confirm 문구(잔여 회차·삭제 결제 건수/금액)를 그대로 단언해 안내가 바뀌면 바로 드러난다.
 */

const acc = makeAccount('RF');

/** localStorage의 매장 데이터 테이블 하나를 읽는다 (crm_<shop>_<table>) */
async function readTable<T>(page: import('@playwright/test').Page, table: string): Promise<T[]> {
  return page.evaluate((t) => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_/.test(k) && k.endsWith(`_${t}`));
    return key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
  }, table);
}

test('쓰지 않은 회차권 결제를 환불하면 회차권이 함께 종료되고 매출·차감 경로에서 사라진다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept()); // 남은 질문형 confirm 수락 — 파괴적 확인은 앱 창이라 아래에서 직접 단언
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await addProgram(page, { name: '환불용 10회권', price: 300000, sessions: 10 });
  await sellProgramToCustomer(page, acc, '환불용 10회권 — 300,000원', { expectPrice: /300,?000/ });

  await page.goto('/sales');
  await expectSales(page, { total: '300,000원', count: 1 });
  await refundFirstPayment(page, { remaining: 10 }); // "회차권 함께 종료" 앱 확인창이 잔여 10회를 말하는지 flows 가 단언
  await visibleButton(page, '매출 현황').click(); // 결제 내역 보기에서 현황 카드로 돌아와서 확인
  await expectSales(page, { total: '0원', count: 1 }); // 환불 행은 남고 매출만 0

  // 회차권: 완료 배지, 시술 기록 창에서 연결 선택지 없음(차감 불가), 저장 데이터는 isCompleted + 환불 메모
  await openCustomer(page, acc);
  await expectProgramBadge(page, '환불용 10회권', '완료', true);
  const programs = await readTable<{ isCompleted: boolean; notes?: string; usedSessions: number }>(page, 'customer_programs');
  expect(programs).toHaveLength(1);
  expect(programs[0].isCompleted).toBe(true);
  expect(programs[0].notes || '').toMatch(/결제 환불로 종료/);
  await expectTreatmentLinkState(page, acc, { select: false, hint: null });

  // 고객 누적 결제액은 완료 결제 합 — 환불 뒤 0
  const customers = await readTable<{ name: string; totalSpent: number }>(page, 'customers');
  expect(customers.find(c => c.name === acc.customer)?.totalSpent).toBe(0);
});

test('[등록 취소]는 쓰지 않은 회차권에만 보이고, 누르면 연결 결제까지 함께 지운다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept()); // 남은 질문형 confirm 수락 — 파괴적 확인은 앱 창이라 아래에서 직접 단언
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 먼저 한 번 쓴 회차권: 시술 기록 1건으로 차감하면 [관리]에 [등록 취소]가 없다 (리뷰 97 — 부정 단언)
  await addProgram(page, { name: '사용한 5회권', price: 100000, sessions: 5 });
  await sellProgramToCustomer(page, acc, '사용한 5회권 — 100,000원', { expectPrice: /100,?000/ });
  await logTreatment(page, acc, '사용한 5회권 · 잔여 5회 (0/5)');
  await openCustomer(page, acc);
  const usedManage = await openProgramManage(page, '사용한 5회권');
  await expect(usedManage.getByText('사용 1회 / 총 5회 · 잔여 4회')).toBeVisible();
  await expect(usedManage.getByRole('button', { name: '등록 취소' })).toHaveCount(0);
  await usedManage.getByRole('button', { name: '취소', exact: true }).click();
  await expect(usedManage).toHaveCount(0);

  await addProgram(page, { name: '취소용 10회권', price: 300000, sessions: 10 });
  await sellProgramToCustomer(page, acc, '취소용 10회권 — 300,000원', { expectPrice: /300,?000/ });
  await page.goto('/sales');
  await expectSales(page, { total: '400,000원', count: 2 });

  await openCustomer(page, acc);
  const manage = await openProgramManage(page, '취소용 10회권');
  const cancel = manage.getByRole('button', { name: '등록 취소' });
  await expect(cancel).toBeVisible();
  await cancel.click();
  const cancelConfirm = page.getByRole('dialog', { name: '회차권 등록 취소', exact: true });
  await expect(cancelConfirm).toContainText(/등록을 취소할까요/);
  await expect(cancelConfirm).toContainText(/결제 1건\(300,000원\)/); // 연결 결제 건수·금액을 창에서 말한다
  await cancelConfirm.getByRole('button', { name: '등록 취소', exact: true }).click();
  await expect(manage).toHaveCount(0);
  await expect(page.getByTestId('program-card').filter({ hasText: '취소용 10회권' })).toHaveCount(0);
  await expect(page.getByTestId('program-card').filter({ hasText: '사용한 5회권' })).toHaveCount(1); // 쓴 회차권은 그대로

  // 취소한 쪽 결제만 함께 사라졌다 — 매출은 사용한 5회권 100,000원·결제 1건, 저장 데이터도 1건씩
  await page.goto('/sales');
  await expectSales(page, { total: '100,000원', count: 1 });
  expect(await readTable(page, 'payments')).toHaveLength(1);
  expect(await readTable<{ programName: string }>(page, 'customer_programs').then(l => l.map(p => p.programName))).toEqual(['사용한 5회권']);
  const customers = await readTable<{ name: string; totalSpent: number }>(page, 'customers');
  expect(customers.find(c => c.name === acc.customer)?.totalSpent).toBe(100000);
});
