// ═══════════════════════════════════════════════════════════════
// followUpRule — 고객 연락 기록·미루기 규칙 (순수 모듈, 249, GAP C-5·D-1 계열)
// ───────────────────────────────────────────────────────────────
// 왜: "오늘 할 일" 은 이탈 위험·재방문 권장·회차권 임박·재예약 없음 고객을 매일 **같은 얼굴로** 띄웠다.
//     직원이 전화해 "다음 달에 갈게요" 를 들어도 적을 곳이 없어, 다음 날 또 같은 고객이 목록에 뜬다.
//     그래서 목록을 믿지 않게 되고(알림 피로), 두 직원이 같은 고객에게 두 번 전화하는 일도 생긴다.
//     상용 CRM 은 할 일에 결과(outcome)와 다음 연락일을 적는다.
// 하는 일: 연락 결과와 "언제까지 미룰지" 를 규칙으로 다룬다. 미룬 고객은 그 날짜까지 할 일 목록에서 빠진다.
// 정직성: 숨긴 인원 수를 화면에 적는다(조용히 줄어든 숫자는 거짓말이다). 미루기는 기한이 지나면 자동으로 풀린다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export interface FollowUpOption { id: string; label: string; /** 기본 미루기 일수 — 0 이면 미루지 않는다 */ snoozeDays: number }

export const FOLLOW_UP_RESULTS: FollowUpOption[] = [
  { id: 'booked', label: '예약 잡음', snoozeDays: 30 },
  { id: 'later', label: '나중에 오겠다고 함', snoozeDays: 30 },
  { id: 'no-answer', label: '부재·연결 안 됨', snoozeDays: 3 },
  { id: 'messaged', label: '문자·카톡 보냄', snoozeDays: 7 },
  { id: 'declined', label: '당분간 안 받겠다고 함', snoozeDays: 90 },
];

export const SNOOZE_CHOICES = [0, 3, 7, 14, 30, 90];

export interface FollowUpRecord {
  /** 연락한 날(매장 기준 YYYY-MM-DD) */
  at: string;
  /** 결과 id 또는 직접 입력 */
  result: string;
  /** 이 날짜까지 할 일 목록에서 빼 둔다(YYYY-MM-DD). 없으면 미루지 않음 */
  until?: string;
  /** 짧은 메모(40자) */
  note?: string;
  /** 기록한 사람 */
  actor?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resultLabel(value: string): string {
  return FOLLOW_UP_RESULTS.find(o => o.id === value)?.label || value;
}

export function defaultSnoozeDays(resultId: string): number {
  return FOLLOW_UP_RESULTS.find(o => o.id === resultId)?.snoozeDays ?? 0;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 아직 미뤄 둔 상태인가 — 기한이 지나면 스스로 풀린다(직원이 해제를 잊어도 고객이 영구히 숨지 않는다) */
export function isSnoozed(rec: FollowUpRecord | undefined, today: string): boolean {
  if (!rec?.until || !DATE_RE.test(rec.until)) return false;
  return rec.until >= today;
}

export function sanitizeFollowUps(value: unknown): Record<string, FollowUpRecord> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, FollowUpRecord> = {};
  for (const [id, raw] of Object.entries(value as Record<string, FollowUpRecord>)) {
    if (!raw || typeof raw !== 'object') continue;
    const at = typeof raw.at === 'string' && DATE_RE.test(raw.at) ? raw.at : '';
    const result = typeof raw.result === 'string' ? raw.result.replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    if (!at || !result) continue;
    out[id] = {
      at, result,
      ...(typeof raw.until === 'string' && DATE_RE.test(raw.until) ? { until: raw.until } : {}),
      ...(raw.note ? { note: String(raw.note).replace(/\s+/g, ' ').trim().slice(0, 40) } : {}),
      ...(raw.actor ? { actor: String(raw.actor).slice(0, 20) } : {}),
    };
  }
  return out;
}

export const MAX_FOLLOW_UPS = 500;

/** 오래된 기록 정리 — keepFrom 이전 연락은 버리고, 그래도 많으면 최근 것만 남긴다 */
export function pruneFollowUps(map: Record<string, FollowUpRecord>, keepFrom: string, max = MAX_FOLLOW_UPS): Record<string, FollowUpRecord> {
  const rows = Object.entries(map).filter(([, r]) => r.at >= keepFrom || (r.until ?? '') >= keepFrom);
  rows.sort((a, b) => a[1].at.localeCompare(b[1].at));
  const out: Record<string, FollowUpRecord> = {};
  for (const [id, r] of rows.slice(Math.max(0, rows.length - max))) out[id] = r;
  return out;
}

/** 지금 미뤄 둔 고객 id 들 */
export function snoozedIdSet(map: Record<string, FollowUpRecord>, today: string): Set<string> {
  const out = new Set<string>();
  for (const [id, rec] of Object.entries(map)) if (isSnoozed(rec, today)) out.add(id);
  return out;
}

/** 고객 상세 한 줄 — "11-26 부재·연결 안 됨 · 11-29 까지 미룸 (김실장)" */
export function describeFollowUp(rec: FollowUpRecord): string {
  const parts = [`${rec.at} ${resultLabel(rec.result)}`];
  if (rec.until) parts.push(`${rec.until} 까지 미룸`);
  if (rec.note) parts.push(rec.note);
  const who = rec.actor ? ` (${rec.actor})` : '';
  return `${parts.join(' · ')}${who}`;
}

/** 목록에서 숨긴 인원 안내 — 0 명이면 아무 말도 하지 않는다 */
export function describeHidden(hidden: number): string | null {
  return hidden > 0 ? `연락을 미룬 고객 ${hidden}명은 목록에서 숨겼습니다(기한이 지나면 다시 나옵니다).` : null;
}
