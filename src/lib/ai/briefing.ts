// src/lib/ai/briefing.ts — 경영 브리핑 컨텍스트 조립 (비코어, 153·158, GAP D-3). 내부 엔진 결과만 모아 briefingRule 서식으로 — AI 는 계산하지 않는다.
import { PaymentStore, CustomerStore, CustomerProgramStore, TreatmentLogStore, ProductStore, ReservationStore, StaffStore, SettingsStore } from '../store';
import { ExpenseStore } from '../expenseStore';
import { todayISO } from '../format';
import { COGS_CATEGORIES } from '../../types';
import { monthMetrics } from '../revenueMetricsRule';
import { monthlyTarget } from '../monthClose';
import { buildTodayTasks, getMonthlyKpis } from '../todayTasks';
import { monthlyKpis } from '../kpiRule';
import { buildSegmentIndex } from '../customerSegments';
import { buildCustomerStatsIndex } from '../customerStats';
import { isCountableCustomer } from '../customerScope';
import { isUpcomingReservation } from '../upcomingRule';
import { isLowStock } from '../stockRule';
import { localMonthOf } from '../revenueMetricsRule';
import { listCampaigns, sentKeysOf } from '../campaignStore';
import { buildSegmentFacts, segmentIdsFor } from '../savedSegments';
import type { CustomerFacts } from '../segmentFilterRule';
import { collectRawCandidates } from '../campaignTriggers';
import { selectCandidates, type Campaign } from '../campaignRule';
import { CAMPAIGN_PRESETS } from '../campaignPresets';
import { getStaffSchedule } from '../staffScheduleStore';
import { dayWindow, dayKeyOf } from '../staffScheduleRule';
import { toInterval, fromMinutes, type Interval } from '../schedulingRule';
import { availableStarts } from '../availabilityRule';
import { formatBriefing, targetPace, type BriefingInput, type BriefingCause, type BriefingContacts, type BriefingFreeSlot, type BriefingRecommendation } from './briefingRule';

export interface BriefingPermissions { salesOn: boolean; staffOn: boolean }
export type BriefingKind = 'month' | 'today';

const FREE_SLOT_DURATION_MIN = 60; // 빈 시간 기준 시술 길이
const FREE_SLOT_SHOW = 4;          // 직원당 보여줄 시작 시각 수
const RECOMMEND_MAX = 5;

/** 캠페인별 오늘 대상 수 — 켜진 캠페인만, 승인 전 수치 (158) */
/** 세그먼트를 쓰는 캠페인이 하나라도 켜져 있을 때만 사실을 1회 계산 — 아니면 전수 스캔 0회 (170 리뷰 M-2) */
function segmentFactsIfNeeded(campaigns: Campaign[]): Map<string, CustomerFacts> | undefined {
  return campaigns.some(c => c.enabled && c.segmentId) ? buildSegmentFacts() : undefined;
}

function campaignContacts(year: string, facts: Map<string, CustomerFacts> | undefined): BriefingContacts[] {
  return listCampaigns().filter(c => c.enabled).map(c => {
    const sel = selectCandidates(c, collectRawCandidates(c), sentKeysOf(c.id), year, segmentIdsFor(c.segmentId, facts));
    return { campaign: c.name, ready: sel.ready.length, skipped: sel.skipped.length };
  }).filter(c => c.ready > 0 || c.skipped > 0);
}

/** 이번 주 캠페인 추천 — 켜진 캠페인 + 아직 안 만든 기본 시나리오를 "지금 대상 수"로 줄 세운다(결정적, AI 는 문장만) (158) */
function campaignRecommendations(year: string, facts: Map<string, CustomerFacts> | undefined): BriefingRecommendation[] {
  const existing = listCampaigns();
  const names = new Set(existing.map(c => c.name));
  const out: BriefingRecommendation[] = [];
  for (const c of existing.filter(x => x.enabled)) {
    const n = selectCandidates(c, collectRawCandidates(c), sentKeysOf(c.id), year, segmentIdsFor(c.segmentId, facts)).ready.length;
    if (n > 0) out.push({ campaign: c.name, ready: n, exists: true });
  }
  for (const p of CAMPAIGN_PRESETS.filter(p => !names.has(p.name))) {
    const { key, group: _group, ...rest } = p;
    const virtual: Campaign = { ...rest, id: `preset:${key}`, createdAt: '', updatedAt: '' };
    const n = selectCandidates(virtual, collectRawCandidates(virtual), new Set(), year).ready.length;
    if (n > 0) out.push({ campaign: p.name, ready: n, exists: false });
  }
  return out.sort((a, b) => b.ready - a.ready).slice(0, RECOMMEND_MAX);
}

