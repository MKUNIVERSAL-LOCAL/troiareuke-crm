import { ProductStore, ReservationStore, PaymentStore, StaffStore, SettingsStore } from './store';
import { buildSegmentIndex } from './customerSegments';
import { getRevisitDueCustomers } from './reminderEngine';
import { getProgramAlerts } from './programAlerts';
import { CustomerStore } from './store';
import { parseISODate } from './format';
import { isCountableCustomer } from './customerScope';
import { isUpcomingReservation } from './upcomingRule';
import { getPendingCompletionReservations } from './pendingCompletion';
import { getTomorrowReservations } from './reservationReminder';
import { isLowStock } from './stockRule';
import { buildCustomerStatsIndex } from './customerStats';
import { monthlyKpis, noRebookIds, type KpiInput, type MonthlyKpis } from './kpiRule';
import { toISO } from './revisitRule';
import { selectEnabledCampaigns, type CampaignSelection } from './campaignCandidates';
import { utilization, type Utilization, type UtilizationDay } from './utilizationRule';
import { getStaffSchedule } from './staffScheduleStore';
import { dayWindow, dayKeyOf } from './staffScheduleRule';

/**
 * 대시보드 "오늘 할 일" — 흩어진 알림 카드(회차권·생일·재방문·완료 누락·내일 예약·재고)와 136 의 이탈 위험을 **행동 목록**으로 모은다 (138, GAP D-1).
 * 숫자마다 그 고객 목록·화면으로 가는 길(href)을 둔다. 전부 0 이면 카드가 사라진다.
 */
export interface TodayTask { key: string; label: string; count: number; detail?: string; href: string; tone: 'urgent' | 'normal' }

export interface TodayTaskOptions { customersOn: boolean; reservationsOn: boolean; productsOn: boolean; salesOn: boolean; messagingOn: boolean }

/** @param campaigns 이미 고른 캠페인 대상(브리핑처럼 같은 화면에서 또 쓰는 쪽이 넘긴다) — 없으면 여기서 1회 계산 (178 리뷰 M-3) */
export function buildTodayTasks(opts: TodayTaskOptions, campaigns?: CampaignSelection[]): TodayTask[] {
  const out: TodayTask[] = [];
  if (opts.customersOn) {
    const stats = buildCustomerStatsIndex(); // 이탈 위험·재방문 권장이 같은 인덱스를 쓴다 (139 #M8)
    const seg = buildSegmentIndex(stats);
    let churn = 0, atRisk = 0;
    for (const v of seg.values()) if (v.churn?.level === 'high') { churn++; atRisk += v.atRisk90; }
    if (churn > 0) out.push({ key: 'churn', label: '이탈 위험 고객 연락', count: churn, detail: opts.salesOn && atRisk > 0 ? `90일 위험 매출 약 ${atRisk.toLocaleString('ko-KR')}원(예측)` : undefined, href: '/customers?churn=1', tone: 'urgent' });
    const revisit = getRevisitDueCustomers(0, stats).length;
    if (revisit > 0) out.push({ key: 'revisit', label: '재방문 권장일 지난 고객 안내', count: revisit, href: '/customers?revisit=1', tone: 'normal' });
    const alerts = getProgramAlerts();
    if (alerts.length > 0) out.push({ key: 'program', label: '회차권 소진·만료 임박 재등록 상담', count: alerts.length, href: '/customers?programAlert=1', tone: 'normal' });
    // 발송 화면의 생일 세그먼트(이번 달)와 같은 정의·같은 인원으로 — 7일 기준 숫자를 보여 주고 다른 인원이 걸리던 것 (139 #M2)
    if (opts.messagingOn) { // 발송 화면으로 가는 줄은 발송 모듈이 켜진 매장에만 (178 리뷰 L-3)
      const month = new Date().getMonth();
      const birthdays = CustomerStore.getAll().filter(c => isCountableCustomer(c) && c.birthDate && parseISODate(c.birthDate).getMonth() === month).length;
      if (birthdays > 0) out.push({ key: 'birthday', label: '이번 달 생일 고객 축하 문자', count: birthdays, href: '/messaging?segment=birthday', tone: 'normal' });
    }
  }
  if (opts.reservationsOn) {
    const pending = getPendingCompletionReservations().length;
    if (pending > 0) out.push({ key: 'pending', label: '지난 예약 완료·노쇼 처리', count: pending, href: '/reservations', tone: 'urgent' });
    const tomorrow = getTomorrowReservations().length;
    if (tomorrow > 0) out.push({ key: 'tomorrow', label: '내일 예약 확인 안내', count: tomorrow, href: '/reservations', tone: 'normal' });
  }
  if (opts.customersOn && opts.reservationsOn) {
    // 이달 방문했지만 다음 예약이 없는 고객 — 재예약률 타일의 "빠진 사람"에게 바로 연락 (184, GAP D-1)
    const noRebook = getNoRebookCustomerIds().size;
    if (noRebook > 0) out.push({ key: 'norebook', label: '이달 방문 뒤 다음 예약 없는 고객 재예약 권유', count: noRebook, href: '/customers?norebook=1', tone: 'normal' });
  }
  if (opts.productsOn) {
    const low = ProductStore.getAll().filter(isLowStock).length;
    if (low > 0) out.push({ key: 'stock', label: '재고 부족 제품 입고', count: low, href: '/products', tone: 'normal' });
  }
  if (opts.customersOn && opts.messagingOn) {
    // 켜진 캠페인의 오늘 승인 전 대상 합계 — 브리핑 "연락할 고객"·실행 창과 같은 공용 선별(campaignCandidates) (177, 178 리뷰 M-2·M-3)
    const sel = campaigns ?? selectEnabledCampaigns();
    const ready = sel.reduce((sum, x) => sum + x.selection.ready.length, 0);
    if (ready > 0) out.push({ key: 'campaign', label: '캠페인 발송 대상 확인·승인', count: ready, detail: `${sel.length}개 캠페인`, href: '/messaging', tone: 'normal' });
  }
  return out;
}

