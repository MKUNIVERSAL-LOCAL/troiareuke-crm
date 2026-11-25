// rebookLog — 체크아웃 재예약 안내의 결과 기록 (비코어, 243, GAP R-11 후속)
// 설정 행(preferences)에 둔다 — 같은 지점 모든 PC 의 추천이 한 숫자로 모이고, PC 교체·로그아웃 wipe 와 무관하다.
// 규칙·집계는 rebookStatsRule.ts(순수). 여기서는 저장과 예약 조회만 한다.
import { ReservationStore } from './store';
import { getPreference, setPreference } from './shopPreferences';
import { todayISO } from './format';
import {
  sanitizeRebookLog, trimRebookLog, entriesInMonth, summarizeRebook,
  type RebookLogEntry, type RebookSummary,
} from './rebookStatsRule';

/** 기록 보관 기간(일) — 설정 행이라 무한정 쌓이게 두지 않는다 */
const KEEP_DAYS = 180;

function keepFrom(): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() - KEEP_DAYS);
  return d.toISOString().slice(0, 10);
}

export function getRebookLog(): RebookLogEntry[] {
  return sanitizeRebookLog(getPreference('rebookLog'));
}

function save(entries: RebookLogEntry[]): void {
  setPreference('rebookLog', trimRebookLog(entries, keepFrom()));
}

/**
 * 추천이 화면에 떴다 — 기록하고 id 를 돌려준다.
 * 저장이 실패해도 안내 자체는 떠야 하므로 예외를 삼키고 null 을 돌려준다(가짜 성공을 말하는 화면은 없다).
 */
export function logRebookShown(entry: { customerId: string; suggestedDate: string; basis?: string }): string | null {
  try {
    const shownAt = new Date().toISOString();
    const id = `${entry.customerId}-${shownAt}`;
    save([...getRebookLog(), {
      id,
      customerId: entry.customerId,
      suggestedDate: entry.suggestedDate,
      ...(entry.basis ? { basis: entry.basis } : {}),
      shownAt,
    }]);
    return id;
  } catch {
    return null;
  }
}

/** [예약 잡기] 를 눌렀다 */
export function logRebookClicked(id: string | null): void {
  if (!id) return;
  try {
    const log = getRebookLog();
    const hit = log.find(e => e.id === id);
    if (!hit || hit.clickedAt) return;
    save(log.map(e => (e.id === id ? { ...e, clickedAt: new Date().toISOString() } : e)));
  } catch {
    /* 지표 기록 실패가 예약 화면 이동을 막지 않는다 */
  }
}

/** 이달(또는 지정한 달, YYYY-MM) 재예약 안내 성과 */
export function rebookStatsFor(yearMonth: string): RebookSummary {
  const entries = entriesInMonth(getRebookLog(), yearMonth);
  if (entries.length === 0) return summarizeRebook([], []);
  const ids = new Set(entries.map(e => e.customerId));
  const reservations = ReservationStore.getAll()
    .filter(r => ids.has(r.customerId))
    .map(r => ({ customerId: r.customerId, date: r.date, status: r.status }));
  return summarizeRebook(entries, reservations);
}
