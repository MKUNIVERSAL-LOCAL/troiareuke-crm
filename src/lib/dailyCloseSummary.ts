// ═══════════════════════════════════════════════════════════════
// dailyCloseSummary — 마감 요약 집계·문구 (순수 모듈, 저장소 의존 없음)
// ───────────────────────────────────────────────────────────────
// dailyClose.getDailyClose 가 저장소에서 목록을 모아 넘기고, 여기서 하루 숫자를 만든다:
// 매출(완료 결제 합)·건수(분할 결제 1건)·수단별·구분별·환불(오늘 결제분)·지출·시술·신규 고객·예약 결과.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 분해 규칙을 검증한다 (커버리지 감사 2026-11-20).
// ═══════════════════════════════════════════════════════════════

import type { Payment, Expense, TreatmentLog, Customer, Reservation } from '../types';
import { countPaymentUnits } from './paymentCount';

export interface DailyClose {
  date: string;
  revenue: number;            // 완료 결제 합계
  paymentCount: number;
  byMethod: { method: string; amount: number }[];   // 금액 큰 순
  byType: { treatment: number; product: number; other: number };
  refunds: number;            // 오늘 결제분 중 환불된 금액(환불 처리일이 아님 — Payment에 환불일이 없다)
  expenses: number;           // 오늘 지출 합계
  treatments: number;         // 오늘 시술 기록 수(방문)
  newCustomers: number;
  reservations: { total: number; completed: number; noshow: number; cancelled: number; pending: number };
}

export interface DailyCloseSource {
  payments: Pick<Payment, 'id' | 'referenceId' | 'paymentDate' | 'status' | 'amount' | 'paymentMethod' | 'type'>[];
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
    expenses: sum(src.expenses.filter(e => e.expenseDate === date)),
    treatments: src.treatmentLogs.filter(t => t.treatmentDate === date && !t.id.startsWith('sample_')).length,
    newCustomers: src.customers.filter(c => !c.id.startsWith('sample_') && !!c.registeredAt && localDay(c.registeredAt) === date).length,
    reservations: {
      total: reservations.length,
      completed: reservations.filter(r => r.status === 'completed').length,
      noshow: reservations.filter(r => r.status === 'noshow').length,
      cancelled: reservations.filter(r => r.status === 'cancelled').length,
      pending: reservations.filter(r => r.status === 'confirmed' || r.status === 'pending').length,
    },
  };
}

const won = (n: number) => `${n.toLocaleString()}원`;

/** 마감 보고 문구 — 복사/공유용. shop 은 매장 이름(없으면 '매장') */
export function formatDailyCloseMessage(c: DailyClose, shop: string): string {
  const d = new Date(c.date + 'T00:00:00');
  const label = Number.isNaN(d.getTime()) ? c.date : `${d.getMonth() + 1}/${d.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
  const lines = [`[${shop}] ${label} 마감 보고`, `· 매출 ${won(c.revenue)} (${c.paymentCount}건)`];
  if (c.byMethod.length) lines.push(`  ${c.byMethod.map(m => `${m.method} ${won(m.amount)}`).join(' / ')}`);
  const parts: string[] = [];
  if (c.byType.treatment) parts.push(`시술 ${won(c.byType.treatment)}`);
  if (c.byType.product) parts.push(`제품 ${won(c.byType.product)}`);
  if (c.byType.other) parts.push(`기타 ${won(c.byType.other)}`);
  if (parts.length) lines.push(`  ${parts.join(' / ')}`);
  if (c.refunds) lines.push(`· 환불(오늘 결제분) ${won(c.refunds)}`);
  if (c.expenses) lines.push(`· 지출 ${won(c.expenses)}`);
  lines.push(`· 시술 ${c.treatments}건 · 신규 고객 ${c.newCustomers}명`);
  lines.push(`· 예약 ${c.reservations.total}건 (완료 ${c.reservations.completed} / 노쇼 ${c.reservations.noshow} / 취소 ${c.reservations.cancelled}${c.reservations.pending ? ` / 미처리 ${c.reservations.pending}` : ''})`);
  return lines.join('\n');
}
