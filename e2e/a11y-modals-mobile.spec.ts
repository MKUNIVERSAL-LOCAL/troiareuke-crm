import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer, expectNoHorizontalOverflow } from './helpers';
import { assertNoBlocking, makeStep, SETTINGS_TAB_READY, type Row } from './a11y-shared';
import { addProgram, registerPayment } from './flows';

/**
 * 모바일 폭 모달·상세 접근성 게이트 (axe-core, WCAG 2.1 A/AA, 2026-11-19 ㉞) — PC 모달 게이트(a11y-modals.spec)와 같은 창을
 * Pixel 7 폭에서 연다. 모바일은 고객 상세가 전체 화면 오버레이, 예약은 카드 목록 → 상세 모달이라 여는 길이 다르다.
 * 파일명에 mobile.spec가 들어가야 mobile 프로젝트가 집어 간다(playwright.config testMatch).
 */

const acc = makeAccount('AN');

test('모바일 폭에서도 주요 모달·상세 창에 serious·critical 접근성 위반과 가로 넘침이 없다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];
  const step = makeStep(page, rows, label => expectNoHorizontalOverflow(page, label)); // 창마다 가로 넘침도 (㊻)
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
  await addProgram(page, { name: '접근성 10회권', sessions: 10, price: 100000 }); // 아래 회차권 등록(만료 상태) → 빠른 기록의 [만료일 연장]에 쓴다

  // ── 고객: 추가 창, 상세 오버레이, 회차권 등록·시술 기록(+관리 창 겹침)·상담 기록 창 ──
  await page.goto('/customers');
  await step('m/customers 고객 추가', async () => {
    await vis('고객 추가').click();
    await expect(dialog('고객 추가')).toBeVisible();
  });
  await cancel();
  await step('m/customers 세그먼트 만들기', async () => { // 저장 세그먼트 편집 창 — 모바일 폭 (166·168)
    await vis('+ 세그먼트').click();
    await expect(dialog('세그먼트 만들기')).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(dialog('세그먼트 만들기')).toHaveCount(0);
  await step('m/customers 상세 오버레이', async () => {
    await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('기본 정보').filter({ visible: true }).first()).toBeVisible();
  });
  await step('m/customers 회차권 등록', async () => {
    await vis('회차권 등록').click();
    await expect(page.getByRole('heading', { name: '회차권 등록' }).filter({ visible: true }).first()).toBeVisible();
    await dialog('회차권 등록').getByLabel('프로그램 선택').selectOption({ label: '접근성 10회권 — 100,000원' });
    await dialog('회차권 등록').getByLabel('구매 날짜').fill('2025-01-01'); // 만료 상태로
  });
  await dialog('회차권 등록').getByRole('button', { name: '회차권 등록' }).click();
  await expect(dialog('회차권 등록')).toHaveCount(0);
  await step('m/customers 시술 기록', async () => {
    await vis('시술 기록').click();
    await expect(page.getByRole('heading', { name: '시술 기록 추가' }).filter({ visible: true }).first()).toBeVisible();
  });
  // 창 위의 창 — 관리 창(elevated Modal)이 빠른 기록 창 위에서 포인터를 받아야 한다(scan의 dialog-covered 검사, ㊿)
  await step('m/customers 빠른 기록 → 만료일 연장(관리 창 겹침)', async () => {
    await page.getByTestId('expired-program-hint').getByRole('button', { name: '만료일 연장' }).click();
    await expect(dialog('프로그램 관리')).toBeVisible();
  });
  await cancel(); // 프로그램 관리
  await cancel(); // 시술 기록 추가
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
  await dialog('재고 입고·조정').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog('재고 입고·조정')).toHaveCount(0);
  await step('m/products 발주 제안 (248)', async () => {
    await page.getByTestId('reorder-open').click();
    await expect(dialog('발주 제안')).toBeVisible();
  });
  await dialog('발주 제안').getByRole('button', { name: '닫기', exact: true }).first().click();
  await expect(dialog('발주 제안')).toHaveCount(0);
  await step('m/products 재고 실사 (245)', async () => {
    await page.getByTestId('stock-count-open').click();
    await expect(dialog('재고 실사')).toBeVisible();
  });
  await dialog('재고 실사').getByRole('button', { name: '닫기', exact: true }).first().click(); // X 버튼과 바닥 [닫기] 둘 다 있다
  await expect(dialog('재고 실사')).toHaveCount(0);

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
  await dialog('지출(매입) 등록').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog('지출(매입) 등록')).toHaveCount(0);

  // ── 중복 결제 경고 창(264)·지표 근거 보기 창(260) — 폰 폭에서 글이 넘치지 않는지 ──
  await registerPayment(page, acc, 90000);
  await step('m/sales 중복 결제 경고 (264)', async () => {
    await vis('결제 등록').click();
    const pay = dialog('결제 등록');
    await pickCustomer(page, acc.customer, pay);
    await pay.getByLabel('결제 금액').fill('90000');
    await pay.getByRole('button', { name: '결제 등록' }).click();
    await expect(dialog('같은 금액 결제가 이미 있습니다')).toBeVisible();
  });
  await dialog('같은 금액 결제가 이미 있습니다').getByRole('button', { name: '취소하고 확인' }).click();
  await dialog('결제 등록').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog('결제 등록')).toHaveCount(0);
  await step('m/sales 지표 근거 보기 (260)', async () => {
    await page.getByTestId('metric-new-share-open').click();
    await expect(page.getByTestId('metric-detail')).toBeVisible();
  });
  await page.getByTestId('metric-detail').getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('metric-detail')).toHaveCount(0);

  // ── 발송 성과 근거 창 (263) — 폰 폭에서 줄이 넘치지 않는지 (266, 리뷰 L-8) ──
  await page.goto('/messaging');
  const perfBtn = page.getByTestId('history-perf').first();
  if (await perfBtn.count() > 0) {
    await perfBtn.click();
    await page.getByTestId('history-perf-rows').first().click();
    await step('m/messaging 성과 근거 (263)', async () => {
      await expect(page.getByTestId('metric-detail')).toBeVisible();
    });
    await page.getByTestId('metric-detail').getByRole('button', { name: '닫기' }).click();
  }

  // ── 태그 목록 관리 창 (237·239) — 고객 추가 창 위에 겹쳐 열린다 ──
  await page.goto('/customers');
  await step('m/customers 태그 목록 관리', async () => {
    await vis('고객 추가').click();
    await page.getByTestId('tag-master-open').click();
    await expect(dialog('태그 목록 관리')).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(dialog('태그 목록 관리')).toHaveCount(0);

  // ── 직원·문자 ──
  await page.goto('/staff');
  await step('m/staff 인센티브 비율 패널', async () => { // 233·238 — 표 안쪽 입력칸이 폰 폭에서 넘치지 않아야 한다
    await page.getByTestId('staff-performance').getByRole('button', { name: '인센티브 비율' }).click();
    await expect(page.getByTestId('commission-panel')).toBeVisible();
  });
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
  await step('m/messaging 캠페인 추가', async () => { // 자동 발송 캠페인 정의 창 — 모바일 폭 (156·168)
    await vis('캠페인 추가').click();
    await expect(dialog('캠페인 추가')).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(dialog('캠페인 추가')).toHaveCount(0);
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

  // ── 289: 폰 아래 탭의 [더보기] 시트 — 어느 접근성 게이트도 열지 않던 창이다(폰에만 있다).
  // 창이 열려 있는 자리에서는 누를 수 없다(아래 탭이 오버레이에 덮인다) — 그래서 설정 탭을 다 돈 뒤에 둔다.
  await step('m 더보기 메뉴', async () => {
    await page.getByRole('button', { name: '더보기 메뉴 열기' }).click({ timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: '더보기 메뉴' })).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '더보기 메뉴' })).toHaveCount(0);

  assertNoBlocking(rows);
});
