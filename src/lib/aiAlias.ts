/**
 * AI 챗봇 개인정보 가명화 (보안 감사·리뷰 2026-11-19~20).
 * 고객 이름은 고객#번호로 바꿔 외부 AI(또는 본사 중계)에 보내고, 답변의 고객#번호는 화면에서 이름으로 되돌린다.
 *  - 번호는 세션 동안 고객 id에 고정(aliasNumbers) — 삭제·병합·동기화로 목록 순서가 바뀌어도 "고객#40"이 다른 사람이 되지 않는다. 새 id는 max+1.
 *  - 질문·이전 답변에 든 실제 이름도 가명으로(forwardAlias): CRM 어휘·'고객#…' 꼴 이름은 제외, 앞 경계(한글·영숫자 아님) + 긴 이름 우선, 정규식 한 번.
 *  - 동명이인은 질문의 이름이 먼저 등록된 고객의 번호로만 치환되므로 duplicates로 전원 번호를 컨텍스트에 알린다.
 * 순수 함수 — 저장소·DOM 의존 없음(e2e/ai-alias.spec.ts가 직접 검증).
 */
export type CustomerAliases = Map<string, string>;

export interface AliasBook {
  /** 고객#번호 → 실제 이름 */
  aliases: CustomerAliases;
  /** 고객 id → 가명. id 없으면 '-', 등록되지 않은 id는 '고객(미등록)' */
  aliasOf: (customerId?: string) => string;
  /** 문장 속 실제 이름 → 가명 */
  forwardAlias: (text: string) => string;
  /** 문장 속 가명 → 실제 이름(모르는 번호는 그대로) */
  deAlias: (text: string) => string;
  /** 동명이인 그룹(가명 목록) — 2명 이상인 이름만 */
  duplicates: string[][];
}

/** 이름→가명 치환에서 제외할 CRM 어휘 — 이런 이름의 고객(샘플·테스트 데이터에 흔함)이 질문 문장을 망가뜨리지 않게 */
export const ALIAS_STOP_WORDS = new Set(['고객', '매출', '예약', '오늘', '이번', '지난', '시술', '결제', '직원', '재고', '제품', '등급', '피부', '방문', '회원', '단골', '신규', '프로그램', '회차권', '환불', '취소', '완료', '노쇼', '상담', '사진', '문자', '카카오', '발송']);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildAliasBook(customers: { id: string; name: string }[], aliasNumbers: Map<string, number>): AliasBook {
  const aliases: CustomerAliases = new Map();
  const aliasById = new Map<string, string>();
  let nextNo = Math.max(0, ...aliasNumbers.values());
  for (const c of customers) {
    let no = aliasNumbers.get(c.id);
    if (no === undefined) { no = ++nextNo; aliasNumbers.set(c.id, no); }
    const a = `고객#${no}`;
    aliases.set(a, c.name);
    aliasById.set(c.id, a);
  }
  const aliasOf = (customerId?: string) => (customerId ? aliasById.get(customerId) ?? '고객(미등록)' : '-');

  const nameToAlias = new Map<string, string>();
  const sameName = new Map<string, string[]>();
  for (const c of customers) {
    const name = (c.name || '').trim();
    if (name.length < 2 || ALIAS_STOP_WORDS.has(name) || /^고객#?\d*$/.test(name)) continue;
    if (!nameToAlias.has(name)) nameToAlias.set(name, aliasById.get(c.id)!);
    sameName.set(name, [...(sameName.get(name) ?? []), aliasById.get(c.id)!]);
  }
  const names = [...nameToAlias.keys()].sort((a, b) => b.length - a.length);
  const nameRe = names.length > 0 ? new RegExp(`(^|[^가-힣A-Za-z0-9])(${names.map(escapeRegExp).join('|')})`, 'g') : null;
  const forwardAlias = (text: string) => (nameRe ? text.replace(nameRe, (_m, pre: string, name: string) => pre + nameToAlias.get(name)!) : text);
  const deAlias = (text: string) => text.replace(/고객#(\d+)/g, m => aliases.get(m) ?? m);
  const duplicates = [...sameName.values()].filter(list => list.length > 1);
  return { aliases, aliasOf, forwardAlias, deAlias, duplicates };
}
