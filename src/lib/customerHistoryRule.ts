// ═══════════════════════════════════════════════════════════════
// customerHistoryRule — 고객 정보 변경 이력 규칙 (순수 모듈, 252, GAP C-1 계열)
// ───────────────────────────────────────────────────────────────
// 왜: 고객 정보는 덮어쓰기라 **누가 언제 무엇을 바꿨는지** 남지 않았다. 등급을 누가 내렸는지,
//     전화번호가 언제 바뀌었는지 물어볼 데가 없어 "내가 안 바꿨다" 로 끝난다(직원 여러 명이 쓰는 매장).
//     247 예약 변경 이력과 같은 요구다 — 상용 CRM 은 고객 카드마다 변경 이력을 낸다.
// 개인정보 원칙(이력은 또 하나의 사본이다 — 적게 남긴다):
//   - 전화·이메일은 **뒤 4자리·앞 두 글자만**, 생일·주소는 "적음/지움" 만 남긴다.
//   - 메모·알레르기는 내용을 남기지 않고 "있음 → 없음" 처럼 바뀐 사실만.
//   - 이름·등급·태그는 그대로(분쟁 해소에 그 값이 필요하고, 익명화·삭제 때 이력을 함께 지운다).
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export type CustomerHistoryKind = 'edit' | 'grade' | 'merge';

export interface CustomerChange { label: string; from: string; to: string }

export interface CustomerHistoryEntry {
  id: string;
  customerId: string;
  at: string;            // ISO
  kind: CustomerHistoryKind;
  actor?: string;
  changes: CustomerChange[];
}

/** 비교할 고객의 모양 — 코어 Customer 의 부분집합 */
export interface CustomerSnapshot {
  name?: string;
  phone?: string;
  email?: string;
  grade?: string;
  gender?: string;
  birthDate?: string;
  address?: string;
  referralSource?: string;
  skinType?: string;
  tags?: string[];
  memo?: string;
  allergies?: string;
}

/** 전화번호는 뒤 4자리만 남긴다 */
export function maskPhone(value: string | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '없음';
  return `···${digits.slice(-4)}`;
}

/** 이메일은 앞 두 글자만 */
export function maskEmail(value: string | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '없음';
  const at = v.indexOf('@');
  const id = at >= 0 ? v.slice(0, at) : v;
  const domain = at >= 0 ? v.slice(at) : ''; // @ 가 여러 개여도 뒤를 그대로 둔다 (254 리뷰 L-7)
  return `${id.slice(0, 2)}···${domain}`;
}

function filled(value: string | undefined): string {
  return (value ?? '').trim() ? '적음' : '없음';
}

function has(value: string | undefined): string {
  return (value ?? '').trim() ? '있음' : '없음';
}

function tagText(tags: string[] | undefined): string {
  return (tags ?? []).join(', ');
}

/** 태그는 순서를 뜻으로 보지 않는다 — 다시 입력해 순서만 바뀐 것을 변경으로 적지 않게 (254 리뷰 M-6) */
function tagKey(tags: string[] | undefined): string {
  return [...new Set((tags ?? []).map(t => t.trim()).filter(Boolean))].sort().join('|');
}

/** 저장 전/후를 비교해 바뀐 항목만. 바뀐 것이 없으면 빈 배열(이력을 만들지 않는다) */
export function diffCustomer(before: CustomerSnapshot, after: CustomerSnapshot): CustomerChange[] {
  const out: CustomerChange[] = [];
  const text = (v: string | undefined) => (v ?? '').trim();
  if (text(before.name) !== text(after.name)) out.push({ label: '이름', from: text(before.name), to: text(after.name) });
  // 마스킹·정규화 **뒤** 값으로 비교한다 — 하이픈만 지워도 "···5678 → ···5678" 같은 뜻 없는 줄이 남고
  // 고객당 20칸·전체 상한을 먹었다 (254 리뷰 M-6)
  if (maskPhone(before.phone) !== maskPhone(after.phone)) out.push({ label: '연락처', from: maskPhone(before.phone), to: maskPhone(after.phone) });
  if (maskEmail(before.email) !== maskEmail(after.email)) out.push({ label: '이메일', from: maskEmail(before.email), to: maskEmail(after.email) });
  if (text(before.grade) !== text(after.grade)) out.push({ label: '등급', from: text(before.grade), to: text(after.grade) });
  if (text(before.gender) !== text(after.gender)) out.push({ label: '성별', from: text(before.gender), to: text(after.gender) });
  if (text(before.skinType) !== text(after.skinType)) out.push({ label: '피부 타입', from: text(before.skinType), to: text(after.skinType) });
  if (text(before.referralSource) !== text(after.referralSource)) out.push({ label: '유입 경로', from: text(before.referralSource), to: text(after.referralSource) });
  if (text(before.birthDate) !== text(after.birthDate)) out.push({ label: '생일', from: filled(before.birthDate), to: filled(after.birthDate) });
  if (text(before.address) !== text(after.address)) out.push({ label: '주소', from: filled(before.address), to: filled(after.address) });
  if (tagKey(before.tags) !== tagKey(after.tags)) out.push({ label: '태그', from: tagText(before.tags) || '없음', to: tagText(after.tags) || '없음' });
  if (has(before.memo) !== has(after.memo)) out.push({ label: '메모', from: has(before.memo), to: has(after.memo) });
  if (has(before.allergies) !== has(after.allergies)) out.push({ label: '알레르기', from: has(before.allergies), to: has(after.allergies) });
  return out;
}