/** 오늘 직원별 빈 시작 시각 — 근무 창(근무표 또는 영업시간) 안에서 기존 예약·휴게와 겹치지 않는 칸, 지금 이후 (158) */
function freeSlotsToday(today: string, now: Date): BriefingFreeSlot[] {
  const st = SettingsStore.get();
  const day = dayKeyOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todays = ReservationStore.getAll().filter(r => r.date === today && r.status !== 'cancelled' && r.status !== 'noshow');
  const holiday = (st.holidays || []).includes(today); // 매장 휴일은 빈 시간 없음 (165 리뷰 L-2)
  return StaffStore.getAll().filter(s => s.isActive).map(s => {
    if (holiday) return { staff: s.id, slots: [], total: 0 };
    const w = dayWindow(getStaffSchedule(s.id), day, st.businessHours?.[day]);
    if (!w.work) return { staff: s.id, slots: [], total: 0 }; // 가명 키는 id — 동명이인이 한 가명으로 합쳐지지 않게 (165 리뷰 L-3)
    const busy: Interval[] = [...w.breaks];
    for (const r of todays) if (r.staffId === s.id) { const iv = toInterval(r.startTime, r.endTime); if (iv) busy.push(iv); }
    const starts = availableStarts({ openMin: w.work.startMin, closeMin: w.work.endMin, durationMin: FREE_SLOT_DURATION_MIN, busy, bufferBeforeMin: w.bufferBeforeMin, bufferAfterMin: w.bufferAfterMin, notBeforeMin: nowMin });
    return { staff: s.id, slots: starts.slice(0, FREE_SLOT_SHOW).map(fromMinutes), total: starts.length };
  });
}