/** 이달 지표 입력 — 지표·재예약 권유 목록이 같은 분모(집계 대상 고객·방문일·다음 예약)를 쓴다 (184) */
function kpiInput(): KpiInput {
  const today = toISO(new Date());
  const month = today.slice(0, 7);
  const stats = buildCustomerStatsIndex();
  const upcoming = new Set<string>();
  for (const r of ReservationStore.getAll()) if (isUpcomingReservation(r, today)) upcoming.add(r.customerId); // (139 #H3)
  // 샘플·익명화·삭제 고객의 남은 기록이 방문 고객·재방문율에 들어가지 않게 — 집계 대상 고객만 (139 #M6)
  const countable = new Set(CustomerStore.getAll().filter(isCountableCustomer).map(c => c.id));
  const visitDays = new Map<string, string[]>();
  for (const [id, days] of stats.visitDays ?? new Map<string, string[]>()) if (countable.has(id)) visitDays.set(id, days);
  return { month, visitDays, payments: PaymentStore.getAll().filter(p => p.customerId && countable.has(p.customerId)), upcomingByCustomer: upcoming };
}

/** 이달 운영 지표 — 규칙은 kpiRule(순수) */
export function getMonthlyKpis(): MonthlyKpis {
  return monthlyKpis(kpiInput());
}

/** 이달 방문했지만 다음 예약이 없는 고객 — 대시보드 재예약률 타일·오늘 할 일에서 고객 목록(?norebook=1)으로 (184) */
export function getNoRebookCustomerIds(): Set<string> {
  return new Set(noRebookIds(kpiInput()));
}

/** 이달(오늘까지) 가동률 — 날마다 활성 직원의 근무 창(근무표 또는 영업시간, 매장 휴일은 창 없음) 대비 확정·완료 예약 시간. 규칙은 utilizationRule(순수) (180, GAP R-10) */
export function getMonthUtilization(): Utilization {
  const now = new Date();
  const todayStr = toISO(now);
  const st = SettingsStore.get();
  const holidays = new Set(st.holidays || []);
  const staff = StaffStore.getAll().filter(s => s.isActive);
  const days: UtilizationDay[] = [];
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); ; d.setDate(d.getDate() + 1)) {
    const date = toISO(d);
    if (date > todayStr) break;
    const key = dayKeyOf(d);
    days.push({ date, windows: holidays.has(date) ? [] : staff.map(s => { const w = dayWindow(getStaffSchedule(s.id), key, st.businessHours?.[key]); return { work: w.work, breaks: w.breaks }; }) });
  }
  return utilization({ days, reservations: ReservationStore.getAll() });
}
