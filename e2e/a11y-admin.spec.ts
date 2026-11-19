import { test } from '@playwright/test';
import { makeAccount, signupAndOnboard, becomeSuperadmin } from './helpers';
import { scan, assertNoBlocking, type Row } from './a11y-shared';

/**
 * 본사 어드민 콘솔 접근성 게이트 (axe-core, WCAG 2.1 A/AA, 2026-11-19 ㉝) — 다크 테마라 지점 화면과 색 조합이 전혀 달라 따로 본다.
 * 로컬 모드에는 슈퍼어드민 계정이 없어 세션 역할을 바꿔 진입한다(routes.spec과 같은 방식). 백엔드 미연결 상태의 화면이라
 * 표는 비어 있을 수 있지만 레이아웃·헤더·필터·내비게이션의 대비와 이름은 그대로 검사된다.
 */

const ADMIN_ROUTES = [
  '/admin/dashboard', '/admin/branches', '/admin/users', '/admin/subscriptions',
  '/admin/announcements', '/admin/statistics', '/admin/features', '/admin/login-logs',
];

const acc = makeAccount('AA');

test('어드민 콘솔 화면 전부에 serious·critical 접근성 위반이 없다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];

  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');
  await scan(page, '/admin/login', rows);

  await signupAndOnboard(page, acc);
  await becomeSuperadmin(page);
  for (const route of ADMIN_ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await scan(page, route, rows);
  }
  assertNoBlocking(rows);
});
