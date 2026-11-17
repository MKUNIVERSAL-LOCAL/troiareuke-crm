// ═══════════════════════════════════════════════════════════════
// pendingCompletion — 완료 처리 누락 예약 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 날짜가 지났는데 확정·대기 상태로 남은 예약. 직원이 완료 처리를 잊으면 방문 횟수·마지막 방문일·재방문 리마인더·
// 직원 실적이 전부 빠진다. 대시보드 카드가 모아 보여 주고 건별/일괄 완료·노쇼 처리한다(ReservationStore.updateStatus가 방문 통계 반영).
// 최근 90일만 본다 — 그보다 오래된 것은 "잊은 체크아웃"이 아니라 이력이고, 일괄 처리가 수백 건의 저장·서버 전송을 일으키지 않게.
// ═══════════════════════════════════════════════════════════════

import { ReservationStore } from './store';
import { todayISO, toISODate } from './format';
import type { Reservation } from '../types';

export const PENDING_LOOKBACK_DAYS = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 오늘 이전(최근 90일) 날짜의 확정·대기 예약 — 최근 날짜 먼저. 날짜 형식이 깨진 행은 제외 */
export function getPendingCompletionReservations(today = todayISO()): Reservation[] {
  const floorDate = new Date();
  floorDate.setDate(floorDate.getDate() - PENDING_LOOKBACK_DAYS);
  const floor = toISODate(floorDate);
  return ReservationStore.getAll()
    .filter(r => DATE_RE.test(r.date) && r.date < today && r.date >= floor && (r.status === 'confirmed' || r.status === 'pending'))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startTime || '').localeCompare(a.startTime || ''));
}

/** 일괄 완료 대상 — 확정 예약만. 대기(미확정)는 왔는지 알 수 없어 건별로만 처리한다 */
export function bulkCompletableIds(list: Reservation[]): string[] {
  return list.filter(r => r.status === 'confirmed').map(r => r.id);
}

/** 상태 일괄 변경 — 한 건씩 updateStatus를 거쳐 방문 통계가 맞게 반영된다. @returns 바뀐 건수 */
export function settleReservations(ids: string[], status: 'completed' | 'noshow'): number {
  let n = 0;
  for (const id of ids) if (ReservationStore.updateStatus(id, status)) n++;
  return n;
}