/** 지난달 → 이달 운영 지표 변화(원인 후보) — kpiRule 을 두 달에 같은 입력으로 (158) */
function monthCauses(month: string, prevMonth: string, salesOn: boolean): BriefingCause[] {
  const today = todayISO();
  const stats = buildCustomerStatsIndex();
  const countable = new Set(CustomerStore.getAll().filter(isCountableCustomer).map(c => c.id));
  const upcoming = new Set<string>();
  for (const r of ReservationStore.getAll()) if (isUpcomingReservation(r, today)) upcoming.add(r.customerId);
  const visitDays = new Map<string, string[]>();
  for (const [id, days] of stats.visitDays ?? new Map<string, string[]>()) if (countable.has(id)) visitDays.set(id, days);
  const payments = PaymentStore.getAll().filter(p => p.customerId && countable.has(p.customerId));
  const cur = monthlyKpis({ month, visitDays, payments, upcomingByCustomer: upcoming });
  const prev = monthlyKpis({ month: prevMonth, visitDays, payments, upcomingByCustomer: upcoming });
  const newOf = (m: string) => CustomerStore.getAll().filter(c => isCountableCustomer(c) && localMonthOf(c.registeredAt || '') === m).length;
  const causes: BriefingCause[] = [
    { label: '방문 고객', current: cur.visitors, previous: prev.visitors, unit: '명' },
    { label: '재방문 고객', current: cur.returning, previous: prev.returning, unit: '명' },
    { label: '신규 등록', current: newOf(month), previous: newOf(prevMonth), unit: '명' },
  ];
  if (salesOn) causes.push({ label: '객단가', current: cur.avgTicket, previous: prev.avgTicket, unit: '원' });
  return causes;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildBriefingContext(perm: BriefingPermissions, kind: BriefingKind = 'month'): string {
  const now = new Date();
  const today = todayISO();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const customers = CustomerStore.getAll().filter(isCountableCustomer);
  const st = SettingsStore.get();
  const metrics = perm.salesOn && kind === 'month' ? monthMetrics({ // 오늘 할 일 브리핑은 매출 지표를 싣지 않는다(토큰 절약) (154 리뷰 L-7)
    month, today, payments: PaymentStore.getAll(), expenses: ExpenseStore.getAll(), programs: CustomerProgramStore.getAll(), logs: TreatmentLogStore.getAll(),
    customers, target: monthlyTarget(month), businessHours: st.businessHours, holidays: st.holidays, cogsCategories: [...COGS_CATEGORIES],
  }) : null;
  const kpiRaw = getMonthlyKpis();
  const kpi = perm.salesOn ? kpiRaw : { ...kpiRaw, avgTicket: null, monthRevenue: 0 }; // 객단가 = 월매출 ÷ 방문 — 직원 계정에 매출이 복원되지 않게 (154 리뷰 H-2)
  const tasks = buildTodayTasks({ customersOn: true, reservationsOn: true, productsOn: true, salesOn: perm.salesOn }).map(t => ({ label: t.label, count: t.count, detail: perm.salesOn ? t.detail : undefined }));
  const seg = buildSegmentIndex(buildCustomerStatsIndex());
  let churnHigh = 0, churnMedium = 0, loyal = 0, dormant = 0, atRisk = 0;
  for (const c of customers) {
    const v = seg.get(c.id);
    if (!v) continue;
    if (v.churn?.level === 'high') { churnHigh++; atRisk += v.atRisk90; }
    else if (v.churn?.level === 'medium') churnMedium++;
    if (v.rfm.segment === '충성' || v.rfm.segment === '우수') loyal++;
    if (v.rfm.segment === '휴면') dormant++;
  }
  const segments = { total: customers.length, churnHigh, churnMedium, loyal, dormant, newThisMonth: customers.filter(c => localMonthOf(c.registeredAt || '') === month).length, atRiskRevenue90: perm.salesOn ? atRisk : null }; // 매출 권한 없으면 위험 매출 줄 자체를 생략(0원 거짓 수치 방지) (154 리뷰 L-4)
  const lowStock = ProductStore.getAll().filter(isLowStock).map(p => ({ name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit || '개' }));
  // 직원별 이달 완료 예약·실결제 — 직원 권한(staff.manage)이 있을 때만, 실명은 briefingRule 이 가명으로
  let staff: BriefingInput['staff'] = [];
  if (perm.staffOn && perm.salesOn) {
    const done = ReservationStore.getAll().filter(r => r.status === 'completed' && r.date.startsWith(month));
    const pays = PaymentStore.getAll().filter(p => p.status === 'completed' && p.referenceId);
    const paidByRef = new Map<string, number>();
    for (const p of pays) paidByRef.set(p.referenceId as string, (paidByRef.get(p.referenceId as string) || 0) + p.amount);
    staff = StaffStore.getAll().filter(s => s.isActive).map(s => {
      const mine = done.filter(r => r.staffId === s.id);
      return { name: s.id, completed: mine.length, revenue: mine.reduce((sum, r) => sum + (paidByRef.get(r.id) || 0), 0) }; // 실명 대신 id 를 가명 키로 — 컨텍스트에 실명이 애초에 들어가지 않는다 (165 리뷰 L-3)
    }).filter(s => s.completed > 0);
  }
  // ── 158 경영비서 2차: 오늘 브리핑 = 연락할 고객·빈 시간 / 월 브리핑 = 목표 페이스·원인 후보·캠페인 추천(+연락할 고객)
  const segFacts = segmentFactsIfNeeded(listCampaigns());
  const contacts = campaignContacts(year, segFacts);
  const freeSlots = kind === 'today' ? freeSlotsToday(today, now) : undefined;
  const target = kind === 'month' && metrics && metrics.target && metrics.target > 0 ? targetPace({ target: metrics.target, revenue: metrics.total, daysElapsed: metrics.daysElapsed, daysInMonth: metrics.daysInMonth }) : null;
  const causes = kind === 'month' ? monthCauses(month, shiftMonth(month, -1), perm.salesOn) : undefined;
  const recommendations = kind === 'month' ? campaignRecommendations(year, segFacts) : undefined;
  return formatBriefing({ shopLabel: '우리 매장', today, month, metrics, kpi, tasks, segments, lowStock, staff, contacts, freeSlots, target, causes, recommendations });
}
