import { PaymentStore, CustomerProgramStore } from './store';
import { computeCustomerValue, type CustomerValue } from './customerValueRule';
import { usedSessionsFor } from './programSessions';
import { collectVisitDates } from './customerStats';
import { getCustomerVisitCycle } from './reminderEngine';

/** 고객 한 명의 가치 지표 — 규칙은 customerValueRule(순수), 여기서는 저장소에서 모아 넘긴다 (137, GAP C-7) */
export function getCustomerValue(customerId: string): CustomerValue {
  const payments = PaymentStore.getAll().filter(p => p.customerId === customerId);
  const programs = CustomerProgramStore.getByCustomer(customerId).map(cp => ({ pricePaid: cp.pricePaid, totalSessions: cp.totalSessions, usedSessions: usedSessionsFor(cp) }));
  const visits = collectVisitDates(customerId).length;
  const cycle = getCustomerVisitCycle(customerId);
  return computeCustomerValue({ payments, programs, visits, cycleDays: visits > 0 ? cycle.days : null });
}
