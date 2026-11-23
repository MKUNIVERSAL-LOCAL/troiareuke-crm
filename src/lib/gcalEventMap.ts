// ═══════════════════════════════════════════════════════════════
// gcalEventMap — 예약 ↔ Google 캘린더 이벤트 매핑 (비코어, 2026-11-18 Reservations에서 분리)
// ───────────────────────────────────────────────────────────────
// Reservation 코어 타입에 googleEventId가 없어 로컬에 매핑을 둔다. 예약 수정/취소/노쇼/삭제 때 캘린더의 유령 일정을 정리한다.
// 예약 화면과 대시보드 "완료 처리 누락" 카드(노쇼 처리)가 같은 정리 경로를 쓴다.
// ═══════════════════════════════════════════════════════════════

import { isGoogleCalendarConnected, deleteCalendarEvent, createCalendarEvent } from './googleCalendar';
import type { Reservation } from '../types';
import { notify } from './notify';

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

/** 이름이 바뀐 예약의 캘린더 일정을 다시 만든다(예약 수정 저장과 같은 경로) — 공유 캘린더에 옛 고객·담당자 이름이 남지 않게 (11차 #M8).
 *  순차로 "생성 → 성공하면 옛 일정 삭제" — 동시에 수십 건을 쏘면 Google 이 429/403 을 돌려주고, 삭제가 먼저 성공하면 일정이 흔적 없이 사라진다 (리뷰 #H3).
 *  실패 건은 옛 일정·매핑을 그대로 두고 건수를 알린다(그 예약을 열어 저장하면 복구). 미연결이면 아무 것도 하지 않는다 */
export async function resyncGcalEvents(reservations: Reservation[]): Promise<void> {
  if (!isGoogleCalendarConnected()) return;
  const m = getGcalMap();
  let failed = 0;
  for (const r of reservations) {
    const oldEventId = m[r.id];
    if (!oldEventId) continue;
    try {
      const ev = await createCalendarEvent(r);
      rememberGcalEvent(r.id, ev.id);
      await deleteCalendarEvent(oldEventId).catch(() => { /* 옛 일정 삭제 실패는 중복 표시일 뿐 — 다음 수정 때 정리 */ });
    } catch {
      failed++;
    }
  }
  if (failed > 0) notify.warning(`Google 캘린더 일정 ${failed}건을 새 이름으로 다시 만들지 못했습니다. 해당 예약을 열어 저장하면 복구됩니다.`);
}
