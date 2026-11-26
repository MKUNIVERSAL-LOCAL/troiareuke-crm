// cancelReasons — 예약 취소·노쇼 사유 저장 (비코어, 244, GAP R-10 후속)
// 코어 Reservation 에는 사유 칸이 없어(코어 수정은 승인 A) 예약 id → 사유를 지점 설정(preferences)에 둔다.
// 설정 행은 NAS 로 동기되어 다른 PC 에서도 같은 사유·같은 집계를 본다(reservationResources 와 같은 방식, 142).
// 저장할 때마다 지난 예약(365일 전)·이 기기가 날짜를 아는데 사라진 예약의 사유를 정리해 설정 행이 커지지 않게 한다.
import { getPreference, setPreference } from './shopPreferences';
import { ReservationStore } from './store';
import { todayISO } from './format';
import { normalizeReasonText, isPresetReason, type CancelKind } from './cancelReasonRule';
import type { PrefLanded } from './prefLandedRule';

const KEEP_DAYS = 365; // 1년치는 "작년 이맘때" 비교에 쓸 수 있다
const MAX_REASONS = 500; // 삭제된 예약의 고아 기록까지 무한정 쌓이지 않게 (246 리뷰 M-4)

export interface StoredReason { kind: CancelKind; reason: string; at: string }

export function reasonMap(): Record<string, StoredReason> {
  const v = getPreference('reservationCancelReasons');
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, StoredReason> = {};
  for (const [id, rec] of Object.entries(v as Record<string, StoredReason>)) {
    if (!rec || typeof rec !== 'object') continue;
    const kind: CancelKind = rec.kind === 'noshow' ? 'noshow' : 'cancelled';
    const reason = normalizeReasonText(rec.reason);
    if (!reason) continue;
    out[id] = { kind, reason, at: typeof rec.at === 'string' ? rec.at : '' };
  }
  return out;
}

export function reasonOf(reservationId: string): StoredReason | null {
  return reasonMap()[reservationId] ?? null;
}

/**
 * 사유 저장 — 빈 값이면 그 예약의 사유를 지운다(취소를 되돌릴 때).
 * 저장 실패(설정 행 오류)가 취소·노쇼 처리를 되돌리게 하지 않는다 → 예외를 삼키고 `'lost'` 를 돌려준다.
 * 290(285~287 리뷰 M-3): 전에는 `true` 를 그냥 돌려줘 **저장이 남았는지를 버렸다** — 사유는 월 집계·지난달
 * 비교의 원천이라, 안 남은 사유를 적힌 것으로 세면 "매장 쪽 사유 +3" 같은 거짓이 나간다(254 리뷰와 같은 종류).
 */
export function saveReason(reservationId: string, kind: CancelKind, reason: string): PrefLanded {
  try {
    const next = pruned(reasonMap());
    const clean = normalizeReasonText(reason);
    if (clean) next[reservationId] = { kind, reason: clean, at: new Date().toISOString() };
    else delete next[reservationId];
    return setPreference('reservationCancelReasons', next);
  } catch {
    return 'lost';
  }
}

function pruned(map: Record<string, StoredReason>): Record<string, StoredReason> {
  const cutoff = new Date(`${todayISO()}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const keepFrom = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const dates = new Map(ReservationStore.getAll().map(r => [r.id, r.date] as const));
  const kept: [string, StoredReason][] = [];
  for (const [id, rec] of Object.entries(map)) {
    const d = dates.get(id);
    // 이 기기 캐시에 없는 예약(다른 기기 것·아직 못 받은 것)은 날짜로 지우지 않는다 (144 리뷰 M-2 와 같은 규칙)
    if (d && d < keepFrom) continue;
    // 다만 적은 시각이 1년 넘은 기록은 예약이 사라졌어도 지운다 — 삭제된 예약의 고아 기록이 영구히 남았다 (246 리뷰 M-4)
    if (!d && rec.at && rec.at.slice(0, 10) < keepFrom) continue;
    kept.push([id, rec]);
  }
  // 그래도 많으면 최근 것만 — 적은 시각(at) 기준
  kept.sort((a, b) => String(a[1].at).localeCompare(String(b[1].at)));
  const out: Record<string, StoredReason> = {};
  for (const [id, rec] of kept.slice(Math.max(0, kept.length - MAX_REASONS))) out[id] = rec;
  return out;
}

/**
 * 고객 익명화·삭제 때 **직접 입력한 사유만** 지운다 (246 리뷰 M-4).
 * 직접 입력 30자에는 "○○ 임신으로 중단" 같은 개인 사정이 적힐 수 있는데, 익명화가 이 기록을 몰랐다.
 * 등록된 보기(고객 일정 변경 등)는 개인정보가 아니라 통계라 남긴다.
 */
export function clearFreeTextReasonsOfCustomer(customerId: string): number {
  try {
    const map = reasonMap();
    const mine = new Set(ReservationStore.getAll().filter(r => r.customerId === customerId).map(r => r.id));
    let removed = 0;
    const next: Record<string, StoredReason> = {};
    for (const [id, rec] of Object.entries(map)) {
      if (mine.has(id) && !isPresetReason(rec.reason)) { removed += 1; continue; }
      next[id] = rec;
    }
    if (removed > 0) setPreference('reservationCancelReasons', next);
    return removed;
  } catch {
    return 0;
  }
}

/** 그 달의 취소·노쇼 건수와, 그중 사유가 적힌 기록 — 집계는 cancelReasonRule.summarizeReasons */
export function monthCancelFacts(yearMonth: string): {
  totals: { cancelled: number; noshow: number };
  records: { kind: CancelKind; reason: string }[];
} {
  const map = reasonMap();
  const totals = { cancelled: 0, noshow: 0 };
  const records: { kind: CancelKind; reason: string }[] = [];
  for (const r of ReservationStore.getAll()) {
    if (!r.date || r.date.slice(0, 7) !== yearMonth) continue;
    if (r.status === 'cancelled') totals.cancelled += 1;
    else if (r.status === 'noshow') totals.noshow += 1;
    else continue;
    const rec = map[r.id];
    if (!rec) continue;
    // 상태와 기록의 kind 가 어긋나면(노쇼로 적은 뒤 취소로 바꾼 경우) 그 사유는 **미기록으로 떨어뜨린다** (246 리뷰 M-3)
    const nowKind: CancelKind = r.status === 'noshow' ? 'noshow' : 'cancelled';
    if (rec.kind !== nowKind) continue;
    records.push({ kind: nowKind, reason: rec.reason });
  }
  return { totals, records };
}
