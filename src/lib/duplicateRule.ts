// duplicateRule — 중복 고객 후보 탐지(다중 키) (순수, 171, GAP C-9). 전화 단일 키였던 것을 이름+생년월일·이름+전화 뒷자리·이메일로 넓힌다.
// 후보는 "제안"일 뿐 — 병합은 사람이 확인한다(customerMerge). 점수는 키의 강도 순서를 고정하기 위한 정렬 값이지 확률이 아니다.
export interface DupInput { id: string; name: string; phone: string; birthDate?: string; email?: string }
export type DupReason = 'phone' | 'email' | 'name+birth' | 'name+phone4';
export const DUP_REASON_LABEL: Record<DupReason, string> = { phone: '같은 전화번호', email: '같은 이메일', 'name+birth': '같은 이름·생년월일', 'name+phone4': '같은 이름·전화 뒷 4자리' };
const SCORE: Record<DupReason, number> = { phone: 100, email: 80, 'name+birth': 70, 'name+phone4': 50 };

export interface DupCandidate<T extends DupInput> { customer: T; reasons: DupReason[]; score: number }

const digits = (s: string | undefined) => (s || '').replace(/\D/g, '');
/** 이름 정규화 — 공백·특수문자 제거, 소문자(영문 이름) */
export function normalizeName(s: string | undefined): string {
  return (s || '').replace(/[\s\-_.·,()]/g, '').toLowerCase();
}
const normEmail = (s: string | undefined) => (s || '').trim().toLowerCase();
const validBirth = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** target 과 같은 사람일 수 있는 다른 고객 — 사유가 하나라도 있으면 후보, 점수 합 내림차순·같은 점수는 이름순 */
export function duplicateCandidates<T extends DupInput>(target: T, others: T[]): DupCandidate<T>[] {
  const tPhone = digits(target.phone), tName = normalizeName(target.name), tEmail = normEmail(target.email), tBirth = validBirth(target.birthDate) ? target.birthDate : '';
  const tTail = tPhone.length >= 8 ? tPhone.slice(-4) : '';
  const out: DupCandidate<T>[] = [];
  for (const c of others) {
    if (c.id === target.id) continue;
    const reasons: DupReason[] = [];
    const p = digits(c.phone);
    if (tPhone.length >= 8 && p === tPhone) reasons.push('phone');
    if (tEmail && normEmail(c.email) === tEmail) reasons.push('email');
    const sameName = !!tName && normalizeName(c.name) === tName;
    if (sameName && tBirth && c.birthDate === tBirth) reasons.push('name+birth');
    if (sameName && tTail && p.length >= 8 && p !== tPhone && p.slice(-4) === tTail) reasons.push('name+phone4'); // 번호가 같으면 phone 사유로 충분
    if (reasons.length) out.push({ customer: c, reasons, score: reasons.reduce((s, r) => s + SCORE[r], 0) });
  }
  return out.sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name, 'ko'));
}
