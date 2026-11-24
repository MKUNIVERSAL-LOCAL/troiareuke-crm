import { ProductStore, ReservationStore, PaymentStore } from './store';
import { buildSegmentIndex } from './customerSegments';
import { getRevisitDueCustomers } from './reminderEngine';
import { getProgramAlerts } from './programAlerts';
import { getUpcomingBirthdays } from './birthdayAlerts';
import { getPendingCompletionReservations } from './pendingCompletion';
import { getTomorrowReservations } from './reservationReminder';
import { isLowStock } from './stockRule';
import { buildCustomerStatsIndex } from './customerStats';
import { monthlyKpis, type MonthlyKpis } from './kpiRule';
import { toISO } from './revisitRule';

/**
 * 대시보드 "오늘 할 일" — 흩어진 알림 카드(회차권·생일·재방문·완료 누락·내일 예약·재고)와 136 의 이탈 위험을 **행동 목록**으로 모은다 (138, GAP D-1).
 * 숫자마다 그 고객 목록·화면으로 가는 길(href)을 둔다. 전부 0 이면 카드가 사라진다.
 */
export interface TodayTask { key: string; label: string; count: number; detail?: string; href: string; tone: 'urgent' | 'normal' }

export function buildTodayTasks(opts: { customersOn: boolean; reservationsOn: boolean; productsOn: boolean; salesOn: boolean }): TodayTask[] {
  const out: TodayTask[] = [];
  if (opts.customersOn) {
    const seg = buildSegmentIndex();
    let churn = 0, atRisk = 0;
    for (const v of seg.values()) if (v.churn?.level === 'high') { churn++; atRisk += v.atRisk90; }
    if (churn > 0) out.push({ key: 'churn', label: '이탈 위험 고객 연락', count: churn, detail: opts.salesOn && atRisk > 0 ? `90일 위험 매출 약 ${atRisk.toLocaleString('ko-KR')}원(예측)` : undefined, href: '/customers?churn=1', tone: 'urgent' });
    const revisit = getRevisitDueCustomers(0).length;
    if (revisit > 0) out.push({ key: 'revisit', label: '재방문 권장일 지난 고객 안내', count: revisit, href: '/customers?revisit=1', tone: 'normal' });
    const alerts = getProgramAlerts();
    if (alerts.length > 0) out.push({ key: 'program', label: '회차권 소진·만료 임박 재등록 상담', count: alerts.length, href: '/customers?programAlert=1', tone: 'normal' });
    const birthdays = getUpcomingBirthdays().length;
    if (birthdays > 0) out.push({ key: 'birthday', label: '생일 임박 고객 축하', count: birthdays, href: '/messaging', tone: 'normal' });
  }
  if (opts.reservationsOn) {
    const pending = getPendingCompletionReservations().length;
    if (pending > 0) out.push({ key: 'pending', label: '지난 예약 완료·노쇼 처리', count: pending, href: '/reservations', tone: 'urgent' });
    const tomorrow = getTomorrowReservations().length;
    if (tomorrow > 0) out.push({ key: 'tomorrow', label: '내일 예약 확인 안내', count: tomorrow, href: '/reservations', tone: 'normal' });
  }
  if (opts.productsOn) {
    const low = ProductStore.getAll().filter(isLowStock).length;
    if (low > 0) out.push({ key: 'stock', label: '재고 부족 제품 입고', count: low, href: '/products', tone: 'normal' });
  }
  return out;
}

/** 이달 운영 지표 — 규칙은 kpiRule(순수) */
export function getMonthlyKpis(): MonthlyKpis {
  const today = toISO(new Date());
  const month = today.slice(0, 7);
  const stats = buildCustomerStatsIndex();
  const upcoming = new Set<string>();
  for (const r of ReservationStore.getAll()) if (r.date >= today && r.status !== 'cancelled' && r.status !== 'noshow') upcoming.add(r.customerId);
  return monthlyKpis({ month, visitDays: stats.visitDays ?? new Map(), payments: PaymentStore.getAll(), upcomingByCustomer: upcoming });
}
