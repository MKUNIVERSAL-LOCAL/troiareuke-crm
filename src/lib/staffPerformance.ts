// ═══════════════════════════════════════════════════════════════
// staffPerformance — 직원별 월 실적 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 인센티브·월말 정리를 위해 직원별로 한 달 실적을 모은다. 결제(Payment)에는 담당 직원이 없어 금액은
// "완료 처리된 예약의 예약액"과 "제품 판매(담당 직원 기록분)"으로 집계한다 — 실제 입금액이 아님을 화면에 명시한다.
// 예약은 staffId, 시술·제품 판매는 staffName으로 연결된다(기록 구조상). 취소·노쇼는 제외.
// 이름 연결의 함정: 같은 이름의 재직 직원이 둘이면 누구 기록인지 알 수 없어 '구분 불가'로 센다(퇴사자와 겹치면 재직자 우선).
// 직원 이름을 바꾸면 시술 기록은 Staff 화면이 함께 고치지만(TreatmentLogStore.update), 제품 판매는 코어에 수정 API가 없어 옛 이름으로 남는다.
// ═══════════════════════════════════════════════════════════════

import { StaffStore, ReservationStore, TreatmentLogStore, ProductSaleStore, PaymentStore } from './store';
import { thisYearMonthISO, todayISO, formatPrice } from './format';
import { canceledSaleIds } from './saleCancel';
import { staffAliases } from './staffAliases';

export interface StaffMonthStat {
  staffId: string;
  name: string;
  color: string;
  isActive: boolean;
  /** 완료 처리된 예약 건수 */
  completedReservations: number;
  /** 완료 처리된 예약의 예약액 합 */
  reservationAmount: number;
  /** 완료 예약에 연결된(referenceId) 완료 결제의 합 — 회차권 차감·할인·환불이 반영된 실제 입금 (금액 감사 2026-11-20) */
  paidAmount: number;
  /** 아직 오지 않은 예약(확정·대기, 오늘 포함) — 남은 일정 */
  upcomingReservations: number;
  /** 날짜는 지났는데 완료 처리가 안 된 예약 — 완료 처리해야 예약액에 반영된다 */
  pendingCompletion: number;
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
  /** 표에 넣지 못한 기록 — 안내용 */
  unassigned: {
    /** 담당 직원이 삭제된 예약 */
    deletedStaffReservations: number;
    /** 담당 이름이 비어 있거나 어느 직원과도 맞지 않는 시술·제품 판매 */
    nameMismatch: number;
    /** 같은 이름의 재직 직원이 둘 이상이라 나눌 수 없는 시술·제품 판매 */
    ambiguous: number;
  };
  /** 완료 처리 안 된 지난 예약 합계(전 직원) */
  pendingCompletionTotal: number;
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
  const today = todayISO();
  const inMonth = (date: string | undefined) => !!date && date.startsWith(yearMonth);
  const staff = StaffStore.getAll();
  const byId = new Map(staff.map(s => [s.id, s]));
  // 이름 → 직원. 재직자 우선, 재직자끼리 겹치면 구분 불가
  const byName = new Map<string, (typeof staff)[number]>();
  const ambiguousNames = new Set<string>();
  for (const s of staff) {
    const key = s.name.trim();
    const existing = byName.get(key);
    if (!existing) { byName.set(key, s); continue; }
    if (existing.isActive && s.isActive) ambiguousNames.add(key);
    else if (!existing.isActive && s.isActive) byName.set(key, s);
  }
  // 옛 이름(직원 이름 변경 이력) — 제품 판매 행은 옛 담당자 이름으로 남으므로 별칭으로 찾는다. 현재 이름과 겹치면 현재 이름 우선 (11차 #M2)
  for (const [id, names] of Object.entries(staffAliases())) {
    const st = byId.get(id);
    if (!st) continue;
    for (const raw of names) {
      const key = raw.trim();
      if (!key) continue;
      const cur = byName.get(key);
      if (!cur) byName.set(key, st);
      else if (cur.id !== st.id) ambiguousNames.add(key); // 옛 이름을 지금 다른 직원이 쓰면 "구분 불가"로 — 신입 동명이인에게 과거 실적이 넘어가지 않게 (리뷰 #M8)
    }
  }
  const resolveName = (raw: string | undefined): { staff?: (typeof staff)[number]; ambiguous: boolean } => {
    const key = (raw || '').trim();
    if (!key) return { ambiguous: false };
    if (ambiguousNames.has(key)) return { ambiguous: true };
    return { staff: byName.get(key), ambiguous: false };
  };

  const stats = new Map<string, StaffMonthStat>();
  const served = new Map<string, Set<string>>();
  const ensure = (id: string): StaffMonthStat => {
    let s = stats.get(id);
    if (!s) {
      const st = byId.get(id)!;
      s = { staffId: id, name: st.name, color: st.color, isActive: st.isActive, completedReservations: 0, reservationAmount: 0, paidAmount: 0, upcomingReservations: 0, pendingCompletion: 0, treatments: 0, productAmount: 0, customers: 0 };
      stats.set(id, s);
      served.set(id, new Set());
    }
    return s;
  };
  const unassigned = { deletedStaffReservations: 0, nameMismatch: 0, ambiguous: 0 };

