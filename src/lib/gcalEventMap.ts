// ═══════════════════════════════════════════════════════════════
// gcalEventMap — 예약 ↔ Google 캘린더 이벤트 매핑 (비코어, 2026-11-18 Reservations에서 분리)
// ───────────────────────────────────────────────────────────────
// Reservation 코어 타입에 googleEventId가 없어 로컬에 매핑을 둔다. 예약 수정/취소/노쇼/삭제 때 캘린더의 유령 일정을 정리한다.
// 예약 화면과 대시보드 "완료 처리 누락" 카드(노쇼 처리)가 같은 정리 경로를 쓴다.
// ═══════════════════════════════════════════════════════════════

import { isGoogleCalendarConnected, deleteCalendarEvent, createCalendarEvent } from './googleCalendar';
import type { Reservation } from '../types';

const GCAL_MAP_KEY = 'crm_gcal_event_map';

export function getGcalMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(GCAL_MAP_KEY) || '{}'); } catch { return {}; }
}

export function rememberGcalEvent(reservationId: string, eventId: string): void {
  const m = getGcalMap();
  m[reservationId] = eventId;
  try { localStorage.setItem(GCAL_MAP_KEY, JSON.stringify(m)); } catch { /* noop */ }
}

/** 예약에 연결된 Google 이벤트를 캘린더에서 삭제하고 매핑 제거 (미연결/실패는 무시, best-effort) */
export function cleanupGcalEvent(reservationId: string): void {
  const m = getGcalMap();
  const eventId = m[reservationId];
  if (!eventId) return;
  delete m[reservationId];
  try { localStorage.setItem(GCAL_MAP_KEY, JSON.stringify(m)); } catch { /* noop */ }
  if (isGoogleCalendarConnected()) {
    deleteCalendarEvent(eventId).catch(() => { /* 캘린더 정리는 best-effort */ });
  }
}

/** 이름이 바뀐 예약의 캘린더 일정을 지우고 다시 만든다(예약 수정 저장과 같은 경로) — 공유 캘린더에 옛 고객·담당자 이름이 남지 않게 (11차 #M8). 미연결이면 0, 실패는 best-effort */
export function resyncGcalEvents(reservations: Reservation[]): number {
  if (!isGoogleCalendarConnected()) return 0;
  const m = getGcalMap();
  let n = 0;
  for (const r of reservations) {
    const oldEventId = m[r.id];
    if (!oldEventId) continue;
    n++;
    deleteCalendarEvent(oldEventId).catch(() => { /* best-effort */ });
    createCalendarEvent(r).then(ev => rememberGcalEvent(r.id, ev.id)).catch(() => { /* 다음 예약 수정 때 다시 만들어진다 */ });
  }
  return n;
}
