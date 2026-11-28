import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, becomeSuperadmin } from './helpers';
import { scan, assertNoBlocking, makeStep, type Row } from './a11y-shared';

/**
 * 본사 어드민 콘솔 접근성 게이트 (axe-core, WCAG 2.1 A/AA, 2026-11-19 ㉝) — 다크 테마라 지점 화면과 색 조합이 전혀 달라 따로 본다.
 * 로컬 모드에는 슈퍼어드민 계정이 없어 세션 역할을 바꿔 진입한다(routes.spec과 같은 방식). 백엔드 미연결 상태의 화면이라
 * 표는 비어 있을 수 있지만 레이아웃·헤더·필터·내비게이션의 대비와 이름은 그대로 검사된다.
 */

const ADMIN_ROUTES = [
  '/admin/dashboard', '/admin/branches', '/admin/users', '/admin/subscriptions', '/admin/subscriptions?view=ai',
  '/admin/announcements', '/admin/statistics', '/admin/statistics?view=data', '/admin/features', '/admin/login-logs',
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

  // 어드민 창(AdminDialog, 53): 지점 추가 창을 열어 놓고 분석 — role=dialog·이름·포커스 트랩에 더해 scan의 dialog-covered 검사도 받는다.
  // 다른 어드민 창은 **이 빌드(로컬 모드)에서는** 열 길이 없다(관리자 초대=인증 API 필요, 공지 작성=백엔드 필요, 구독·사용기간·신청 검토=서버 행 필요).
  // 322: 그 창들은 `e2e/a11y-admin-nas.spec.ts` 가 **흉내 서버 빌드**로 열어 axe 를 돌린다 — 조용히 건너뛰는 자리가 아니다.
  const step = makeStep(page, rows);
  await page.goto('/admin/branches');
  await step('/admin/branches 지점 추가', async () => {
    await page.getByRole('button', { name: '지점 추가' }).click();
    await expect(page.getByRole('dialog', { name: '새 지점 추가' })).toBeVisible();
  });
  // 입력 폼은 Esc로 닫지 않는다(지점 화면 폼과 같은 규칙, AdminDialog escape:false) — [취소]로 닫고 닫힘을 확인
  await page.getByRole('dialog', { name: '새 지점 추가' }).getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  assertNoBlocking(rows);
});
