// rebook — 다음 방문 추천을 위한 자료 수집 (비코어, 231, GAP R-11)
// 규칙은 rebookRule.ts(순수), 여기서는 저장소에서 그 고객 한 명분만 모아 넘긴다.
// 전수 인덱스(buildCustomerStatsIndex)는 결제 한 건 저장할 때마다 쓰기엔 과하다 — 고객 하나만 훑는다.
import { CustomerStore, ReservationStore, TreatmentLogStore } from './store';
import { getRevisitCycleDays } from './reminderEngine';
import { suggestRebook, type RebookSuggestion } from './rebookRule';

export interface RebookTarget {
  customerId: string;
  customerName: string;
  suggestion: RebookSuggestion;
}

/** 결제한 고객의 다음 방문 추천 — 추천할 것이 없으면(다가오는 예약이 이미 있거나 주기를 모르면) null */
export function suggestRebookFor(customerId: string, paymentDate: string): RebookTarget | null {
  const customer = CustomerStore.getById(customerId);
  if (!customer) return null;

  const reservations = ReservationStore.getAll().filter(r => r.customerId === customerId).map(r => ({ date: r.date, status: r.status }));
  const logs = TreatmentLogStore.getAll().filter(t => t.customerId === customerId);
  // 방문일 = 완료 예약 ∪ 시술 기록 (customerStatsRule 과 같은 정의)
  const visitDays = [...new Set([
    ...reservations.filter(r => r.status === 'completed' && r.date).map(r => r.date),
    ...logs.map(t => t.treatmentDate).filter(Boolean) as string[],
  ])].sort();
  const lastVisitDate = visitDays.length > 0 ? visitDays[visitDays.length - 1] : (customer.lastVisitDate || null);
  // 가장 최근 시술 기록의 "다음 방문 권장일"
  const sortedLogs = logs.slice().sort((a, b) => String(a.treatmentDate).localeCompare(String(b.treatmentDate)));
  const lastLog = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1] : undefined; // Array.at 은 이 프로젝트 lib 타깃 밖

  const suggestion = suggestRebook({
    paymentDate,
    lastVisitDate,
    nextAppointment: lastLog?.nextAppointment ?? null,
    visitDays,
    shopCycleDays: getRevisitCycleDays(),
    reservations,
  });
  if (!suggestion) return null;
  return { customerId, customerName: customer.name, suggestion };
}
