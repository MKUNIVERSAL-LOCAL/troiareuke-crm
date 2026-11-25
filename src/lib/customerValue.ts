import { PaymentStore, CustomerProgramStore } from './store';
import { computeCustomerValue, type CustomerValue } from './customerValueRule';
import { usedSessionsFor } from './programSessions';
import { collectVisitDates } from './customerStats';
import { getCustomerVisitCycle } from './reminderEngine';

/** 고객 한 명의 가치 지표 — 규칙은 customerValueRule(순수), 여기서는 저장소에서 모아 넘긴다 (137, GAP C-7) */
export function getCustomerValue(customerId: string): CustomerValue {
  const payments = PaymentStore.getAll().filter(p => p.customerId === customerId);
  const programs = CustomerProgramStore.getByCustomer(customerId).map(cp => {
    const linked = payments.filter(p => p.type === 'program' && p.referenceId === cp.id);
    const refunded = linked.length > 0 && linked.every(p => p.status !== 'completed'); // 연결 결제가 전부 환불·대기면 실현 없음 (139 #H1). 연결 결제가 없는 옛 데이터는 종전대로
    return { pricePaid: cp.pricePaid, totalSessions: cp.totalSessions, usedSessions: usedSessionsFor(cp), refunded };
  });
  const visits = collectVisitDates(customerId).length;
  const cycle = getCustomerVisitCycle(customerId);
  return computeCustomerValue({ payments, programs, visits, cycleDays: cycle.basis === 'personal' ? cycle.days : null }); // 매장 기본 주기로는 연간 기대를 만들지 않는다 (139 #M4)
}
