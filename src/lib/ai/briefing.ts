// src/lib/ai/briefing.ts — 경영 브리핑 컨텍스트 조립 (비코어, 153, GAP D-3). 내부 엔진 결과만 모아 briefingRule 서식으로 — AI 는 계산하지 않는다.
import { PaymentStore, CustomerStore, CustomerProgramStore, TreatmentLogStore, ProductStore, ReservationStore, StaffStore, SettingsStore } from '../store';
import { ExpenseStore } from '../expenseStore';
import { todayISO } from '../format';
import { COGS_CATEGORIES } from '../../types';
import { monthMetrics } from '../revenueMetricsRule';
import { monthlyTarget } from '../monthClose';
import { buildTodayTasks, getMonthlyKpis } from '../todayTasks';
import { buildSegmentIndex } from '../customerSegments';
import { buildCustomerStatsIndex } from '../customerStats';
import { isCountableCustomer } from '../customerScope';
import { isLowStock } from '../stockRule';
import { localMonthOf } from '../revenueMetricsRule';
import { formatBriefing, type BriefingInput } from './briefingRule';

export interface BriefingPermissions { salesOn: boolean; staffOn: boolean }

export function buildBriefingContext(perm: BriefingPermissions): string {
  const today = todayISO();
  const month = today.slice(0, 7);
  const customers = CustomerStore.getAll().filter(isCountableCustomer);
  const st = SettingsStore.get();
  const metrics = perm.salesOn ? monthMetrics({
    month, today, payments: PaymentStore.getAll(), expenses: ExpenseStore.getAll(), programs: CustomerProgramStore.getAll(), logs: TreatmentLogStore.getAll(),
    customers, target: monthlyTarget(month), businessHours: st.businessHours, holidays: st.holidays, cogsCategories: [...COGS_CATEGORIES],
  }) : null;
  const kpi = getMonthlyKpis();
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
  const segments = { total: customers.length, churnHigh, churnMedium, loyal, dormant, newThisMonth: customers.filter(c => localMonthOf(c.registeredAt || '') === month).length, atRiskRevenue90: perm.salesOn ? atRisk : 0 };
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
      return { name: s.name, completed: mine.length, revenue: mine.reduce((sum, r) => sum + (paidByRef.get(r.id) || 0), 0) };
    }).filter(s => s.completed > 0);
  }
  return formatBriefing({ shopLabel: '우리 매장', today, month, metrics, kpi, tasks, segments, lowStock, staff });
}
