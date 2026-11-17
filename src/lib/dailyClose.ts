// ═══════════════════════════════════════════════════════════════
// dailyClose — 오늘 마감 요약 (비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 마감 때 사장님/본사에 카톡으로 보내는 "오늘 숫자"를 한 번에 만든다:
// 매출(결제수단·구분별)·환불·지출·방문(시술)·신규 고객·예약 결과(완료/노쇼/취소). 복사/공유용 문구 포함.
// ═══════════════════════════════════════════════════════════════

import { PaymentStore, CustomerStore, TreatmentLogStore, ReservationStore, SettingsStore } from './store';
import { ExpenseStore } from './expenseStore';
import { todayISO } from './format';

export interface DailyClose {
  date: string;
  revenue: number;            // 완료 결제 합계
  paymentCount: number;
  byMethod: { method: string; amount: number }[];   // 금액 큰 순
  byType: { treatment: number; product: number; other: number };
  refunds: number;            // 오늘 환불 처리된 금액 합계(참고)
  expenses: number;           // 오늘 지출 합계
  treatments: number;         // 오늘 시술 기록 수(방문)
  newCustomers: number;
  reservations: { total: number; completed: number; noshow: number; cancelled: number; pending: number };
}

export function getDailyClose(date = todayISO()): DailyClose {
  const payments = PaymentStore.getByDate(date);
  const completed = payments.filter(p => p.status === 'completed');
  const methodMap = new Map<string, number>();
  for (const p of completed) methodMap.set(p.paymentMethod, (methodMap.get(p.paymentMethod) ?? 0) + p.amount);
  const sum = (list: { amount: number }[]) => list.reduce((s, p) => s + p.amount, 0);
  const reservations = ReservationStore.getAll().filter(r => r.date === date);
  return {
    date,
    revenue: sum(completed),
    paymentCount: completed.length,
    byMethod: [...methodMap.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    byType: {
      treatment: sum(completed.filter(p => p.type === 'program' || p.type === 'single_treatment')),
      product: sum(completed.filter(p => p.type === 'product')),
      other: sum(completed.filter(p => p.type === 'other')),
    },
    refunds: sum(payments.filter(p => p.status === 'refunded')),
    expenses: sum(ExpenseStore.getAll().filter(e => e.expenseDate === date)),
    treatments: TreatmentLogStore.getAll().filter(t => t.treatmentDate === date && !t.id.startsWith('sample_')).length,
    newCustomers: CustomerStore.getAll().filter(c => !c.id.startsWith('sample_') && (c.registeredAt || '').slice(0, 10) === date).length,
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

/** 마감 보고 문구 — 복사/공유용 */
export function buildDailyCloseMessage(c: DailyClose): string {
  const shop = SettingsStore.get().name || '매장';
  const d = new Date(c.date + 'T00:00:00');
  const label = Number.isNaN(d.getTime()) ? c.date : `${d.getMonth() + 1}/${d.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
  const lines = [`[${shop}] ${label} 마감 보고`, `· 매출 ${won(c.revenue)} (${c.paymentCount}건)`];
  if (c.byMethod.length) lines.push(`  ${c.byMethod.map(m => `${m.method} ${won(m.amount)}`).join(' / ')}`);
  const parts: string[] = [];
  if (c.byType.treatment) parts.push(`시술 ${won(c.byType.treatment)}`);
  if (c.byType.product) parts.push(`제품 ${won(c.byType.product)}`);
  if (c.byType.other) parts.push(`기타 ${won(c.byType.other)}`);
  if (parts.length) lines.push(`  ${parts.join(' / ')}`);
  if (c.refunds) lines.push(`· 환불 ${won(c.refunds)}`);
  if (c.expenses) lines.push(`· 지출 ${won(c.expenses)}`);
  lines.push(`· 시술 ${c.treatments}건 · 신규 고객 ${c.newCustomers}명`);
  lines.push(`· 예약 ${c.reservations.total}건 (완료 ${c.reservations.completed} / 노쇼 ${c.reservations.noshow} / 취소 ${c.reservations.cancelled}${c.reservations.pending ? ` / 미처리 ${c.reservations.pending}` : ''})`);
  return lines.join('\n');
}
