// ═══════════════════════════════════════════════════════════════
// tagMasterRule — 자주 쓰는 태그 목록(태그 마스터) 규칙 (순수 모듈, 237, GAP C-1)
// ───────────────────────────────────────────────────────────────
// 왜: 태그를 매번 손으로 적어서 "민감성"·"민감"·"민감성피부" 가 따로 쌓였다. 그러면 태그 필터·세그먼트·발송 대상이
//     조용히 갈라진다(같은 뜻인데 다른 태그). 상용 CRM 은 태그를 미리 정의해 고르게 한다.
// 설계:
//   - 매장이 쓰는 태그 목록을 설정 행에 둔다. 고객 등록·수정 창에서 **눌러서 넣는다**(타이핑도 그대로 둔다).
//   - 동의 태그(광고동의…)는 마스터에 넣지 못한다 — 그건 동의 컨트롤이 관리하는 값이라 손으로 붙이면 법적 근거가 흐려진다.
//   - 이미 쓰고 있는데 목록에 없는 태그는 "미등록" 으로 함께 보여 준다(모르는 사이에 숨기지 않는다).
//   - 길이·개수 한도는 기존 태그 규칙(20자·고객당 10개)과 같은 기준을 쓰고, 목록 자체는 50개까지.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export const MAX_TAG_NAME = 20;
export const MAX_MASTER_TAGS = 50;
/** 동의 태그 접두 — 이 이름으로 시작하는 태그는 마스터에 넣지 않는다 */
const CONSENT_PREFIX = '광고동의';

/** 입력칸 값 → 태그 이름. 쓸 수 없는 값이면 null */
export function normalizeTagName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ');
  if (t === '') return null;
  if (t.includes(',') || t.includes('，')) return null; // 쉼표는 태그 구분자라 이름에 쓸 수 없다
  if (t.startsWith(CONSENT_PREFIX)) return null;        // 동의 태그는 동의 컨트롤이 관리한다
  return t.slice(0, MAX_TAG_NAME).trim();
}

export interface MasterChange {
  list: string[];
  error?: string;
}

/** 목록에 추가 — 같은 태그는 다시 넣지 않고, 쓸 수 없는 이름·한도 초과는 사유를 돌려준다 */
export function addMasterTag(list: string[], input: unknown): MasterChange {
  const name = normalizeTagName(input);
  if (!name) return { list, error: `태그 이름을 확인해주세요. 쉼표·#·빈 값은 쓸 수 없고 "${CONSENT_PREFIX}"로 시작하는 태그는 동의 설정에서만 관리합니다.` };
  if (list.some(t => t === name)) return { list, error: `이미 있는 태그입니다: ${name}` };
  if (list.length >= MAX_MASTER_TAGS) return { list, error: `태그 목록은 ${MAX_MASTER_TAGS}개까지입니다. 쓰지 않는 태그를 지운 뒤 추가해주세요.` };
  return { list: [...list, name] };
}

/** 목록에서 제거 — 고객에 붙은 태그는 건드리지 않는다(목록에서만 빠진다) */
export function removeMasterTag(list: string[], name: string): string[] {
  return list.filter(t => t !== name);
}

/** 저장값 정리 — 중복·쓸 수 없는 이름·한도 초과를 걸러 낸다(수동 편집·옛 포맷 방어) */
export function sanitizeMaster(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const name = normalizeTagName(raw);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= MAX_MASTER_TAGS) break;
  }
  return out;
}

export interface TagChoice {
  tag: string;
  /** 쓰고 있는 고객 수 */
  count: number;
  /** 매장 목록에 등록된 태그인가 */
  registered: boolean;
}

/**
 * 고객 창에 보여 줄 태그 칩 — 등록된 태그 먼저(사용 수 많은 순), 그다음 쓰고 있지만 미등록인 태그.
 * 미등록 태그를 숨기면 매장은 왜 자기 태그가 안 보이는지 알 수 없다.
 */
export function tagChoices(master: string[], usage: { tag: string; count: number }[], limit = 24): TagChoice[] {
  const counts = new Map(usage.map(u => [u.tag, u.count]));
  const registered = sanitizeMaster(master).map(tag => ({ tag, count: counts.get(tag) ?? 0, registered: true }));
  const extras = usage
    .filter(u => !registered.some(r => r.tag === u.tag))
    .map(u => ({ tag: u.tag, count: u.count, registered: false }));
  registered.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'));
  extras.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'));
  return [...registered, ...extras].slice(0, limit);
}

/** 입력칸 문자열에 태그 하나를 더한다(이미 있으면 그대로) — 쉼표로 이어 붙인다 */
export function appendTagToInput(current: string, tag: string): string {
  const name = normalizeTagName(tag);
  if (!name) return current;
  const parts = current.split(/[,，]/).map(t => t.trim().replace(/^#+/, '').trim()).filter(Boolean);
  if (parts.includes(name)) return current;
  return [...parts, name].join(', ');
}
