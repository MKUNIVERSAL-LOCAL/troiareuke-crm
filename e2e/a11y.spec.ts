import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { makeAccount, signupAndOnboard, createCustomer, BRANCH_ROUTES } from './helpers';

/**
 * 접근성 자동 점검 (axe-core, WCAG 2.1 A/AA) — 지점 화면 전부 + 로그인 화면.
 * serious·critical 위반이 하나라도 있으면 실패한다 (UI 품질 절대 기준: 쓰기 편한 UI는 키보드·스크린리더로도 막힘이 없어야 한다, 2026-11-18).
 * A11Y_OUT=<경로> 를 주면 전체 위반(minor·moderate 포함)을 JSON으로 남긴다 — 다음 정리 묶음의 입력.
 */

const acc = makeAccount('AX');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type ViolationNode = { target: string; html: string; detail: string };
type Row = { route: string; id: string; impact: string; help: string; nodes: ViolationNode[] };

async function scan(page: import('@playwright/test').Page, route: string, out: Row[]) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of r.violations) {
    out.push({
      route, id: v.id, impact: v.impact ?? 'n/a', help: v.help,
      nodes: v.nodes.slice(0, 8).map(n => {
        const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string } | undefined;
        // color-contrast면 전경/배경/실측 대비, 그 외는 axe 요약 — 고칠 때 바로 쓰는 정보
        const detail = d?.contrastRatio ? `${d.fgColor} on ${d.bgColor} = ${d.contrastRatio} (need ${d.expectedContrastRatio})` : (n.failureSummary ?? '').split('\n').slice(0, 2).join(' ');
        return { target: n.target.join(' '), html: n.html.slice(0, 160), detail };
      }),
    });
  }
}

test('지점 화면 전부에 serious·critical 접근성 위반이 없다', async ({ page }) => {
  test.slow(); // 가입·온보딩 + 13회 axe 분석 ≈ 40s — CI 여유
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await scan(page, '/login', rows);

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  for (const route of BRANCH_ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await scan(page, route, rows);
  }

  if (process.env.A11Y_OUT) writeFileSync(process.env.A11Y_OUT, JSON.stringify(rows, null, 2));
  const blocking = rows.filter(r => r.impact === 'serious' || r.impact === 'critical');
  const summary = blocking.map(r => `${r.route} [${r.impact}] ${r.id}: ${r.help}\n    ${r.nodes.map(n => `${n.target} — ${n.detail}`).join('\n    ')}`).join('\n');
  expect(blocking, `serious/critical 위반 ${blocking.length}건:\n${summary}`).toEqual([]);
});
