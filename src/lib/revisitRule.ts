// ═══════════════════════════════════════════════════════════════
// revisitRule — 재방문 권장일 산출 규칙 (순수 모듈, 저장소 의존 없음)
// ───────────────────────────────────────────────────────────────
// 고객 상세(getCustomerRevisitInfo)와 리마인더 목록(getRevisitDueCustomers)이 같은 함수를 쓴다.
//   1) 최근 시술기록의 '다음 방문 권장일(nextAppointment)'이 있고 그 뒤에 다시 다녀가지 않았으면 그 날짜 (basis 'recommended')
//   2) 아니면 마지막 방문일(시술일과 고객 lastVisitDate 중 나중) + 재방문 주기 (basis 'cycle')
//   3) 방문 이력이 전혀 없으면 null
// 날짜는 전부 로컬 YYYY-MM-DD — toISOString()은 UTC라 KST 자정~09시에 전날로 어긋난다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다 (커버리지 감사 2026-11-20).
// ═══════════════════════════════════════════════════════════════

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** to - from 를 날 수로 (둘 다 YYYY-MM-DD, 로컬 자정 기준) */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO + 'T00:00:00').getTime() - new Date(fromISO + 'T00:00:00').getTime()) / 86_400_000);
}

/** 둘 다 있으면 나중 날짜 — 시술기록만 보면 예약 완료(방문)로만 다녀간 고객이 '기한 지남'으로 잘못 잡힌다 (정합성 감사 2026-11-19) */
export const later = (a?: string | null, b?: string | null): string | null => (a && b ? (a > b ? a : b) : a || b || null);

export interface RevisitInput {
  lastTreatmentDate?: string | null;  // 최근 시술기록의 시술일
  nextAppointment?: string | null;    // 그 시술기록의 다음 방문 권장일
  lastVisitDate?: string | null;      // 고객의 마지막 방문일(예약 완료 포함)
  cycleDays: number;                  // 재방문 주기(일)
}

export interface RevisitDue {
  lastVisit: string | null;
  dueDate: string;
  basis: 'recommended' | 'cycle';
}

export function computeRevisitDue(i: RevisitInput): RevisitDue | null {
  const lastVisit = later(i.lastTreatmentDate, i.lastVisitDate);
  // 권장일 뒤에(당일 포함) 다시 다녀갔다면 그 권장일은 이미 소화된 것 — 마지막 방문 + 주기로 (UX 점검 2026-11-19)
  if (i.nextAppointment && !(lastVisit && lastVisit >= i.nextAppointment)) return { lastVisit, dueDate: i.nextAppointment, basis: 'recommended' };
  if (lastVisit) return { lastVisit, dueDate: addDays(lastVisit, i.cycleDays), basis: 'cycle' };
  return null;
}
