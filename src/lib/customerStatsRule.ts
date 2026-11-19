// ═══════════════════════════════════════════════════════════════
// customerStatsRule — 고객 누적값(결제액·방문 횟수·마지막 방문일) 재계산 규칙 (순수 모듈, 저장소 의존 없음)
// ───────────────────────────────────────────────────────────────
// customerStats.ts(저장소에서 목록을 모아 넘김)와 e2e/lib-units.spec.ts(브라우저 없이 직접 import)가 같은 함수를 쓴다.
//  - 누적 결제액 = 완료(completed) 결제 합
//  - 방문 횟수 = 완료 예약 날짜 ∪ 시술 기록 날짜의 서로 다른 날 수 (같은 날 두 번 기록해도 1회)
//  - 마지막 방문일 = 그중 가장 늦은 날
// (10차 숫자 점검 2026-11-20 #H1 — 목록·정렬·엑셀·리마인더가 저장 증분값 대신 이 값을 쓴다)
// ═══════════════════════════════════════════════════════════════

import type { Customer, Payment, Reservation, TreatmentLog } from '../types';

export interface CustomerStats { totalSpent: number; totalVisits: number; lastVisitDate: string | null }

export interface CustomerStatsIndex {
  byId: Map<string, CustomerStats>;
  noPayments: boolean;      // 결제 컬렉션이 통째로 비어 있으면(로드 실패·하이드레이션 전) 저장값을 0으로 보이지 않는다 — heal 과 같은 가드
  noVisitRecords: boolean;
}

export interface CustomerStatsSource {
  payments: Pick<Payment, 'customerId' | 'status' | 'amount'>[];
  reservations: Pick<Reservation, 'customerId' | 'status' | 'date'>[];
  treatmentLogs: Pick<TreatmentLog, 'customerId' | 'treatmentDate'>[];
}

/** 전 고객 재계산을 한 번의 버킷으로 — 고객 N × 기록 M 훑기 대신 O(N+M) */
export function buildStatsIndex(src: CustomerStatsSource): CustomerStatsIndex {
  const spent = new Map<string, number>();
  for (const p of src.payments) if (p.customerId && p.status === 'completed') spent.set(p.customerId, (spent.get(p.customerId) || 0) + (p.amount || 0));
  const days = new Map<string, Set<string>>();
  const add = (id: string, d: string) => { let set = days.get(id); if (!set) { set = new Set(); days.set(id, set); } set.add(d); };
  for (const r of src.reservations) if (r.customerId && r.status === 'completed' && r.date) add(r.customerId, r.date);
  for (const t of src.treatmentLogs) if (t.customerId && t.treatmentDate) add(t.customerId, t.treatmentDate);
  const byId = new Map<string, CustomerStats>();
  for (const id of new Set<string>([...spent.keys(), ...days.keys()])) {
    const set = days.get(id);
    let lastVisitDate: string | null = null;
    if (set) for (const d of set) if (!lastVisitDate || d > lastVisitDate) lastVisitDate = d;
    byId.set(id, { totalSpent: spent.get(id) || 0, totalVisits: set?.size || 0, lastVisitDate });
  }
  return { byId, noPayments: src.payments.length === 0, noVisitRecords: src.reservations.length === 0 && src.treatmentLogs.length === 0 };
}

/**
 * 화면·엑셀에 보일 값 — 기록이 있으면 기록 재계산값, 없으면 저장값. 저장 증분값은 서버 자동 기록·복원·다기기에서 어긋나고,
 * 코어 incrementVisit 은 과거 날짜 시술을 적어도 마지막 방문일을 "오늘"로 찍어 목록 "N일 전 방문"·휴면 고객·리마인더가 늦게 잡혔다.
 * 마지막 방문일: 기록이 하나라도 있으면 기록의 가장 늦은 날(저장값이 더 늦어도 기록을 믿는다), 기록이 없으면 손으로 적은 저장값 유지.
 */
export function statsFor(c: Pick<Customer, 'id' | 'totalSpent' | 'totalVisits' | 'lastVisitDate'>, idx: CustomerStatsIndex): CustomerStats {
  const s = idx.byId.get(c.id);
  const stored = { totalSpent: c.totalSpent || 0, totalVisits: c.totalVisits || 0, lastVisitDate: c.lastVisitDate || null };
  if (!s) return (idx.noPayments || idx.noVisitRecords) ? stored : { totalSpent: 0, totalVisits: 0, lastVisitDate: stored.lastVisitDate };
  return {
    totalSpent: idx.noPayments && stored.totalSpent > 0 ? stored.totalSpent : s.totalSpent,
    totalVisits: idx.noVisitRecords && stored.totalVisits > 0 ? stored.totalVisits : s.totalVisits,
    lastVisitDate: s.lastVisitDate ?? stored.lastVisitDate,
  };
}
