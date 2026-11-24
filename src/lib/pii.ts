// pii — 고객 개인정보 표시 규칙 (비코어, 13차 점검 2026-11-23)
// 코어 masking.ts 에는 maskPhone 만 있어 화면마다 `role !== 'staff'` 삼항식을 복제했고, PC 상세·모바일 상세·내보내기가 이메일·생년월일을 다르게 가렸다.
import { maskPhone } from './masking';
import { isAdminRole } from './permissions';

export { maskPhone };

/** 직원 계정은 전화·이메일·주소·생년월일 원문을 보지 않는다 — 목록·상세·수정 폼·내보내기 전부 같은 규칙 */
export function canSeePii(role: string | undefined | null): boolean {
  return isAdminRole(role);
}

export function maskEmail(v: string | undefined | null): string {
  const s = (v || '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  return at > 0 ? `${s.slice(0, 1)}***${s.slice(at)}` : '***';
}

/** 'YYYY-MM-DD' → 'YYYY-**-**' (연도만 — 연령대 응대는 가능하게) */
export function maskBirthDate(v: string | undefined | null): string {
  const s = (v || '').trim();
  return s.length >= 4 ? `${s.slice(0, 4)}-**-**` : (s ? '****' : '');
}

/** 목록·상세의 전화 표시 — canSeePii 와 같은 판정(role 없는 로컬 세션은 관리자) (15차 #M19) */
export function phoneFor(role: string | undefined | null, v: string | undefined | null): string { return canSeePii(role) ? (v || '') : maskPhone(v || '', 'staff'); }
export function emailFor(role: string | undefined | null, v: string | undefined | null): string { return canSeePii(role) ? (v || '') : maskEmail(v); }
export function birthDateFor(role: string | undefined | null, v: string | undefined | null): string { return canSeePii(role) ? (v || '') : maskBirthDate(v); }
