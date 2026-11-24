import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, becomeSuperadmin, BRANCH_ROUTES } from './helpers';

/**
 * 전 화면 순회 안전망 (로컬 모드 빌드)
 * 지점 화면 라우트를 전부 열어 (1) 페이지 자체 예외(pageerror) (2) 콘솔 error (3) 빈 화면(루트 비어 있음)이
 * 없는지 확인한다. 특정 기능 흐름이 아니라 "어느 화면도 조용히 깨져 있지 않다"를 릴리스마다 보장한다.
 */

const acc = makeAccount('RT');

// 본사 어드민 콘솔 — 로컬 모드에는 슈퍼어드민 계정이 없어 세션 역할을 바꿔 진입한다 (화면 렌더 안전망 목적)
const ADMIN_ROUTES = [
  '/admin/dashboard', '/admin/branches', '/admin/users', '/admin/subscriptions', '/admin/subscriptions?view=ai',
  '/admin/announcements', '/admin/statistics', '/admin/features', '/admin/login-logs',
];


// 실제 결함이 아닌 알려진 소음 — 여기 추가할 때는 사유를 적는다
const IGNORED_CONSOLE = [
  /favicon/i,                       // 로컬 프리뷰 서버의 favicon 404
  /Download the React DevTools/i,   // React 개발 안내
  /net::ERR_|Failed to load resource/i, // 외부 리소스(폰트 CDN 등) 차단 — 로컬 모드 기능과 무관
];

test('지점 화면 전부가 예외·콘솔 오류·빈 화면 없이 열린다', async ({ page }) => {
  page.on('dialog', d => d.accept());
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', e => pageErrors.push(`${page.url()} :: ${e.message}`));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some(re => re.test(text))) return;
    consoleErrors.push(`${page.url()} :: ${text}`);
  });

  // lazy 청크가 늦게 오면 networkidle 직후 루트가 잠깐 비어 있을 수 있다 — 1회 읽기 대신 재시도(expect 기본 타임아웃) (6워커 부하에서 어드민 로그인 기록 화면 오탐, 2026-11-19)
  const expectRendered = (route: string) =>
    expect.poll(async () => (await page.locator('#root').innerText()).trim().length, { message: `${route}: 화면이 비어 있음`, timeout: 15_000 }).toBeGreaterThan(0); // 6워커 부하에서 어드민 공지 화면이 기본 10초 안에 못 그려진 적 있음 (98)

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  for (const route of BRANCH_ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    // 화면이 실제로 렌더됐는지 — 루트에 보이는 텍스트가 있어야 한다
    await expectRendered(route);
  }

  // 어드민 콘솔도 같은 기준으로
  await becomeSuperadmin(page);
  for (const route of ADMIN_ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectRendered(route);
    expect(page.url(), `${route}: 어드민 화면으로 진입하지 못함`).toContain('/admin/');
  }

  expect(pageErrors, `페이지 예외:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `콘솔 오류:\n${consoleErrors.join('\n')}`).toEqual([]);
});
