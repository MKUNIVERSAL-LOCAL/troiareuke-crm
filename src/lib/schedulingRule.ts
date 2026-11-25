/**
 * schedulingRule — 예약 시간 구간·겹침 판정 (순수 모듈, 저장소 의존 없음). 140, GAP R-3.
 * OpenSalon(MIT)·Easy!Appointments(GPL) 의 반개구간 겹침 규칙을 **참고해 자체 구현**(외부 코드 복사 없음 — THIRD-PARTY-CODE-REGISTER B).
 *  - 구간은 [start, end) 반개구간(분). 끝이 시작보다 같거나 앞이면 자정을 넘은 것으로 보고 +24h.
 *  - 겹침 = a.start < b.end && a.end > b.start. 맞닿은 구간(10:00~11:00 / 11:00~12:00)은 겹침 아님.
 *  - 시간이 깨진 기존 예약(파싱 불가)은 겹침으로 본다 — 확인을 받는 쪽이 안전하다(예약 화면 종전 규칙 유지).
 */
export interface Interval { startMin: number; endMin: number }

export function toMinutes(hhmm: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

export function fromMinutes(min: number): string {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** 'HH:mm' 쌍 → 구간. end 가 없거나 start 이하이면 fallbackDuration 또는 자정 넘김으로 */
export function toInterval(start: string | undefined | null, end: string | undefined | null, fallbackDuration = 60): Interval | null {
  const s = toMinutes(start);
  if (s === null) return null;
  let e = toMinutes(end);
  if (e === null) e = s + fallbackDuration;
  if (e <= s) e += 24 * 60;
  return { startMin: s, endMin: e };
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startMin < b.endMin && a.endMin > b.startMin;
}

/** 후보 구간과 겹치는 기존 항목 — 시간이 깨진 항목도 포함(확인 대상) */
export function findConflicts<T extends { startTime: string; endTime?: string }>(candidate: Interval, items: T[]): T[] {
  return items.filter(it => {
    const iv = toInterval(it.startTime, it.endTime);
    return iv === null ? true : overlaps(candidate, iv);
  });
}
