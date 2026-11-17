import { test } from '@playwright/test';
import path from 'node:path';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, solidPng } from './helpers';
import { becomeSuperadmin } from './helpers';

/**
 * 화면 스크린샷 세트 생성기 — 시각 QA·스토어 등록 스크린샷용. 기본 E2E에서는 건너뛴다.
 * 실행: SHOTS=1 npx playwright test e2e/screenshots.spec.ts [--project=mobile|chromium]
 * 출력: SHOTS_DIR(기본 test-results/shots)/<project>/<화면>.png
 * 로컬 모드 빌드(dist-e2e)에 고객·시술(사진 2장)·제품·결제를 심어 "데이터가 있는 상태"를 찍는다.
 */

const acc = makeAccount('SS');
const OUT = process.env.SHOTS_DIR || path.join('test-results', 'shots');

test.skip(!process.env.SHOTS, 'SHOTS=1 일 때만 실행');

test('주요 화면 스크린샷', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  page.on('dialog', d => d.accept());
  const dir = path.join(OUT, testInfo.project.name);
  const shot = (name: string) => page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });

  // 로그인·가입 화면 (세션 없을 때)
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await shot('auth-login');
  await page.goto('/signup');
  await page.waitForLoadState('networkidle');
  await shot('auth-signup');

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 시술 기록 + 사진 2장 (Before/After 카드가 보이도록)
  await page.goto('/treatments');
  await page.getByRole('button', { name: '시술 기록 추가' }).click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles([
    { name: 'before.png', mimeType: 'image/png', buffer: solidPng(64, [214, 150, 140]) },
    { name: 'after.png', mimeType: 'image/png', buffer: solidPng(64, [150, 200, 170]) },
  ]);
  await page.getByLabel('촬영 각도').nth(0).selectOption('front');
  await page.getByLabel('촬영 각도').nth(1).selectOption('front');
  await shot('treatment-form');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await dismissToasts(page);
  await shot('treatments');

  // 제품 + 결제
  await page.goto('/products');
  await page.getByRole('button', { name: '제품 추가' }).filter({ visible: true }).first().click();
  await page.getByPlaceholder('제품명 입력').fill('수분 세럼 30ml');
  await page.getByPlaceholder('0').nth(0).fill('48000');
  await page.getByPlaceholder('0').nth(1).fill('20000');
  await page.getByPlaceholder('0').nth(2).fill('12');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await dismissToasts(page);
  await shot('products');

  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).filter({ visible: true }).first().click();
  const payForm = page.locator('form').filter({ hasText: '결제 구분' });
  await payForm.locator('select').first().selectOption({ index: 1 });
  await payForm.getByPlaceholder('0').first().fill('120000');
  await payForm.getByRole('button', { name: '결제 등록' }).click();
  await dismissToasts(page);
  await shot('sales-overview');
  await page.getByRole('button', { name: /결제 내역/ }).filter({ visible: true }).first().click();
  await shot('sales-list');

  // 예약
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click();
  await dismissToasts(page);
  await shot('reservations');

  // 고객 상세 (Before/After 포함)
  await page.goto('/customers');
  await shot('customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await page.waitForTimeout(300);
  await shot('customer-detail');
  const compare = page.getByRole('button', { name: '비교 보기' });
  if (await compare.count()) {
    await compare.scrollIntoViewIfNeeded();
    await compare.click();
    await page.waitForTimeout(200);
    await shot('customer-before-after');
  }

  for (const [route, name] of [['/', 'dashboard'], ['/programs', 'programs'], ['/staff', 'staff'], ['/messaging', 'messaging'], ['/settings', 'settings']] as const) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await shot(name);
  }

  // 모달·탭 (레이아웃 QA용) — 실패해도 생성기는 계속
  const tryShot = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); await page.waitForTimeout(250); await shot(name); } catch (e) { console.warn('shot skipped', name, (e as Error).message); }
    await page.keyboard.press('Escape').catch(() => {});
  };
  await page.goto('/reservations');
  await tryShot('modal-reservation-add', () => page.getByRole('button', { name: '예약 추가' }).filter({ visible: true }).first().click());
  await page.goto('/customers');
  await tryShot('modal-customer-add', () => page.getByRole('button', { name: '고객 추가' }).filter({ visible: true }).first().click());
  // 고객 상세 전체(결제 내역·상담 이력까지) + 상담 모달(Before/After 첨부 블록) (2026-11-17)
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'customer-detail-full.png'), fullPage: true });
  // 모바일 상세는 내부 스크롤 컨테이너라 fullPage에 하단이 안 잡힌다 — 결제 내역까지 스크롤한 뷰포트 샷
  await tryShot('customer-detail-bottom', () => page.getByTestId('customer-payments').filter({ visible: true }).first().scrollIntoViewIfNeeded());
  await tryShot('modal-consult', async () => {
    await page.getByRole('button', { name: '상담 기록', exact: true }).filter({ visible: true }).first().click();
    const make = page.getByRole('button', { name: '비교 이미지 만들기' });
    if (await make.count()) { await make.click(); await page.getByAltText('비교 이미지 미리보기').waitFor({ timeout: 10_000 }); }
  });
  await page.goto('/programs');
  await tryShot('modal-program-add', () => page.getByRole('button', { name: '프로그램 추가' }).filter({ visible: true }).first().click());
  await page.goto('/staff');
  await tryShot('modal-staff-add', () => page.getByRole('button', { name: '직원 추가' }).filter({ visible: true }).first().click());
  await page.goto('/messaging');
  await tryShot('modal-message-send', () => page.getByRole('button', { name: '메시지 보내기' }).filter({ visible: true }).first().click());
  await page.goto('/treatments');
  await tryShot('modal-treatment-detail', () => page.getByText(acc.customer).filter({ visible: true }).first().click());
  await page.goto('/sales');
  await tryShot('modal-expense-add', () => page.getByRole('button', { name: '지출 등록' }).filter({ visible: true }).first().click());
  await page.goto('/messaging');
  await tryShot('messaging-templates', () => page.getByRole('button', { name: /템플릿 관리/ }).filter({ visible: true }).first().click());
  await page.goto('/messaging');
  await tryShot('messaging-history', () => page.getByRole('button', { name: /발송 이력/ }).filter({ visible: true }).first().click());
  await page.goto('/reservations');
  await tryShot('reservations-list', () => page.getByRole('button', { name: /목록|이번달/ }).filter({ visible: true }).first().click());
  await page.goto('/treatments');
  await tryShot('modal-treatment-edit', async () => { await page.getByText(acc.customer).filter({ visible: true }).first().click(); await page.getByRole('button', { name: '수정', exact: true }).filter({ visible: true }).first().click(); });
  for (const tab of ['영업시간', '연동 설정', '알림 설정', '시술 관리', '데이터 백업']) {
    await page.goto('/settings');
    await tryShot(`settings-${tab}`, () => page.getByRole('button', { name: tab, exact: true }).filter({ visible: true }).first().click());
  }

  // 본사 어드민 콘솔 (로컬 모드 폴백 화면)
  await becomeSuperadmin(page);
  for (const name of ['dashboard', 'branches', 'users', 'subscriptions', 'announcements', 'statistics', 'features', 'login-logs']) {
    await page.goto(`/admin/${name}`);
    await page.waitForLoadState('networkidle');
    await shot(`admin-${name}`);
  }
});
