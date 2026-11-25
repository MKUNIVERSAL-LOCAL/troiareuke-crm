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

import { isConsentTag } from './consentRule';

export const MAX_TAG_NAME = 20;
export const MAX_MASTER_TAGS = 50;
/** 고객 한 명에게 붙일 수 있는 태그 수 — customerTags.parseTags 와 같은 값(그쪽이 조용히 자르지 않게 여기서 먼저 막는다) */
export const MAX_TAGS_PER_CUSTOMER = 10;
/** 칩에서 미등록 태그에 보장하는 자리 — 등록 태그가 많아도 "쓰고 있는데 목록에 없는 태그" 가 사라지지 않게 (238, 리뷰 M-7) */
const EXTRA_CHIP_QUOTA = 6;
/**
 * 동의 예약어 접두 — 정확히 예약어가 아니어도 이 말로 시작하는 태그는 막는다.
 * '광고동의'(날짜 없는 형태)처럼 예약어를 닮은 이름이 목록에 남으면 직원이 동의 기록으로 착각한다 (238, 리뷰 H-2).
 */
const CONSENT_PREFIXES = ['광고동의', '광고수신', '문자수신', '카카오수신'];

/** 입력칸 값 → 태그 이름. 쓸 수 없는 값이면 null */
export function normalizeTagName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ');
  if (t === '') return null;
  if (t.includes(',') || t.includes('，')) return null; // 쉼표는 태그 구분자라 이름에 쓸 수 없다
  // 동의 태그(광고수신동의·광고수신거부·문자수신거부·카카오수신거부·광고동의:날짜)는 동의 컨트롤이 관리한다.
  // 전에는 '광고동의' 접두만 막아 상태 태그 4종이 마스터에 등록됐고, 칩으로 넣어도 저장 때 조용히 버려졌다 (238, 리뷰 H-2)
  if (isConsentTag(t) || CONSENT_PREFIXES.some(p => t.startsWith(p))) return null;
  return t.slice(0, MAX_TAG_NAME).trim();
}

export interface MasterChange {
  list: string[];
  error?: string;
}

/** 목록에 추가 — 같은 태그는 다시 넣지 않고, 쓸 수 없는 이름·한도 초과는 사유를 돌려준다 */
export function addMasterTag(list: string[], input: unknown): MasterChange {
  const name = normalizeTagName(input);
  if (!name) return { list, error: '태그 이름을 확인해주세요. 쉼표·#·빈 값은 쓸 수 없고, 광고 수신 동의·거부 태그는 고객 상세의 동의 설정에서만 관리합니다.' };
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
  // 등록 태그는 **등록 순서**로 — 사용 수로 정렬하면 방금 추가한 태그(0건)가 꼬리로 밀려 안 보였다 (238, 리뷰 M-7)
  const registered = sanitizeMaster(master).map(tag => ({ tag, count: counts.get(tag) ?? 0, registered: true }));
  const extras = usage
    .filter(u => !registered.some(r => r.tag === u.tag) && normalizeTagName(u.tag) === u.tag) // 동의 태그·예약어 닮은 이름은 칩에 올리지 않는다 (238, 리뷰 H-2)
    .map(u => ({ tag: u.tag, count: u.count, registered: false }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'));
  // 미등록 태그 자리를 먼저 떼어 둔다 — 등록 태그가 상한을 다 먹어 미등록이 전부 사라지지 않게
  const extraSlots = Math.min(extras.length, EXTRA_CHIP_QUOTA);
  const regPart = registered.slice(0, Math.max(0, limit - extraSlots));
  const extraPart = extras.slice(0, Math.max(0, limit - regPart.length));
  return [...regPart, ...extraPart];
}

/** 입력칸의 태그 수 — 상한에 걸렸는지 화면이 판단할 수 있게 */
export function countInputTags(current: string): number {
  return current.split(/[,，]/).map(t => t.trim().replace(/^#+/, '').trim()).filter(Boolean).length;
}

export interface AppendResult {
  value: string;
  /** 못 더한 이유(있으면 화면이 알린다) */
  error?: string;
}

/**
 * 입력칸 문자열에 태그 하나를 더한다 — 쉼표로 이어 붙인다.
 * 이미 있으면 그대로, 고객당 상한(10개)을 넘으면 사유를 돌려준다 —
 * 전에는 11개째가 저장 때 parseTags 에서 아무 말 없이 잘렸다 (238, 리뷰 M-5).
 */
export function appendTagToInput(current: string, tag: string): AppendResult {
  const name = normalizeTagName(tag);
  if (!name) return { value: current, error: '이 태그는 넣을 수 없습니다(동의 태그는 동의 설정에서 관리합니다).' };
  const parts = current.split(/[,，]/).map(t => t.trim().replace(/^#+/, '').trim()).filter(Boolean);
  if (parts.includes(name)) return { value: current };
  if (parts.length >= MAX_TAGS_PER_CUSTOMER) return { value: current, error: `태그는 고객당 ${MAX_TAGS_PER_CUSTOMER}개까지입니다.` };
  return { value: [...parts, name].join(', ') };
}