  // 예약 id → 그 예약에 연결된 완료 결제 합 (예약 완료 처리·시술 기록의 결제 등록이 referenceId로 묶인다)
  const paidByReservation = new Map<string, number>();
  for (const p of PaymentStore.getAll()) {
    if (p.status !== 'completed' || !p.referenceId) continue;
    paidByReservation.set(p.referenceId, (paidByReservation.get(p.referenceId) || 0) + p.amount);
  }
  for (const r of ReservationStore.getAll()) {
    if (!inMonth(r.date) || r.status === 'cancelled' || r.status === 'noshow') continue;
    if (!byId.has(r.staffId)) { unassigned.deletedStaffReservations++; continue; }
    const s = ensure(r.staffId);
    if (r.status === 'completed') {
      s.completedReservations++;
      s.reservationAmount += r.totalPrice || 0;
      s.paidAmount += paidByReservation.get(r.id) || 0;
      if (r.customerId) served.get(r.staffId)!.add(r.customerId);
    } else if (r.date >= today) {
      s.upcomingReservations++;
    } else {
      s.pendingCompletion++;
    }
  }

  for (const t of TreatmentLogStore.getAll()) {
    if (!inMonth(t.treatmentDate)) continue;
    const { staff: st, ambiguous } = resolveName(t.staffName);
    if (ambiguous) { unassigned.ambiguous++; continue; }
    if (!st) { unassigned.nameMismatch++; continue; }
    const s = ensure(st.id);
    s.treatments++;
    served.get(st.id)!.add(t.customerId);
  }

  const canceled = canceledSaleIds(PaymentStore.getAll()); // 취소(환불)된 판매는 실적이 아니다 — 111 뒤로 행이 남아 실적이 부풀었다 (리뷰 2026-11-23)
  for (const sale of ProductSaleStore.getAll()) {
    if (!inMonth(sale.saleDate) || canceled.has(sale.id)) continue;
    const { staff: st, ambiguous } = resolveName(sale.staffName);
    if (ambiguous) { unassigned.ambiguous++; continue; }
    if (!st) { unassigned.nameMismatch++; continue; }
    ensure(st.id).productAmount += sale.totalPrice || 0;
  }

  // 기록이 없는 재직 직원도 0으로 표에 올린다(누락이 아니라 실적 0임을 보이도록)
  for (const st of staff) if (st.isActive) ensure(st.id);
  for (const [id, s] of stats) s.customers = served.get(id)!.size;

  const rows = [...stats.values()].sort((a, b) =>
    (b.reservationAmount + b.productAmount) - (a.reservationAmount + a.productAmount) || b.treatments - a.treatments || a.name.localeCompare(b.name, 'ko'));
  const pendingCompletionTotal = rows.reduce((n, r) => n + r.pendingCompletion, 0);
  return { yearMonth, rows, unassigned, pendingCompletionTotal };
}

/** 표 아래·보고 문구에 함께 붙는 주의 문구 */
export function staffReportCaveats(report: StaffMonthReport): string[] {
  const out: string[] = [];
  const u = report.unassigned;
  if (report.pendingCompletionTotal > 0) out.push(`완료 처리되지 않은 지난 예약 ${report.pendingCompletionTotal}건은 예약액에 들어가지 않았습니다 — 예약 화면에서 완료 처리하면 반영됩니다.`);
  if (u.deletedStaffReservations > 0) out.push(`삭제된 직원의 예약 ${u.deletedStaffReservations}건은 표에 없습니다.`);
  if (u.nameMismatch > 0) out.push(`담당자가 비어 있거나 현재 직원 이름과 일치하지 않는 시술·제품 판매 ${u.nameMismatch}건은 표에 포함되지 않았습니다 (이름을 변경한 직원의 과거 제품 판매 포함).`);
  if (u.ambiguous > 0) out.push(`같은 이름의 재직 직원이 둘 이상이라 나누지 못한 시술·제품 판매 ${u.ambiguous}건이 있습니다.`);
  return out;
}

/** 보고 문구에 함께 넣을 수당 정보 (233·234) — 화면이 비율 설정을 들고 있으므로 주입받는다 */
export interface StaffReportCommission {
  /** 그 직원 수당 합계(원) */
  amountOf: (staffId: string) => number;
  /** 그 직원에게 적용된 비율 설명 */
  describeOf: (staffId: string) => string;
  /** 전 직원 수당 합계 */
  total: number;
  /** 수당 한계 문구 */
  caveats: string[];
}

/** 오너 보고용 문구 — 복사/공유. 수당 비율을 설정한 매장은 수당도 함께 들어간다(리뷰 H-3: 표만 보고는 검증이 안 된다) */
export function buildStaffReportMessage(report: StaffMonthReport, commission?: StaffReportCommission): string {
  const [y, m] = report.yearMonth.split('-');
  const lines = [`[${y}년 ${Number(m)}월 직원별 실적]`];
  for (const r of report.rows) {
    const pay = commission ? ` · 수당(참고) ${formatPrice(commission.amountOf(r.staffId))}(${commission.describeOf(r.staffId)})` : '';
    lines.push(`• ${r.name}${r.isActive ? '' : '(퇴사)'}: 완료 예약 ${r.completedReservations}건(예약액 ${formatPrice(r.reservationAmount)} · 실결제 ${formatPrice(r.paidAmount)}) · 시술 ${r.treatments}건 · 제품 ${formatPrice(r.productAmount)} · 고객 ${r.customers}명${pay}`);
  }
  if (commission) lines.push(`• 수당 합계(참고) ${formatPrice(commission.total)}`);
  for (const c of staffReportCaveats(report)) lines.push(`• ${c}`);
  if (commission) for (const c of commission.caveats) lines.push(`• ${c}`);
  lines.push('※ 예약액은 완료 처리된 예약의 정가(회차권 차감·할인 미반영), 실결제는 그 예약에 연결된 완료 결제 합(환불 제외) · 취소·노쇼 제외');
  return lines.join('\n');
}