/** 등급만 바꾼 경우 — 뱃지 드롭다운·일괄 적용이 쓴다 */
export function gradeChange(from: string | undefined, to: string): CustomerChange[] {
  if ((from ?? '') === to) return [];
  return [{ label: '등급', from: from ?? '', to }];
}

export function describeCustomerChange(c: CustomerChange): string {
  if (!c.from) return `${c.label} ${c.to} 로 입력`;
  if (!c.to) return `${c.label} ${c.from} 지움`;
  return `${c.label} ${c.from} → ${c.to}`;
}

export function describeCustomerEntryHead(e: CustomerHistoryEntry, formatTime: (iso: string) => string): string {
  const who = e.actor ? ` · ${e.actor}` : '';
  const what = e.kind === 'grade' ? '등급 변경' : e.kind === 'merge' ? '고객 병합' : '정보 수정';
  return `${formatTime(e.at)}${who} · ${what}`;
}

// 일괄 적용(등급 제안·태그 이름 변경)이 한 번에 수백 건을 쓰므로, 한 번의 조작으로 상한이 소진되지 않게 넉넉히 (254 리뷰 H-3)
const MAX_CUSTOMER_HISTORY = 3000;
export const MAX_PER_CUSTOMER = 20;

function isEntry(e: unknown): e is CustomerHistoryEntry {
  if (!e || typeof e !== 'object') return false;
  const r = e as CustomerHistoryEntry;
  return typeof r.customerId === 'string' && r.customerId.length > 0
    // 날짜 모양이 아니면 버린다 — 깨진 한 줄이 180일 정리를 영구히 피해 남았다 (254 리뷰 L-3)
    && typeof r.at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.at)
    && Array.isArray(r.changes);
}

export function sanitizeCustomerHistory(value: unknown): CustomerHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: CustomerHistoryEntry[] = [];
  for (const raw of value) {
    if (!isEntry(raw)) continue;
    const changes = raw.changes
      .filter(c => c && typeof c.label === 'string')
      .map(c => ({ label: String(c.label).slice(0, 20), from: String(c.from ?? '').slice(0, 60), to: String(c.to ?? '').slice(0, 60) }));
    if (changes.length === 0) continue;
    out.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : `${raw.customerId}-${raw.at}`,
      customerId: raw.customerId,
      at: raw.at,
      kind: raw.kind === 'grade' || raw.kind === 'merge' ? raw.kind : 'edit',
      ...(raw.actor ? { actor: String(raw.actor).slice(0, 20) } : {}),
      changes,
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** 고객당 최근 MAX_PER_CUSTOMER 건, 전체 MAX_CUSTOMER_HISTORY 건, keepFrom 이전은 버린다 */
export function trimCustomerHistory(entries: CustomerHistoryEntry[], keepFrom: string, max: number = MAX_CUSTOMER_HISTORY): CustomerHistoryEntry[] {
  const fresh = entries.filter(e => e.at.slice(0, 10) >= keepFrom);
  const perCount = new Map<string, number>();
  const kept: CustomerHistoryEntry[] = [];
  for (let idx = fresh.length - 1; idx >= 0; idx -= 1) {
    const e = fresh[idx];
    const n = (perCount.get(e.customerId) ?? 0) + 1;
    if (n > MAX_PER_CUSTOMER) continue;
    perCount.set(e.customerId, n);
    kept.push(e);
  }
  kept.reverse();
  return kept.length > max ? kept.slice(kept.length - max) : kept;
}

export function customerHistoryFor(entries: CustomerHistoryEntry[], customerId: string): CustomerHistoryEntry[] {
  return entries.filter(e => e.customerId === customerId).sort((a, b) => b.at.localeCompare(a.at));
}

export const CUSTOMER_HISTORY_CAVEAT =
  '이 PC 에서 한 변경만 남습니다(다른 PC·폰에서 한 변경은 그 기기에 남습니다). 엑셀 가져오기로 덮어쓴 값은 남지 않습니다. 연락처·이메일은 일부만, 메모·알레르기는 바뀐 사실만 남겨 추가 사본을 줄였습니다(이름·등급·태그는 그대로). 최근 3000건·고객당 20건·180일까지 보관합니다.';

/** 기록이 없을 때 — "변경이 없었다" 로 읽히지 않게 적는다 (254 리뷰 M-3) */
export const CUSTOMER_HISTORY_EMPTY = '이 PC 에 기록된 변경이 없습니다(변경이 없었다는 뜻은 아닙니다).';

/** 저장이 실패했을 때 — 기록이 비어 보이는 이유를 말한다 (254 리뷰 M-3) */
export const CUSTOMER_HISTORY_WRITE_FAILED = '변경 기록을 저장하지 못했습니다(저장 공간 부족) — 이 목록은 비어 있을 수 있습니다.';
