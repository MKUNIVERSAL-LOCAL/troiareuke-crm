import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';

/**
 * 전 화면 순회 안전망 (로컬 모드 빌드)
 * 지점 화면 라우트를 전부 열어 (1) 페이지 자체 예외(pageerror) (2) 콘솔 error (3) 빈 화면(루트 비어 있음)이
 * 없는지 확인한다. 특정 기능 흐름이 아니라 "어느 화면도 조용히 깨져 있지 않다"를 릴리스마다 보장한다.
 */

const acc = makeAccount('RT');

// 지점(비어드민) 화면 — App.tsx 선언 라우트 중 로그인 후 접근 가능한 것 전부
const BRANCH_ROUTES = [
  '/', '/customers', '/reservations', '/treatments', '/programs', '/products',
  '/sales', '/staff', '/messaging', '/settings', '/api-guide', '/ai-chat',
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

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  for (const route of BRANCH_ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    // 화면이 실제로 렌더됐는지 — 루트에 보이는 텍스트가 있어야 한다
    const text = (await page.locator('#root').innerText()).trim();
    expect(text.length, `${route}: 화면이 비어 있음`).toBeGreaterThan(0);
  }

  expect(pageErrors, `페이지 예외:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `콘솔 오류:\n${consoleErrors.join('\n')}`).toEqual([]);
});
