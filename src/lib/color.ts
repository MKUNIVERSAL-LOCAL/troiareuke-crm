// ═══════════════════════════════════════════════════════════════
// color — 배경색에 따라 읽히는 글자색 고르기 (비코어, 2026-11-19)
// ───────────────────────────────────────────────────────────────
// 직원 색은 팔레트 밖 값(구버전 데이터·임의 지정)도 올 수 있어 "항상 흰 글자"는 밝은 색(초록·노랑) 위에서 2~3:1로 떨어진다.
// WCAG 대비 공식으로 흰색과 검정 중 대비가 더 높은 쪽을 고른다 — 기본 팔레트(500 계열)는 전부 검정 쪽이 4.7:1 이상, 흰색은 2~3.7:1.
// (리뷰 2026-11-19: "흰색이 4.5를 넘기면 흰색" 규칙은 팔레트 전체가 미달이라 사실상 항상 진한 글자였고, slate-900은 #8B5CF6 위에서 4.22로 AA 미달)
// ═══════════════════════════════════════════════════════════════

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** #rgb·#rrggbb → 상대 휘도(0~1). 형식이 아니면 null */
function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 두 색의 WCAG 대비(1~21). 형식이 틀리면 1 */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  if (la === null || lb === null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT = '#000000';
const LIGHT_TEXT = '#ffffff';

/** 배경 hex 위에 올릴 글자색 — 흰색·검정 중 대비가 높은 쪽 (형식이 틀리면 둘 다 1이라 검정) */
export function readableTextOn(bgHex: string): string {
  return contrastRatio(LIGHT_TEXT, bgHex) >= contrastRatio(DARK_TEXT, bgHex) ? LIGHT_TEXT : DARK_TEXT;
}
