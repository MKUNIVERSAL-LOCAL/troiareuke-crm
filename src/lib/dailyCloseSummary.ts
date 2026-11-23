// ═══════════════════════════════════════════════════════════════
// dailyCloseSummary — 마감 요약 집계·문구 (순수 모듈, 저장소 의존 없음)
// ───────────────────────────────────────────────────────────────
// dailyClose.getDailyClose 가 저장소에서 목록을 모아 넘기고, 여기서 하루 숫자를 만든다:
// 매출(완료 결제 합)·건수(분할 결제 1건)·수단별·구분별·환불(오늘 결제분)·지출·시술·신규 고객·예약 결과.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 분해 규칙을 검증한다 (커버리지 감사 2026-11-20).
// ═══════════════════════════════════════════════════════════════

import type { Payment, Expense, TreatmentLog, Customer, Reservation } from '../types';
import { countPaymentUnits } from './paymentCount';
import { refundedOn } from './refundDate';
import { formatPrice } from './format'; // 브라우저 로케일과 무관하게 ko-KR 천 단위 (10차 #L1)

export interface DailyClose {
  date: string;
  revenue: number;            // 완료 결제 합계
  paymentCount: number;
  byMethod: { method: string; amount: number }[];   // 금액 큰 순
  byType: { treatment: number; product: number; other: number };
  refunds: number;            // 오늘 결제분 중 환불된 금액(결제일 기준)
  refundedToday: number;      // 오늘 환불 "처리"한 금액(memo 태그 [환불 YYYY-MM-DD] 기준, 10차 #M1)
  expenses: number;           // 오늘 지출 합계
  treatments: number;         // 오늘 시술 기록 수(방문)
  newCustomers: number;
  reservations: { total: number; active: number; completed: number; noshow: number; cancelled: number; pending: number }; // active = 취소·노쇼 제외(대시보드 "오늘 예약"과 같은 정의, 10차 #M3)
}

export interface DailyCloseSource {
  /** 전체 결제 — 날짜(paymentDate === date)는 여기서 걸러낸다 */
  payments: Pick<Payment, 'id' | 'referenceId' | 'paymentDate' | 'status' | 'amount' | 'paymentMethod' | 'type' | 'memo'>[];
  expenses: Pick<Expense, 'expenseDate' | 'amount'>[];
  treatmentLogs: Pick<TreatmentLog, 'id' | 'treatmentDate'>[];
  customers: Pick<Customer, 'id' | 'registeredAt'>[];
  reservations: Pick<Reservation, 'date' | 'status'>[];
}

/** ISO 일시(UTC, registeredAt) → 지역 날짜. KST 00~09시 등록 고객이 어제로 빠지지 않게 */
function localDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function summarizeDailyClose(date: string, src: DailyCloseSource): DailyClose {
  const payments = src.payments.filter(p => p.paymentDate === date);
  const completed = payments.filter(p => p.status === 'completed');
  const methodMap = new Map<string, number>();
  for (const p of completed) methodMap.set(p.paymentMethod, (methodMap.get(p.paymentMethod) ?? 0) + p.amount);
  const sum = (list: { amount: number }[]) => list.reduce((s, p) => s + p.amount, 0);
  const reservations = src.reservations.filter(r => r.date === date);
  return {
    date,
    revenue: sum(completed),
    paymentCount: countPaymentUnits(completed), // 분할(복합) 결제 2행 = 1건 — 매출·대시보드와 같은 정의
    byMethod: [...methodMap.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    byType: {
      treatment: sum(completed.filter(p => p.type === 'program' || p.type === 'single_treatment')),
      product: sum(completed.filter(p => p.type === 'product')),
      other: sum(completed.filter(p => p.type === 'other')),
    },
    refunds: sum(payments.filter(p => p.status === 'refunded')),
    refundedToday: sum(src.payments.filter(p => refundedOn(p) === date)),
    expenses: sum(src.expenses.filter(e => e.expenseDate === date)),
    treatments: src.treatmentLogs.filter(t => t.treatmentDate === date && !t.id.startsWith('sample_')).length,
    newCustomers: src.customers.filter(c => !c.id.startsWith('sample_') && !!c.registeredAt && localDay(c.registeredAt) === date).length,
    reservations: {
      total: reservations.length,
      active: reservations.filter(r => r.status !== 'cancelled' && r.status !== 'noshow').length,
      completed: reservations.filter(r => r.status === 'completed').length,
      noshow: reservations.filter(r => r.status === 'noshow').length,
      cancelled: reservations.filter(r => r.status === 'cancelled').length,
      pending: reservations.filter(r => r.status === 'confirmed' || r.status === 'pending').length,
    },
  };
}


/** 마감 보고 문구 — 복사/공유용. shop 은 매장 이름(비어 있으면 '매장') */
export function formatDailyCloseMessage(c: DailyClose, shop: string | undefined): string {
  const shopLabel = shop || '매장';
  const d = new Date(c.date + 'T00:00:00');
  const label = Number.isNaN(d.getTime()) ? c.date : `${d.getMonth() + 1}/${d.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
  const lines = [`[${shopLabel}] ${label} 마감 보고`, `· 매출 ${formatPrice(c.revenue)} (${c.paymentCount}건)`];
  if (c.byMethod.length) lines.push(`  ${c.byMethod.map(m => `${m.method} ${formatPrice(m.amount)}`).join(' / ')}`);
  const parts: string[] = [];
  if (c.byType.treatment) parts.push(`시술 ${formatPrice(c.byType.treatment)}`);
  if (c.byType.product) parts.push(`제품 ${formatPrice(c.byType.product)}`);
  if (c.byType.other) parts.push(`기타 ${formatPrice(c.byType.other)}`);
  if (parts.length) lines.push(`  ${parts.join(' / ')}`);
  if (c.refunds) lines.push(`· 환불(오늘 결제분) ${formatPrice(c.refunds)}`);
  if (c.refundedToday) lines.push(`· 환불 처리(오늘) ${formatPrice(c.refundedToday)}`);
  if (c.expenses) lines.push(`· 지출 ${formatPrice(c.expenses)}`);
  lines.push(`· 시술 ${c.treatments}건 · 신규 고객 ${c.newCustomers}명`);
  // 예약 N건은 대시보드 "오늘 예약"과 같은 수(취소·노쇼 제외) — 두 화면이 다른 N을 보였다 (10차 #M3)
  lines.push(`· 예약 ${c.reservations.active}건 (완료 ${c.reservations.completed} / 노쇼 ${c.reservations.noshow}${c.reservations.pending ? ` / 미처리 ${c.reservations.pending}` : ''})${c.reservations.cancelled ? ` · 취소 ${c.reservations.cancelled}건` : ''}`);
  return lines.join('\n');
}
