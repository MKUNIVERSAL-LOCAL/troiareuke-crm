import { test, expect } from '@playwright/test';
import { BRANCH_ROUTES, solidPng, countPhotoEntries, pickCustomer, expectNoHorizontalOverflow } from './helpers';

/**
 * 모바일 최적화 게이트 — 스토어 앱과 같은 화면 폭(Pixel 7, 412×915)에서 핵심 화면이
 *  (1) 가로 스크롤 없이 렌더되고 (2) 하단 탭바로 이동 가능하며 (3) 주요 버튼이 화면 안에 있는지 확인한다.
 * 오너 원칙(2026-09-09): "업데이트마다 모바일 최적화는 무조건" → release:all의 test:e2e에 포함되어 실패 시 릴리스가 막힌다.
 * PC E2E(smoke.spec.ts)와 동일한 로컬 모드 빌드(dist-e2e)를 사용한다.
 */

const RUN = Date.now().toString().slice(-7);
const SHOP = `M샵${RUN}`;
const EMAIL = `m-${RUN}@smoke.test`;
const PASSWORD = 'smoke-pass-1234';

test.describe.configure({ mode: 'serial' });

test('모바일 폭에서 가입·온보딩·핵심 화면이 가로 넘침 없이 동작한다', async ({ page }) => {
  test.slow(); // 단독 ≈40s — 병렬 부하 여유 (2026-11-18)
  page.on('dialog', d => d.accept());

  await page.goto('/signup');
  await expectNoHorizontalOverflow(page, '가입');
  await page.getByPlaceholder('예: 아르케스파 강남점').fill(SHOP);
  await page.getByPlaceholder('example@email.com').fill(EMAIL);
  await page.getByPlaceholder('010-0000-0000').fill('010-1234-5678');
  await page.getByPlaceholder('123-45-67890').fill('1234567890');
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill(PASSWORD);
  await page.getByPlaceholder('비밀번호 재입력').fill(PASSWORD);
  await page.getByRole('button', { name: '다음 단계' }).click();
  await page.getByText('전체 동의', { exact: true }).click();
  await page.getByRole('button', { name: '무료 시작하기' }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });

  await expectNoHorizontalOverflow(page, '온보딩');
  await page.getByPlaceholder('예: 더마 에스테틱').fill(SHOP);
  await page.getByRole('button', { name: '피부관리실', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByPlaceholder('직원 1 이름').fill('김모바일');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '시술 항목 추가' }).click();
  await page.getByPlaceholder('시술명').fill('모바일관리');
  await page.getByPlaceholder('분', { exact: true }).fill('60');
  await page.getByPlaceholder('가격 (원)').fill('50000');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('설정 완료!')).toBeVisible();
  await page.getByRole('button', { name: '더마솔루션 시작하기' }).click();
  await page.waitForURL(url => !/\/onboarding/.test(url.pathname), { timeout: 20_000 });

  // 하단 탭바(모바일 전용)로 이동 — 각 화면 가로 넘침 검사
  const tabs: Array<[string, RegExp]> = [
    ['고객 관리로 이동', /\/customers$/],
    ['예약 관리로 이동', /\/reservations$/],
    ['시술 기록으로 이동', /\/treatments$/],
    ['홈으로 이동', /\/$/],
  ];
  for (const [aria, urlRe] of tabs) {
    const tab = page.getByRole('link', { name: aria }).filter({ visible: true }).first();
    await expect(tab, `하단 탭 "${aria}" 표시`).toBeVisible();
    await tab.click();
    await expect(page).toHaveURL(urlRe, { timeout: 10_000 });
    await expectNoHorizontalOverflow(page, aria);
  }

  // 홈 빠른 작업 → 고객 추가 모달이 바로 열린다 (2026-11-17)
  await page.goto('/');
  await page.getByRole('button', { name: '고객 추가' }).filter({ visible: true }).first().click();
  expect(page.url()).toContain('/customers'); // ?new=1 은 캡처 후 URL에서 제거됨 — 모달 노출로 검증
  await expect(page.getByRole('heading', { name: '고객 추가' }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();

  // 지점 화면 전부를 모바일 폭으로 열어 가로 넘침 검사 (2026-11-17: 탭바 밖 화면 포함 전수)
  for (const route of BRANCH_ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page, route);
  }

  // 고객 화면(모바일 전용 패널)의 검색창이 화면 안에 있고 입력 가능하다
  await page.goto('/customers');
  const search = page.getByPlaceholder('고객명, 전화번호 검색').filter({ visible: true }).first();
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box && box.x >= 0 && box.x + box.width <= vw, '고객 검색창이 화면 밖').toBeTruthy();
  await search.fill('테스트');
  await expectNoHorizontalOverflow(page, '고객 검색');

  // 고객 신규 등록이 모바일에서도 된다 (2026-11-17 — 스토어 제출 전 "PC에서 추가" 제한 해제)
  await search.fill('');
  await page.getByRole('button', { name: '고객 추가' }).filter({ visible: true }).first().click();
  await expectNoHorizontalOverflow(page, '고객 추가 모달');
  await page.getByPlaceholder('홍길동').fill('모바일고객');
  await page.getByPlaceholder('010-0000-0000').fill('01099990001'); // 숫자만 → 자동 하이픈
  await expect(page.getByPlaceholder('010-0000-0000').filter({ visible: true }).first()).toHaveValue('010-9999-0001');
  await page.getByText('[필수] 개인정보 수집·이용 동의').click();
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByText('모바일고객').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

  // 제품 등록 → 모바일 카드 목록에 표시 (표 대신 카드, 2026-11-17)
  await page.goto('/products');
  await page.getByRole('button', { name: '제품 추가' }).filter({ visible: true }).first().click();
  await page.getByPlaceholder('제품명 입력').fill('모바일세럼');
  await page.getByPlaceholder('0').nth(0).fill('30000'); // 판매가
  await page.getByPlaceholder('0').nth(2).fill('10');    // 재고
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const productCards = page.getByTestId('products-mobile-list');
  await expect(productCards).toBeVisible({ timeout: 10_000 });
  await expect(productCards.getByText('모바일세럼')).toBeVisible();
  await expectNoHorizontalOverflow(page, '제품 카드 목록');
  // 재고 입고 — 5개 입고(매입 단가 10,000원)하면 재고 15, 지출 원장에 제품 매입 50,000원 (2026-11-18)
  await productCards.getByRole('button', { name: '모바일세럼 입고·조정' }).click();
  const stockDialog = page.getByRole('dialog', { name: '재고 입고·조정' });
  await stockDialog.getByLabel('입고 수량').fill('5');
  await stockDialog.getByLabel('매입 단가').fill('10000');
  await stockDialog.getByRole('button', { name: '입고 저장' }).click();
  await expect(stockDialog).toHaveCount(0);
  await expect(productCards.getByText('재고 15개', { exact: true })).toBeVisible();
  const purchaseExpense = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_expenses$/.test(k))!;
    return JSON.parse(localStorage.getItem(key) || '[]').find((e: { category: string; description: string }) => e.category === '제품 매입' && e.description.includes('모바일세럼'));
  });
  expect(purchaseExpense?.amount).toBe(50000);
  expect(purchaseExpense?.description).toContain('모바일세럼 5개 입고');

  // 결제 등록 → 매출 모바일 카드 목록에 표시
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).filter({ visible: true }).first().click();
  const payForm = page.locator('form').filter({ hasText: '구분 (매출/환불)' });
  await pickCustomer(page, '모바일고객', payForm);
  await payForm.getByPlaceholder('0').first().fill('50000');
  await payForm.getByRole('button', { name: '결제 등록' }).click();
  await page.getByRole('button', { name: /결제 내역/ }).filter({ visible: true }).first().click();
  const salesCards = page.getByTestId('sales-mobile-list');
  await expect(salesCards).toBeVisible({ timeout: 10_000 });
  await expect(salesCards.getByText('50,000').first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '매출 카드 목록');

  // 고객 상세(모바일 풀스크린)에 기본 정보·최근 시술 기록이 보인다
  await page.goto('/customers');
  await page.getByText('모바일고객').filter({ visible: true }).first().click();
  await expect(page.getByText('기본 정보').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('최근 시술 기록').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('다음 방문 권장').filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '고객 상세');
  // 시술 기록·회차권 등록 모달이 모바일에서도 열린다 (2026-11-17)
  await page.getByRole('button', { name: '시술 기록', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: '시술 기록' }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '시술 기록 모달');
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: '회차권 등록', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: '회차권 등록' }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '회차권 등록 모달');
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();

  // 피부 상담 입력이 모바일에서도 열린다 (2026-11-17)
  await page.getByRole('button', { name: '상담 기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^피부 상담/ }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '피부 상담 모달');
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();

  // 시술 기록 화면에서 사진 1장 첨부 → 고객 상세 최근 시술 기록 썸네일 → 크게 보기 (모바일도 PC와 동일, 2026-11-17)
  await page.goto('/treatments?new=1');
  await pickCustomer(page);
  // 촬영 가이드 카메라(getUserMedia 가짜 장치) → 촬영 → 사진 1장 (2026-11-17)
  await page.getByRole('button', { name: '카메라로 촬영' }).click();
  const camera = page.getByRole('dialog', { name: '카메라 촬영' });
  await expect(camera).toBeVisible();
  await expectNoHorizontalOverflow(page, '카메라 촬영');
  await expect(camera.getByRole('button', { name: '촬영' })).toBeEnabled({ timeout: 10_000 });
  await camera.getByRole('button', { name: '촬영' }).click();
  await expect(camera).toBeHidden();
  await expect(page.getByLabel('시술 전후 구분')).toHaveCount(1);
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: solidPng(48, [200, 150, 150]) });
  await expect(page.getByLabel('시술 전후 구분')).toHaveCount(2);
  await page.getByRole('button', { name: '저장', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('사진 2장').filter({ visible: true }).first()).toBeVisible(); // 목록 장수(localStorage 장수 목록, 2026-11-18)
  await expect.poll(() => countPhotoEntries(page), { timeout: 10_000 }).toBeGreaterThan(0); // IDB 커밋 후 이동
  await page.goto('/customers');
  await page.getByText('모바일고객').filter({ visible: true }).first().click();
  const treatThumb = page.getByRole('button', { name: '시술 사진 크게 보기' }).filter({ visible: true });
  await expect(treatThumb.first()).toBeVisible({ timeout: 10_000 });
  await treatThumb.first().click();
  await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeVisible();
  await expectNoHorizontalOverflow(page, '사진 크게 보기');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '사진 크게 보기' })).toBeHidden();

  // 앱 잠금(PIN) — 설정 > 백업·보안 탭에서 켜고, 화면 이탈/복귀를 흉내 내면 잠금 화면이 뜨고 PIN으로 풀린다 (2026-11-18)
  await page.goto('/settings');
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  const lockCard = page.getByTestId('app-lock-card');
  await lockCard.getByLabel('새 PIN').fill('2580');
  await lockCard.getByLabel('PIN 확인').fill('2580');
  await lockCard.getByLabel('잠금 대기 시간').selectOption('0');
  await lockCard.getByRole('button', { name: '잠금 켜기' }).click();
  await expect(lockCard.getByText(/사용 중 · 즉시/)).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const lock = page.getByTestId('app-lock');
  await expect(lock).toBeVisible();
  await expectNoHorizontalOverflow(page, '앱 잠금');
  await lock.getByLabel('PIN').fill('0000');
  await lock.getByRole('button', { name: '확인' }).click();
  await expect(lock.getByRole('alert')).toContainText('PIN이 맞지 않습니다');
  await lock.getByLabel('PIN').fill('2580');
  await lock.getByRole('button', { name: '확인' }).click();
  await expect(lock).toBeHidden();
  // 새로고침·앱 재시작으로 우회되지 않는다 — PIN이 켜져 있으면 시작 때도 잠근다 (리뷰 2026-11-18)
  await page.reload();
  await expect(page.getByTestId('app-lock')).toBeVisible();
  await page.getByTestId('app-lock').getByLabel('PIN').fill('2580');
  await page.getByTestId('app-lock').getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('app-lock')).toBeHidden();
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  await lockCard.getByLabel('현재 PIN').fill('2580');
  await lockCard.getByRole('button', { name: '잠금 끄기' }).click();
  await expect(lockCard.getByText('사용 안 함')).toBeVisible();
  // 고객 프로그램 [관리]가 모바일 상세(fixed 오버레이) 위에서도 열린다 (2026-11-18)
  await page.evaluate(() => {
    const customersKey = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    const customer = JSON.parse(localStorage.getItem(customersKey) || '[]').find((c: { name: string }) => c.name === '모바일고객');
    const key = customersKey.replace(/_customers$/, '_customer_programs');
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const now = new Date().toISOString();
    list.push({ id: 'seed_cp_' + Date.now(), shopId: customer.shopId, customerId: customer.id, customerName: customer.name, programName: '모바일 5회권', category: '회차권', totalSessions: 5, usedSessions: 1, pricePaid: 100000, paymentMethod: '카드', purchaseDate: now.slice(0, 10), isCompleted: false, createdAt: now });
    localStorage.setItem(key, JSON.stringify(list));
  });
  await page.goto('/customers');
  await page.getByText('모바일고객').filter({ visible: true }).first().click();
  await page.getByRole('button', { name: '모바일 5회권 관리' }).click();
  const manage = page.getByRole('dialog', { name: '프로그램 관리' });
  await expect(manage).toBeVisible();
  await manage.getByRole('button', { name: '+30일' }).click();
  await manage.getByRole('button', { name: '저장', exact: true }).click();
  await expect(manage).toBeHidden();
  await expect(page.getByText(/만료일 \d{4}\.\d{2}\.\d{2}/).filter({ visible: true }).first()).toBeVisible();

  // 고객 정보 수정이 모바일에서도 된다 (2026-11-17) — 헤더 [⋯] 메뉴 안 (7차 UX 점검 99)
  await page.getByRole('button', { name: '고객 관리 더보기' }).click();
  await page.getByRole('menuitem', { name: '고객 정보 수정' }).click();
  const memoField = page.getByPlaceholder('특이사항 (알레르기는 위 칸에)').filter({ visible: true }).first();
  await memoField.fill('모바일에서 수정');
  await page.getByRole('textbox', { name: '태그' }).filter({ visible: true }).first().fill('민감성, #재구매'); // 고객 태그 (2026-11-18) — #은 벗겨진다
  await page.getByRole('textbox', { name: '알레르기' }).filter({ visible: true }).first().fill('레티놀 자극'); // 알레르기 입력 (2026-11-18)
  await page.getByRole('button', { name: '저장', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('모바일에서 수정').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('customer-tags').filter({ visible: true }).first()).toContainText('#민감성');
  await expect(page.getByTestId('allergy-row').filter({ visible: true }).first()).toContainText('레티놀 자극');
  // 목록 태그 칩으로 걸러진다
  await page.getByRole('button', { name: '뒤로가기' }).click();
  const tagChip = page.getByTestId('tag-filter').filter({ visible: true }).first().getByRole('button', { name: /^#재구매/ });
  await tagChip.click();
  await expect(tagChip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('모바일고객').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('테스트').filter({ visible: true })).toHaveCount(0); // 태그 없는 고객은 빠진다 — 검색어 '테스트'로 만든 고객이 없으므로 0, 칩 해제 뒤 목록 복귀
  await tagChip.click();
  await expect(tagChip).toHaveAttribute('aria-pressed', 'false');
  await page.getByText('모바일고객').filter({ visible: true }).first().click();
  // 빠른 메모 — 수정 모달 없이 날짜가 붙는 한 줄 추가 (2026-11-18)
  await page.getByLabel('빠른 메모').filter({ visible: true }).first().fill('저자극 제품 선호');
  await page.getByRole('button', { name: '메모 추가' }).filter({ visible: true }).first().click();
  await expect(page.getByText(/\[\d{4}-\d{2}-\d{2}\] 저자극 제품 선호/).filter({ visible: true }).first()).toBeVisible();
  // 모바일 상세에도 삭제·익명화가 있다 (PC 동등성 감사 2026-11-18) — 헤더 [⋯] 메뉴 안, 뒤 단계가 이 고객을 쓰므로 존재만 확인
  await page.getByRole('button', { name: '고객 관리 더보기' }).click();
  const mobileMore = page.getByRole('menu', { name: '고객 관리 더보기' });
  await expect(mobileMore.getByRole('menuitem', { name: '고객 삭제' })).toBeVisible();
  await expect(mobileMore.getByRole('menuitem', { name: '고객 익명화' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(mobileMore).toHaveCount(0);
  await expect(page.getByText('삭제·익명화는 PC에서')).toHaveCount(0);
  // 하단 고정 액션바에서 [예약 추가] → 예약 화면 → 뒤로가기 → 같은 고객 상세가 다시 열린다 (7차 UX 점검 99 — 전에는 목록으로 떨어졌다)
  await page.getByRole('button', { name: '예약 추가', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog', { name: '예약 추가' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: '고객 관리 더보기' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: '시술 기록', exact: true }).filter({ visible: true }).first()).toBeVisible();

  // 활동 타임라인(모바일 compact) — 예약·결제가 한 줄기에 보인다 (2026-11-18)
  const mobileTimeline = page.getByTestId('customer-timeline').filter({ visible: true }).first();
  await mobileTimeline.scrollIntoViewIfNeeded();
  await expect(mobileTimeline).toContainText('활동 타임라인');
  await expect(mobileTimeline.getByRole('listitem').first()).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기' }).click();

  // 설정 화면: 모바일에서 탭 칩이 가로로 쌓이고 입력란이 화면 안에 있다
  await page.goto('/settings');
  const saveBtn = page.getByRole('button', { name: '저장하기' }).filter({ visible: true }).first();
  await expect(saveBtn).toBeVisible();
  const saveBox = await saveBtn.boundingBox();
  expect(saveBox && saveBox.x >= 0 && saveBox.x + saveBox.width <= vw, '설정 저장 버튼이 화면 밖').toBeTruthy();
  await expectNoHorizontalOverflow(page, '설정 샵 정보');

  // 예약 등록 → 모바일 카드 → 상세 모달 (2026-11-17)
  await page.goto('/reservations');
  // 모바일 예약 '이번달' 탭에서 다음 달로 이동할 수 있다 (2026-11-18) — 다음 달 예약을 모바일에서도 찾게
  await page.getByRole('button', { name: '이번달', exact: true }).click();
  const monthNav = page.getByTestId('mobile-month-nav');
  const thisMonthLabel = await page.getByTestId('mobile-month-label').innerText();
  await monthNav.getByRole('button', { name: '다음 달' }).click();
  expect(await page.getByTestId('mobile-month-label').innerText()).not.toBe(thisMonthLabel);
  await monthNav.getByRole('button', { name: '이전 달' }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '예약 추가' }).filter({ visible: true }).first().click();
  await pickCustomer(page);
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click();
  const resvCard = page.getByText('모바일고객').filter({ visible: true }).first();
  await expect(resvCard).toBeVisible({ timeout: 10_000 });
  await resvCard.click();
  await expect(page.getByText('예약 상세').filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '예약 상세');
  // 완료처리 → 결제 등록 모달 → 매출 반영 (2026-11-17)
  await page.getByRole('button', { name: '완료처리' }).click();
  await expect(page.getByRole('heading', { name: '결제 등록' }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '완료 결제 모달');
  await page.getByRole('button', { name: '결제 등록', exact: true }).click();
  await page.goto('/sales');
  await page.getByRole('button', { name: /결제 내역/ }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('sales-mobile-list').getByText('50,000').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: '결제 내역 (2)' }).filter({ visible: true }).first()).toBeVisible();

  // 홈 오늘 예약 항목 → 예약 상세 딥링크 (2026-11-17)
  await page.goto('/');
  await page.getByText('모바일고객').filter({ visible: true }).first().click();
  await expect(page.getByText('예약 상세').filter({ visible: true }).first()).toBeVisible();
  // 예약 상세 [시술 기록 작성] → 고객·시술 항목이 채워진 시술 기록 창 (2026-11-17)
  await page.getByRole('button', { name: '시술 기록 작성' }).click();
  await expect(page).toHaveURL(/\/treatments/); // 프리필 파라미터는 캡처 후 URL에서 제거됨
  await expect(page.getByRole('combobox', { name: '고객' }).filter({ visible: true }).first()).toHaveValue(/모바일고객/); // 프리필된 고객
  await expect(page.locator('input[type="checkbox"]:checked')).not.toHaveCount(0);
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();
  await page.goto('/');
  await page.getByText('모바일고객').filter({ visible: true }).first().click();
  await expect(page.getByText('예약 상세').filter({ visible: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // 더보기 탭(설정 등 진입점)이 하단 탭바에 있다
  const more = page.getByRole('button', { name: '더보기 메뉴 열기' }).filter({ visible: true }).first();
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.getByRole('link', { name: /설정/ }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '더보기 시트');
});
