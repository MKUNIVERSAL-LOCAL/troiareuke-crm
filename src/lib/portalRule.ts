// portalRule — 고객 포털 인증(OTP) 정책과 노출 항목 규칙 (순수, 169, docs/CUSTOMER-PORTAL-DESIGN-2026-11-24.md 2·7절)
// 서버(승인 B-2 뒤)와 테스트가 같은 값·전이를 쓰기 위한 참조 구현. 저장소·네트워크 의존 없음.
const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60_000;         // 5분 유효
export const OTP_RESEND_GAP_MS = 60_000;      // 재요청 60초
const OTP_MAX_FAILS = 5;               // 연속 실패 5회 → 잠금
export const OTP_LOCK_MS = 15 * 60_000;       // 15분 잠금
export const PORTAL_SESSION_MS = 24 * 3_600_000;

export interface OtpState {
  codeHash: string | null;   // 서버는 해시만 보관(여기서는 비교 함수를 주입)
  issuedAt: number | null;   // epoch ms
  fails: number;
  lockedUntil: number | null;
}
export const EMPTY_OTP: OtpState = { codeHash: null, issuedAt: null, fails: 0, lockedUntil: null };

export type OtpRequestResult = { ok: true; state: OtpState } | { ok: false; reason: 'locked' | 'too-soon'; retryAfterMs: number };
export type OtpVerifyResult = { ok: true; state: OtpState; sessionExpiresAt: number } | { ok: false; reason: 'locked' | 'expired' | 'mismatch' | 'none'; state: OtpState; retryAfterMs?: number };

/** 발송 가능? 잠금·재요청 간격을 본다. 가능하면 새 코드 해시를 기록한 상태를 돌려준다 */
export function requestOtp(s: OtpState, now: number, codeHash: string): OtpRequestResult {
  if (s.lockedUntil !== null && now < s.lockedUntil) return { ok: false, reason: 'locked', retryAfterMs: s.lockedUntil - now };
  if (s.issuedAt !== null && now - s.issuedAt < OTP_RESEND_GAP_MS) return { ok: false, reason: 'too-soon', retryAfterMs: OTP_RESEND_GAP_MS - (now - s.issuedAt) };
  return { ok: true, state: { codeHash, issuedAt: now, fails: s.lockedUntil !== null && now >= s.lockedUntil ? 0 : s.fails, lockedUntil: null } };
}

/** 검증 — 만료·불일치·잠금을 구분하고, 연속 실패 5회면 15분 잠금. 성공하면 코드를 소모하고 세션 만료 시각을 준다 */
export function verifyOtp(s: OtpState, now: number, matches: (codeHash: string) => boolean): OtpVerifyResult {
  if (s.lockedUntil !== null && now < s.lockedUntil) return { ok: false, reason: 'locked', state: s, retryAfterMs: s.lockedUntil - now };
  if (s.codeHash === null || s.issuedAt === null) return { ok: false, reason: 'none', state: s };
  if (now - s.issuedAt > OTP_TTL_MS) return { ok: false, reason: 'expired', state: { ...s, codeHash: null } };
  if (!matches(s.codeHash)) {
    const fails = s.fails + 1;
    if (fails >= OTP_MAX_FAILS) return { ok: false, reason: 'mismatch', state: { codeHash: null, issuedAt: null, fails, lockedUntil: now + OTP_LOCK_MS }, retryAfterMs: OTP_LOCK_MS };
    return { ok: false, reason: 'mismatch', state: { ...s, fails } };
  }
  return { ok: true, state: { ...EMPTY_OTP }, sessionExpiresAt: now + PORTAL_SESSION_MS };
}

/** 코드 형식 — 숫자 6자리만 */
export function isValidOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

// ── 노출 항목 — 포털은 고객 자신의 것만, 그중에서도 필요한 것만 ──
export interface PortalSourceCustomer {
  name: string;
  reservations: { date: string; startTime: string; serviceNames: string[]; status: string }[];
  programs: { programName: string; remaining: number | null; expiryDate?: string; isCompleted: boolean }[];
  consent: { ad: 'consented' | 'optout' | 'unknown'; sms: boolean; kakao: boolean };
}
export interface PortalSummary {
  name: string;
  upcoming: { date: string; startTime: string; services: string }[];   // 오늘 이후 30일, 취소·노쇼 제외, 시간순
  programs: { programName: string; remaining: number | null; expiryDate?: string }[]; // 활성만
  consent: PortalSourceCustomer['consent'];
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** 포털 응답 — 주소·메모·결제 금액·직원 실명 등은 들어가지 않는다 */
export function portalSummaryOf(c: PortalSourceCustomer, today: string): PortalSummary {
  const end = addDays(today, 30);
  const upcoming = c.reservations
    .filter(r => r.date >= today && r.date <= end && r.status !== 'cancelled' && r.status !== 'noshow' && r.status !== 'completed')
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .map(r => ({ date: r.date, startTime: r.startTime, services: r.serviceNames.join(', ') }));
  const programs = c.programs.filter(p => !p.isCompleted).map(p => ({ programName: p.programName, remaining: p.remaining, ...(p.expiryDate ? { expiryDate: p.expiryDate } : {}) }));
  return { name: c.name, upcoming, programs, consent: c.consent };
}
