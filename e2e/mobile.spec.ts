import { test, expect, type Page } from '@playwright/test';
import { BRANCH_ROUTES } from './helpers';

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

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${label}: 가로 스크롤 발생 (scrollWidth ${scrollWidth} > viewport ${clientWidth})`).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe.configure({ mode: 'serial' });

test('모바일 폭에서 가입·온보딩·핵심 화면이 가로 넘침 없이 동작한다', async ({ page }) => {
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
  expect(page.url()).toContain('/customers?new=1');
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
  await page.getByPlaceholder('010-0000-0000').fill('010-9999-0001');
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

  // 결제 등록 → 매출 모바일 카드 목록에 표시
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).filter({ visible: true }).first().click();
  const payForm = page.locator('form').filter({ hasText: '결제 구분' });
  await payForm.locator('select').first().selectOption({ index: 1 });
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
  await expectNoHorizontalOverflow(page, '고객 상세');
  // 시술 기록·프로그램 등록 모달이 모바일에서도 열린다 (2026-11-17)
  await page.getByRole('button', { name: '시술 기록', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: '시술 기록' }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '시술 기록 모달');
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: '프로그램 등록', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: '프로그램 등록' }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '프로그램 등록 모달');
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();

  // 피부 상담 입력이 모바일에서도 열린다 (2026-11-17)
  await page.getByRole('button', { name: '상담 기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^피부 상담/ }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '피부 상담 모달');
  await page.getByRole('button', { name: '취소', exact: true }).filter({ visible: true }).first().click();

  // 고객 정보 수정이 모바일에서도 된다 (2026-11-17)
  await page.getByRole('button', { name: '고객 정보 수정' }).click();
  const memoField = page.getByPlaceholder('특이사항, 알레르기 등').filter({ visible: true }).first();
  await memoField.fill('모바일에서 수정');
  await page.getByRole('button', { name: '저장', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('모바일에서 수정').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
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
  await page.getByRole('button', { name: '예약 추가' }).filter({ visible: true }).first().click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click();
  const resvCard = page.getByText('모바일고객').filter({ visible: true }).first();
  await expect(resvCard).toBeVisible({ timeout: 10_000 });
  await resvCard.click();
  await expect(page.getByText('예약 상세').filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '예약 상세');
  await page.keyboard.press('Escape');

  // 더보기 탭(설정 등 진입점)이 하단 탭바에 있다
  const more = page.getByRole('button', { name: '더보기 메뉴 열기' }).filter({ visible: true }).first();
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.getByRole('link', { name: /설정/ }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '더보기 시트');
});
