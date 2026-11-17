// ═══════════════════════════════════════════════════════════════
// staffPerformance — 직원별 월 실적 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 인센티브·월말 정리를 위해 직원별로 한 달 실적을 모은다. 결제(Payment)에는 담당 직원이 없어 금액은
// "완료 예약의 예약액"과 "제품 판매(담당 직원 기록분)"으로 집계한다 — 실제 입금액이 아님을 화면에 명시한다.
// 예약은 staffId, 시술·제품 판매는 staffName으로 연결된다(기록 구조상). 취소·노쇼는 제외.
// ═══════════════════════════════════════════════════════════════

import { StaffStore, ReservationStore, TreatmentLogStore, ProductSaleStore } from './store';
import { thisYearMonthISO, formatPrice } from './format';

export interface StaffMonthStat {
  staffId: string;
  name: string;
  color: string;
  isActive: boolean;
  /** 완료 예약 건수 */
  completedReservations: number;
  /** 완료 예약의 예약액 합 */
  reservationAmount: number;
  /** 예정(확정·대기) 예약 건수 — 이달 남은 일정 */
  upcomingReservations: number;
  /** 시술 기록 건수 */
  treatments: number;
  /** 제품 판매 금액 합 */
  productAmount: number;
  /** 응대 고객 수 (완료 예약 + 시술 고객 중복 제거) */
  customers: number;
}

export interface StaffMonthReport {
  yearMonth: string;
  rows: StaffMonthStat[];
  /** 담당 직원이 비어 있거나 퇴사·삭제된 직원의 기록 — 표에 나오지 않는 건수 안내용 */
  unassigned: { reservations: number; treatments: number; productSales: number };
}

/** 선택 가능한 달 — 이달부터 과거 n개월 (YYYY-MM) */
export function recentMonths(n = 6): string[] {
  const [y, m] = thisYearMonthISO().split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function getStaffMonthReport(yearMonth = thisYearMonthISO()): StaffMonthReport {
  const inMonth = (date: string | undefined) => !!date && date.startsWith(yearMonth);
  const staff = StaffStore.getAll();
  const byId = new Map(staff.map(s => [s.id, s]));
  const byName = new Map(staff.map(s => [s.name, s]));

  const stats = new Map<string, StaffMonthStat>();
  const served = new Map<string, Set<string>>();
  const ensure = (id: string): StaffMonthStat => {
    let s = stats.get(id);
    if (!s) {
      const st = byId.get(id)!;
      s = { staffId: id, name: st.name, color: st.color, isActive: st.isActive, completedReservations: 0, reservationAmount: 0, upcomingReservations: 0, treatments: 0, productAmount: 0, customers: 0 };
      stats.set(id, s);
      served.set(id, new Set());
    }
    return s;
  };
  const unassigned = { reservations: 0, treatments: 0, productSales: 0 };

  for (const r of ReservationStore.getAll()) {
    if (!inMonth(r.date) || r.status === 'cancelled' || r.status === 'noshow') continue;
    if (!byId.has(r.staffId)) { unassigned.reservations++; continue; }
    const s = ensure(r.staffId);
    if (r.status === 'completed') {
      s.completedReservations++;
      s.reservationAmount += r.totalPrice || 0;
      if (r.customerId) served.get(r.staffId)!.add(r.customerId);
    } else {
      s.upcomingReservations++;
    }
  }

  for (const t of TreatmentLogStore.getAll()) {
    if (!inMonth(t.treatmentDate)) continue;
    const st = t.staffName ? byName.get(t.staffName) : undefined;
    if (!st) { unassigned.treatments++; continue; }
    const s = ensure(st.id);
    s.treatments++;
    served.get(st.id)!.add(t.customerId);
  }

  for (const sale of ProductSaleStore.getAll()) {
    if (!inMonth(sale.saleDate)) continue;
    const st = sale.staffName ? byName.get(sale.staffName) : undefined;
    if (!st) { unassigned.productSales++; continue; }
    ensure(st.id).productAmount += sale.totalPrice || 0;
  }

  // 기록이 없는 재직 직원도 0으로 표에 올린다(누락이 아니라 실적 0임을 보이도록)
  for (const st of staff) if (st.isActive) ensure(st.id);
  for (const [id, s] of stats) s.customers = served.get(id)!.size;

  const rows = [...stats.values()].sort((a, b) =>
    (b.reservationAmount + b.productAmount) - (a.reservationAmount + a.productAmount) || b.treatments - a.treatments || a.name.localeCompare(b.name, 'ko'));
  return { yearMonth, rows, unassigned };
}

/** 오너 보고용 문구 — 복사/공유 */
export function buildStaffReportMessage(report: StaffMonthReport): string {
  const [y, m] = report.yearMonth.split('-');
  const lines = [`[${y}년 ${Number(m)}월 직원별 실적]`];
  for (const r of report.rows) {
    lines.push(`• ${r.name}: 완료 예약 ${r.completedReservations}건(${formatPrice(r.reservationAmount)}) · 시술 ${r.treatments}건 · 제품 ${formatPrice(r.productAmount)} · 고객 ${r.customers}명`);
  }
  const u = report.unassigned;
  if (u.reservations || u.treatments || u.productSales) {
    lines.push(`• 담당 미지정/퇴사 직원 기록: 예약 ${u.reservations}건 · 시술 ${u.treatments}건 · 제품 판매 ${u.productSales}건`);
  }
  lines.push('※ 예약액·제품 판매액 기준(실입금과 다를 수 있음), 취소·노쇼 제외');
  return lines.join('\n');
}
