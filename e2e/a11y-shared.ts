import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { makeAccount, signupAndOnboard, createCustomer, BRANCH_ROUTES, expectNoHorizontalOverflow } from './helpers';

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
  // 무한 반복(animate-spin·pulse)은 finished가 영원히 안 끝나므로 제외하고, 어떤 경우에도 1.5초를 넘기지 않는다 (리뷰 2026-11-19)
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter(a => a.effect?.getTiming().iterations !== Infinity)
      .map(a => a.finished.catch(() => undefined))),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ]));
  // 가장 최근에 연 창이 실제로 포인터를 받는지 — z-index가 낮은 포털 창이 먼저 뜬 창 아래에 깔려 보이기만 하고 조작할 수 없던
  // 결함(㊾ HIGH: 빠른 시술 기록 z-[60] 위의 프로그램 관리 z-50)의 재발을 role=dialog인 창 전부에서 막는다 (2026-11-19 ㊿, 리뷰 반영 52).
  // "최근에 연 창" = 포커스를 가진 창(useFocusTrap이 새 창으로 포커스를 옮긴다 — 가려진 창도 포커스는 받으므로 그 창을 고르게 된다), 없으면 DOM 순서 마지막.
  // 찍는 점은 카드(.modal-card 또는 창 자체)와 뷰포트의 교집합 가운데, 포함 판정은 카드 기준(ui/Modal은 role=dialog가 배경 래퍼라 배경 div도 contains가 참이 된다).
  // 토스트(aria-live, 4초 뒤 사라짐)가 그 점에 있으면 가림으로 치지 않는다 — 모바일 바텀시트 가운데와 토스트 위치가 겹칠 수 있다.
  const covered = await page.evaluate(() => {
    const visible = (el: Element) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(visible);
    if (dialogs.length === 0) return null;
    // 안쪽 창(예약 상세 안의 결제 창처럼 DOM이 중첩된 경우)도 바깥 창이 activeElement를 포함하므로 뒤에서부터 찾는다 (리뷰 54)
    const top = [...dialogs].reverse().find(d => d.contains(document.activeElement)) ?? dialogs[dialogs.length - 1];
    const card = top.querySelector<HTMLElement>('.modal-card') ?? top;
    const b = card.getBoundingClientRect();
    const left = Math.max(b.left, 0), right = Math.min(b.right, window.innerWidth), topY = Math.max(b.top, 0), bottom = Math.min(b.bottom, window.innerHeight);
    if (right <= left || bottom <= topY) return null; // 카드가 뷰포트 밖 — 스크롤 상태라 판정 불가
    const hit = document.elementFromPoint((left + right) / 2, (topY + bottom) / 2);
    if (hit && (card.contains(hit) || hit.closest('[aria-live]'))) return null;
    const desc = hit ? `${hit.tagName.toLowerCase()}${hit.id ? '#' + hit.id : ''} .${String(hit.className).split(' ').filter(Boolean).slice(0, 4).join('.')}` : '(없음)';
    const byId = top.getAttribute('aria-labelledby');
    const label = top.getAttribute('aria-label') ?? (byId ? document.getElementById(byId)?.textContent?.trim() : null) ?? '(이름 없음)';
    return { label, hit: desc };
  });
  // 가려진 창은 다음 클릭이 3분 타임아웃으로 죽으므로 바로 분명한 메시지로 실패시킨다(기록용 행을 남겨도 던지는 순간 A11Y_OUT 저장 전이라 뜻이 없다)
  expect(covered, '가장 최근에 연 창 "' + (covered?.label ?? '') + '"의 가운데를 ' + (covered?.hit ?? '') + ' 이(가) 가림 — z-index/포털 순서를 확인').toBeNull();
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

/** opts.overflow — 모바일 폭 게이트에서 라우트마다 가로 넘침까지 함께 본다 (2026-11-19 ㊻) */
export function defineA11yGate(title: string, accountPrefix: string, opts: { overflow?: boolean } = {}) {
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
      if (opts.overflow) await expectNoHorizontalOverflow(page, route);
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

/**
 * 창을 여는 단계 — 못 열면 critical open-failed 행으로 남기고(조용히 건너뛰지 않음) 열렸으면 axe 분석.
 * axe 자체 실패는 그대로 던져 "창을 열지 못함"과 섞이지 않는다. PC·모바일 모달 게이트가 같은 함수를 쓴다.
 */
export function makeStep(page: Page, rows: Row[], afterOpen?: (label: string) => Promise<void>) {
  return async (label: string, open: () => Promise<void>) => {
    try {
      await open();
    } catch (e) {
      rows.push({ route: label, id: 'open-failed', impact: 'critical', help: `창을 열지 못함: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`, nodes: [] });
      return;
    }
    if (afterOpen) await afterOpen(label); // 예: 모바일 폭 가로 넘침 — 실패하면 그대로 던진다(열지 못한 것과 섞지 않음)
    await scan(page, label, rows);
  };
}

/** 설정 탭마다 그 탭에만 있는 요소 — 늦게 그려지는 탭을 반쯤 올라온 상태로 스캔하지 않게 (PC·모바일 공용) */
export const SETTINGS_TAB_READY: Record<string, (page: Page) => Locator> = {
  '영업시간': page => page.getByTestId('holidays-editor'),
  '연동 설정': page => page.getByRole('switch', { name: '상담 화면에 비컨 점수·AI 피부 분석 표시' }),
  'AI 서비스': page => page.getByTestId('ai-service-card'),
  '알림 설정': page => page.getByTestId('retention-policy-card'),
  '시술 관리': page => page.getByRole('button', { name: '시술 추가' }).first(),
  '백업·보안': page => page.getByTestId('backup-restore-card'),
};
