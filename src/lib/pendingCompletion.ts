// ═══════════════════════════════════════════════════════════════
// pendingCompletion — 완료 처리 누락 예약 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 날짜가 지났는데 확정·대기 상태로 남은 예약. 직원이 완료 처리를 잊으면 방문 횟수·마지막 방문일·재방문 리마인더·
// 직원 실적이 전부 빠진다. 대시보드 카드가 모아 보여 주고 한 번에 완료/노쇼 처리한다(ReservationStore.updateStatus가 방문 통계 반영).
// ═══════════════════════════════════════════════════════════════

import { ReservationStore } from './store';
import { todayISO } from './format';
import type { Reservation } from '../types';

/** 오늘 이전 날짜의 확정·대기 예약 — 최근 날짜 먼저 */
export function getPendingCompletionReservations(today = todayISO()): Reservation[] {
  return ReservationStore.getAll()
    .filter(r => r.date < today && (r.status === 'confirmed' || r.status === 'pending'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
}

/** 상태 일괄 변경 — 한 건씩 updateStatus를 거쳐 방문 통계가 맞게 반영된다. @returns 바뀐 건수 */
export function settleReservations(ids: string[], status: 'completed' | 'noshow'): number {
  let n = 0;
  for (const id of ids) if (ReservationStore.updateStatus(id, status)) n++;
  return n;
}
