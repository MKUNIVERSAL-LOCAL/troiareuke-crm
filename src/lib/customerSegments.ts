import { CustomerStore, PaymentStore, ReservationStore } from './store';
import type { Customer } from '../types';
import { buildCustomerStatsIndex, statsFor } from './customerStats';
import { resolveVisitCycle } from './visitCycleRule';
import { getRevisitCycleDays } from './reminderEngine';
import { scoreRfm, type RfmScore } from './rfmRule';
import { churnRisk, atRiskRevenue90, type ChurnRisk } from './churnRule';
import { isCountableCustomer } from './customerScope';
import { toISO, daysBetween, addDays } from './revisitRule';

/**
 * 고객 세그먼트 인덱스 — RFM 점수·구분, 이탈 위험, 최근 365일 결제, 90일 위험 매출(예측)을 고객별로 한 번에 (136, GAP C-6).
 * 규칙은 전부 순수 모듈(rfmRule·churnRule·visitCycleRule), 여기서는 저장소에서 자료를 모아 넘기기만 한다. 전수 스캔이므로 호출 쪽이 useMemo 로 한 번만.
 */
export interface CustomerSegmentInfo {
  rfm: RfmScore;
  churn: ChurnRisk | null;
  cycleDays: number;
  spent365: number;
  atRisk90: number; // 예측
  daysSinceLastVisit: number | null;
}

export function buildSegmentIndex(): Map<string, CustomerSegmentInfo> {
  const today = toISO(new Date());
  const since = addDays(today, -365);
  const customers = CustomerStore.getAll().filter(isCountableCustomer);
  const stats = buildCustomerStatsIndex();
  const shopCycle = getRevisitCycleDays();
  const spent365 = new Map<string, number>();
  for (const p of PaymentStore.getAll()) if (p.customerId && p.status === 'completed' && p.paymentDate >= since) spent365.set(p.customerId, (spent365.get(p.customerId) || 0) + (p.amount || 0));
  const upcoming = new Set<string>();
  for (const r of ReservationStore.getAll()) if (r.date >= today && r.status !== 'cancelled' && r.status !== 'noshow') upcoming.add(r.customerId);

  const inputs = customers.map(c => {
    const s = statsFor(c, stats);
    const visitDays = stats.visitDays?.get(c.id) ?? [];
    const recent = visitDays.filter(d => d >= since).length; // 빈도 = 최근 365일 방문일 수
    return { id: c.id, recencyDays: s.lastVisitDate ? daysBetween(s.lastVisitDate, today) : null, frequency: recent, monetary: spent365.get(c.id) || 0, visitDays, lastVisitDate: s.lastVisitDate };
  });
  const rfm = scoreRfm(inputs);
  const out = new Map<string, CustomerSegmentInfo>();
  for (const i of inputs) {
    const cycle = resolveVisitCycle(i.visitDays, shopCycle);
    out.set(i.id, {
      rfm: rfm.get(i.id)!,
      churn: churnRisk({ daysSinceLastVisit: i.recencyDays, cycleDays: cycle.days, hasUpcomingReservation: upcoming.has(i.id) }),
      cycleDays: cycle.days,
      spent365: i.monetary,
      atRisk90: atRiskRevenue90(i.monetary),
      daysSinceLastVisit: i.recencyDays,
    });
  }
  return out;
}

/** 발송 대상 세그먼트용 id 집합 — 이탈 위험 높음 / 충성 */
export function segmentIdSets(): { churn: Set<string>; loyal: Set<string> } {
  const idx = buildSegmentIndex();
  const churn = new Set<string>(); const loyal = new Set<string>();
  for (const [id, v] of idx) { if (v.churn?.level === 'high') churn.add(id); if (v.rfm.segment === '충성') loyal.add(id); }
  return { churn, loyal };
}

export type { Customer };
