// cancelReasons — 예약 취소·노쇼 사유 저장 (비코어, 244, GAP R-10 후속)
// 코어 Reservation 에는 사유 칸이 없어(코어 수정은 승인 A) 예약 id → 사유를 지점 설정(preferences)에 둔다.
// 설정 행은 NAS 로 동기되어 다른 PC 에서도 같은 사유·같은 집계를 본다(reservationResources 와 같은 방식, 142).
// 저장할 때마다 지난 예약(365일 전)·이 기기가 날짜를 아는데 사라진 예약의 사유를 정리해 설정 행이 커지지 않게 한다.
import { getPreference, setPreference } from './shopPreferences';
import { ReservationStore } from './store';
import { todayISO } from './format';
import { normalizeReasonText, type CancelKind } from './cancelReasonRule';

const KEEP_DAYS = 365; // 1년치는 "작년 이맘때" 비교에 쓸 수 있다

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
 * 저장 실패(설정 행 오류)가 취소·노쇼 처리를 되돌리게 하지 않는다 → 예외를 삼키고 false 를 돌려준다.
 */
export function saveReason(reservationId: string, kind: CancelKind, reason: string): boolean {
  try {
    const next = pruned(reasonMap());
    const clean = normalizeReasonText(reason);
    if (clean) next[reservationId] = { kind, reason: clean, at: new Date().toISOString() };
    else delete next[reservationId];
    setPreference('reservationCancelReasons', next);
    return true;
  } catch {
    return false;
  }
}

function pruned(map: Record<string, StoredReason>): Record<string, StoredReason> {
  const cutoff = new Date(`${todayISO()}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const keepFrom = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const dates = new Map(ReservationStore.getAll().map(r => [r.id, r.date] as const));
  const out: Record<string, StoredReason> = {};
  for (const [id, rec] of Object.entries(map)) {
    const d = dates.get(id);
    // 이 기기 캐시에 없는 예약(다른 기기 것·아직 못 받은 것)은 지우지 않는다 — 날짜를 알고 1년 지난 것만 (144 리뷰 M-2 와 같은 규칙)
    if (!d || d >= keepFrom) out[id] = rec;
  }
  return out;
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
    // 상태와 기록이 어긋나면(취소 → 노쇼로 바꾼 뒤 사유를 안 고친 경우) 지금 상태를 믿는다
    if (rec) records.push({ kind: r.status === 'noshow' ? 'noshow' : 'cancelled', reason: rec.reason });
  }
  return { totals, records };
}
