// ═══════════════════════════════════════════════════════════════
// customerTags — 고객 태그 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// Customer.tags는 타입·저장소에 있었지만 화면에서 입력할 길이 없었다. 쉼표 구분 입력 → 정규화된 배열, 목록 필터·메시지 세그먼트용 집계.
// ═══════════════════════════════════════════════════════════════

import type { Customer } from '../types';

const MAX_TAG_LEN = 20;
const MAX_TAGS = 10;

/** "민감성, 재구매 , #vip" → ['민감성', '재구매', 'vip'] (앞 #·공백 제거, 중복 제거, 길이·개수 제한) */
export function parseTags(input: string | undefined | null): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const raw of input.split(/[,，\n]/)) {
    const t = raw.replace(/^#/, '').trim().slice(0, MAX_TAG_LEN);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** 사용 빈도순 태그 목록 — 필터 칩·세그먼트 카드용 */
export function topTags(customers: Customer[], limit = 12): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of customers) {
    if (c.isActive === false) continue;
    for (const t of c.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'))
    .slice(0, limit);
}
