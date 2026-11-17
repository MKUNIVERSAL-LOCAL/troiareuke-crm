// ═══════════════════════════════════════════════════════════════
// gcalEventMap — 예약 ↔ Google 캘린더 이벤트 매핑 (비코어, 2026-11-18 Reservations에서 분리)
// ───────────────────────────────────────────────────────────────
// Reservation 코어 타입에 googleEventId가 없어 로컬에 매핑을 둔다. 예약 수정/취소/노쇼/삭제 때 캘린더의 유령 일정을 정리한다.
// 예약 화면과 대시보드 "완료 처리 누락" 카드(노쇼 처리)가 같은 정리 경로를 쓴다.
// ═══════════════════════════════════════════════════════════════

import { isGoogleCalendarConnected, deleteCalendarEvent } from './googleCalendar';

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
