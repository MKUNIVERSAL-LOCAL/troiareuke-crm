// campaignTriggers — 캠페인 트리거별 원 후보 산출(저장소 읽기, 비코어, 156, GAP M-3). 규칙은 campaignRule.ts(순수)
// 숫자·날짜는 모두 내부 엔진(reminderEngine·programAlerts·customerStats)이 계산한다. 샘플·익명화 고객은 제외.
import { CustomerStore, ReservationStore, SettingsStore, PaymentStore } from './store';
import { addDays, daysBetween, toISO } from './revisitRule';
import { getRevisitDueCustomers } from './reminderEngine';
import { getProgramAlerts } from './programAlerts';
import { buildCustomerStatsIndex, statsFor, collectVisitDates } from './customerStats';
import { isUpcomingReservation } from './upcomingRule';
import { isCountableCustomer } from './customerScope';
import { consentOf } from './marketingConsent';
import { formatDate, formatPrice } from './format';
import type { Customer } from '../types';
import type { Campaign, RawCandidate } from './campaignRule';

function base(c: Customer, reason: string, eventId: string, vars: Record<string, string> = {}): RawCandidate {
  return { customerId: c.id, customerName: c.name, phone: c.phone || '', consent: consentOf(c), reason, eventId, vars: { '{매장명}': SettingsStore.get().name || '', ...vars } };
}

/** 오늘 기준 캠페인의 원 후보 — 멱등키·동의·번호 걸러내기는 selectCandidates 가 한다 */
export function collectRawCandidates(c: Pick<Campaign, 'trigger' | 'days'>, today = new Date()): RawCandidate[] {
  const todayISO = toISO(today);
  const customers = CustomerStore.getAll().filter(isCountableCustomer);
  const byId = new Map(customers.map(x => [x.id, x]));
  switch (c.trigger) {
    case 'reservation_tomorrow': {
      const tomorrow = addDays(todayISO, 1);
      return ReservationStore.getAll()
        .filter(r => r.date === tomorrow && (r.status === 'confirmed' || r.status === 'pending'))
        .flatMap(r => {
          const cu = byId.get(r.customerId);
          return cu ? [base(cu, `내일 ${r.startTime} 예약`, r.id, { '{예약일시}': `${formatDate(r.date)} ${r.startTime}`, '{시술명}': r.services.map(s => s.serviceName).join(', ') })] : [];
        });
    }
    case 'birthday': {
      const y = today.getFullYear();
      return customers.flatMap(cu => {
        if (!cu.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(cu.birthDate)) return [];
        const mmdd = cu.birthDate.slice(5);
        const thisYear = `${y}-${mmdd}`;
        const bday = thisYear >= todayISO ? thisYear : `${y + 1}-${mmdd}`; // 올해 생일이 지났으면 내년
        const left = daysBetween(todayISO, bday);
        return left >= 0 && left <= c.days ? [base(cu, left === 0 ? '오늘 생일' : `${left}일 뒤 생일`, bday.slice(0, 4))] : [];
      });
    }
    case 'novisit': {
      const stats = buildCustomerStatsIndex();
      const upcoming = new Set(ReservationStore.getAll().filter(r => isUpcomingReservation(r, todayISO)).map(r => r.customerId));
      return customers.flatMap(cu => {
        const last = statsFor(cu, stats).lastVisitDate ?? cu.lastVisitDate;
        if (!last || upcoming.has(cu.id)) return [];
        const d = daysBetween(last, todayISO);
        return d >= c.days ? [base(cu, `${d}일 미방문`, last, { '{마지막방문일}': formatDate(last) })] : [];
      });
    }
    case 'revisit_due':
      return getRevisitDueCustomers().flatMap(d => (byId.has(d.customer.id) ? [base(d.customer, `권장일 ${d.overdueDays}일 지남`, d.dueDate, { '{마지막방문일}': d.lastVisit ? formatDate(d.lastVisit) : '' })] : []));
    case 'first_visit_followup': {
      const stats = buildCustomerStatsIndex();
      return customers.flatMap(cu => {
        const s = statsFor(cu, stats);
        if (s.totalVisits !== 1 || !s.lastVisitDate) return [];
        const d = daysBetween(s.lastVisitDate, todayISO);
        return d >= c.days && d < c.days + 7 ? [base(cu, `첫 방문 ${d}일 뒤`, s.lastVisitDate, { '{마지막방문일}': formatDate(s.lastVisitDate) })] : []; // 7일 창 — 매일 실행하지 않아도 놓치지 않게
      });
    }
    case 'program_expiring':
      return getProgramAlerts(today)
        .filter(a => (a.reason === 'expiring' && a.daysToExpiry !== null && a.daysToExpiry <= c.days) || a.reason === 'expired')
        .flatMap(a => (byId.has(a.customer.id) ? [base(a.customer, a.reason === 'expired' ? '회차권 만료' : `만료 ${a.daysToExpiry}일 전`, a.program.id, { '{프로그램명}': a.programLabel, '{만료일}': a.program.expiryDate ? formatDate(a.program.expiryDate) : '', '{잔여회차}': a.remaining === null ? '' : String(a.remaining) })] : []));
    case 'reservation_today':
      return ReservationStore.getAll()
        .filter(r => r.date === todayISO && (r.status === 'confirmed' || r.status === 'pending'))
        .flatMap(r => { const cu = byId.get(r.customerId); return cu ? [base(cu, `오늘 ${r.startTime} 예약`, r.id, { '{예약일시}': `${formatDate(r.date)} ${r.startTime}`, '{시술명}': r.services.map(s => s.serviceName).join(', ') })] : []; });
    case 'after_visit': {
      const target = addDays(todayISO, -c.days);
      return customers.flatMap(cu => (collectVisitDates(cu.id).includes(target) ? [base(cu, `${c.days}일 전 방문`, target, { '{마지막방문일}': formatDate(target) })] : []));
    }
    case 'noshow_followup': {
      const yesterday = addDays(todayISO, -1);
      return ReservationStore.getAll()
        .filter(r => r.date === yesterday && r.status === 'noshow')
        .flatMap(r => { const cu = byId.get(r.customerId); return cu ? [base(cu, `어제 ${r.startTime} 노쇼`, r.id, { '{예약일시}': `${formatDate(r.date)} ${r.startTime}`, '{시술명}': r.services.map(s => s.serviceName).join(', ') })] : []; });
    }
    case 'after_payment': {
      const yesterday = addDays(todayISO, -1);
      return PaymentStore.getAll()
        .filter(p => p.paymentDate === yesterday && p.status === 'completed' && p.customerId && p.amount > 0)
        .flatMap(p => { const cu = byId.get(p.customerId!); return cu ? [base(cu, `어제 ${formatPrice(p.amount)} 결제`, p.id, { '{결제금액}': formatPrice(p.amount) })] : []; });
    }
    case 'program_low':
      return getProgramAlerts(today)
        .filter(a => a.reason === 'low' || a.reason === 'exhausted')
        .flatMap(a => (byId.has(a.customer.id) ? [base(a.customer, a.reason === 'exhausted' ? '회차 소진' : '잔여 1회', a.program.id, { '{프로그램명}': a.programLabel, '{잔여회차}': a.remaining === null ? '' : String(a.remaining), '{만료일}': a.program.expiryDate ? formatDate(a.program.expiryDate) : '' })] : []));
  }
}
