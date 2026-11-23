// ═══════════════════════════════════════════════════════════════
// dailyClose — 오늘 마감 요약 (비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 마감 때 사장님/본사에 카톡으로 보내는 "오늘 숫자"를 한 번에 만든다. 집계·문구 규칙은 dailyCloseSummary(순수)에 있고,
// 여기서는 저장소에서 목록을 모아 넘기고 매장 이름을 붙인다.
// ═══════════════════════════════════════════════════════════════

import { PaymentStore, CustomerStore, TreatmentLogStore, ReservationStore, SettingsStore } from './store';
import { ExpenseStore } from './expenseStore';
import { todayISO } from './format';
import { summarizeDailyClose, formatDailyCloseMessage, type DailyClose } from './dailyCloseSummary';

export function getDailyClose(date = todayISO()): DailyClose {
  return summarizeDailyClose(date, {
    payments: PaymentStore.getAll(), // 날짜 걸러내기는 순수 모듈이 — 다른 목록과 같은 계약 (리뷰 2026-11-20)
    expenses: ExpenseStore.getAll(),
    treatmentLogs: TreatmentLogStore.getAll(),
    customers: CustomerStore.getAll(),
    reservations: ReservationStore.getAll(),
  });
}

/** 마감 보고 문구 — 복사/공유용 */
export function buildDailyCloseMessage(c: DailyClose): string {
  return formatDailyCloseMessage(c, SettingsStore.get().name);
}
