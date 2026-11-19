import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { makeAccount, signupAndOnboard, createCustomer, BRANCH_ROUTES } from './helpers';

/**
 * 접근성 자동 점검 (axe-core, WCAG 2.1 A/AA) — 로그인 + 지점 화면 전부.
 * PC(a11y.spec)·모바일 폭(a11y-mobile.spec) 두 프로젝트가 같은 본문을 쓴다 — 스펙 파일은 제목·계정 접두사만 다르다.
 * serious·critical 위반이 하나라도 있으면 실패한다 (UI 품질 절대 기준: 쓰기 편한 UI는 키보드·스크린리더로도 막힘이 없어야 한다, 2026-11-18).
 * A11Y_OUT=<경로> 를 주면 전체 위반(minor·moderate 포함)을 JSON으로 남긴다 — 다음 정리 묶음의 입력.
 * 알려진 공백: 온보딩 화면은 가입 직후 1회만 지나가 별도 스캔하지 않는다(가입 헬퍼가 단계를 통과하므로 레이아웃은 mobile.spec의 가로 넘침 검사로 본다).
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type ViolationNode = { target: string; html: string; detail: string };
export type Row = { route: string; id: string; impact: string; help: string; nodes: ViolationNode[] };

/** 현재 화면을 axe로 분석해 위반을 out에 쌓는다 — 라우트 게이트(a11y.spec)와 모달 게이트(a11y-modals.spec)가 같은 기준을 쓴다 */
export async function scan(page: import('@playwright/test').Page, route: string, out: Row[]) {
  // 모달 열림 애니메이션(opacity 전환) 중엔 글자색이 배경과 섞여 측정돼 대비 위반이 오탐된다 — 끝날 때까지 기다린 뒤 분석
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
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

export function defineA11yGate(title: string, accountPrefix: string) {
  const acc = makeAccount(accountPrefix);
  test(title, async ({ page }) => {
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

    assertNoBlocking(rows);
  });
}

/** A11Y_OUT이 있으면 전체 위반을 JSON으로 남기고, serious·critical이 하나라도 있으면 실패 */
export function assertNoBlocking(rows: Row[]) {
  if (process.env.A11Y_OUT) writeFileSync(process.env.A11Y_OUT, JSON.stringify(rows, null, 2));
  const blocking = rows.filter(r => r.impact === 'serious' || r.impact === 'critical');
  const summary = blocking.map(r => `${r.route} [${r.impact}] ${r.id}: ${r.help}\n    ${r.nodes.map(n => `${n.target} — ${n.detail}`).join('\n    ')}`).join('\n');
  expect(blocking, `serious/critical 위반 ${blocking.length}건:\n${summary}`).toEqual([]);
}
