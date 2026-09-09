import { test, expect, type Page } from '@playwright/test';

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

  // 탭바에 없는 화면(매출·설정)도 직접 진입해 확인
  for (const route of ['/sales', '/settings', '/products']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page, route);
  }

  // 고객 화면(모바일 전용 패널)의 검색창이 화면 안에 있고 입력 가능하다
  // (1차 모바일 범위 D2: 고객 조회·상담 — 고객 신규 등록은 PC. docs/MOBILE-APP-PLAN.md)
  await page.goto('/customers');
  const search = page.getByPlaceholder('고객명, 전화번호 검색').filter({ visible: true }).first();
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box && box.x >= 0 && box.x + box.width <= vw, '고객 검색창이 화면 밖').toBeTruthy();
  await search.fill('테스트');
  await expectNoHorizontalOverflow(page, '고객 검색');

  // 더보기 탭(설정 등 진입점)이 하단 탭바에 있다
  const more = page.getByRole('button', { name: '더보기 메뉴 열기' }).filter({ visible: true }).first();
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.getByRole('link', { name: /설정/ }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '더보기 시트');
});
