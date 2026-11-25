// ═══════════════════════════════════════════════════════════════
// rebookStatsRule — 체크아웃 재예약 성과 규칙 (순수 모듈, 243, GAP R-11 후속)
// ───────────────────────────────────────────────────────────────
// 왜: 231 로 "결제 직후 다음 방문 추천"을 넣었지만 그게 실제 예약으로 이어지는지 알 수 없었다.
//     효과를 모르면 주기·문구를 고칠 근거가 없고, 매장은 이 안내가 도움이 되는지 판단할 수 없다.
// 세는 방법(정직하게):
//   - 추천: 안내가 뜬 횟수.
//   - 예약 잡기: [예약 잡기] 를 누른 횟수.
//   - 추천일 예약: 그 고객에게 **추천한 날짜의 살아 있는 예약**이 있는 건수 → [추정]이다.
//     안내 때문에 잡혔다고 증명할 수는 없다(같은 날짜를 따로 잡았을 수도 있다). 화면에도 [추정]으로 적는다.
//   - 비율은 추천이 0건이면 null — 0% 라고 말하지 않는다.
// 코어 Reservation 에는 createdAt 이 없어(코어 수정은 승인 A) "안내 후에 생긴 예약"으로 가릴 수 없다.
// 그래서 날짜 일치로만 보고, 그 한계를 화면 문구에 적는다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export interface RebookLogEntry {
  /** 기록 id (추천이 뜬 시각 기반) */
  id: string;
  customerId: string;
  /** 추천한 날짜 (YYYY-MM-DD) */
  suggestedDate: string;
  /** 추천 근거 — 개인 주기/매장 주기/시술기록 권장일 */
  basis?: string;
  /** 안내가 뜬 시각 (ISO) */
  shownAt: string;
  /** [예약 잡기] 를 누른 시각 (ISO) — 안 눌렀으면 없음 */
  clickedAt?: string;
}

export interface RebookSummary {
  shown: number;
  clicked: number;
  /** 추천일에 살아 있는 예약이 있는 건수 — [추정] */
  booked: number;
  /** 누른 비율(%) — 추천이 0건이면 null */
  clickRate: number | null;
  /** 추천일 예약 비율(%) — 추천이 0건이면 null */
  bookRate: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isEntry(e: unknown): e is RebookLogEntry {
  if (!e || typeof e !== 'object') return false;
  const r = e as RebookLogEntry;
  return typeof r.customerId === 'string' && r.customerId.length > 0
    && typeof r.suggestedDate === 'string' && DATE_RE.test(r.suggestedDate)
    && typeof r.shownAt === 'string' && r.shownAt.length > 0;
}

/** 저장값 정리 — 모양이 깨진 기록은 버리고, 같은 id 는 뒤에 온 것(눌림 표시가 붙은 쪽)을 남긴다 */
export function sanitizeRebookLog(value: unknown): RebookLogEntry[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, RebookLogEntry>();
  for (const raw of value) {
    if (!isEntry(raw)) continue;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : `${raw.customerId}-${raw.shownAt}`;
    byId.set(id, {
      id,
      customerId: raw.customerId,
      suggestedDate: raw.suggestedDate,
      ...(raw.basis ? { basis: String(raw.basis).slice(0, 20) } : {}),
      shownAt: raw.shownAt,
      ...(raw.clickedAt ? { clickedAt: String(raw.clickedAt) } : {}),
    });
  }
  return [...byId.values()].sort((a, b) => a.shownAt.localeCompare(b.shownAt));
}

export const MAX_REBOOK_LOG = 400;

/**
 * 설정 행에 들어가는 기록이라 무한정 쌓이게 두지 않는다.
 * 오래된 것부터 버리고(최근 것이 쓸 데가 있다), keepFrom(YYYY-MM-DD) 이전 기록도 버린다.
 */
export function trimRebookLog(entries: RebookLogEntry[], keepFrom: string, max = MAX_REBOOK_LOG): RebookLogEntry[] {
  const kept = entries.filter(e => e.shownAt.slice(0, 10) >= keepFrom);
  return kept.length > max ? kept.slice(kept.length - max) : kept;
}

/** 기간 안의 기록만 — 화면이 "이달" 로 자를 때 쓴다 (yearMonth: YYYY-MM) */
export function entriesInMonth(entries: RebookLogEntry[], yearMonth: string): RebookLogEntry[] {
  return entries.filter(e => e.shownAt.slice(0, 7) === yearMonth);
}

export function summarizeRebook(
  entries: RebookLogEntry[],
  reservations: { customerId: string; date: string; status: string }[],
): RebookSummary {
  const live = new Set<string>();
  for (const r of reservations) {
    // 취소·노쇼는 "잡힌 예약"이 아니다. 지난 날짜의 완료 예약은 성과로 센다(그날 실제로 왔다)
    if (r.status === 'cancelled' || r.status === 'noshow') continue;
    live.add(`${r.customerId}|${r.date}`);
  }
  let shown = 0;
  let clicked = 0;
  let booked = 0;
  for (const e of entries) {
    if (!isEntry(e)) continue;
    shown += 1;
    if (e.clickedAt) clicked += 1;
    if (live.has(`${e.customerId}|${e.suggestedDate}`)) booked += 1;
  }
  const pct = (n: number) => (shown > 0 ? Math.round((n / shown) * 1000) / 10 : null);
  return { shown, clicked, booked, clickRate: pct(clicked), bookRate: pct(booked) };
}

/** 화면 한 줄 — 추천이 없었으면 아무것도 적지 않는다(0건 줄을 보여 주지 않는다) */
export function describeRebookSummary(s: RebookSummary): string | null {
  if (s.shown === 0) return null;
  return `다음 방문 추천 ${s.shown}건 · [예약 잡기] ${s.clicked}건(${s.clickRate}%) · 추천일에 예약이 잡힌 고객 ${s.booked}명(${s.bookRate}%)`;
}

export const REBOOK_STATS_CAVEAT =
  '추천일에 예약이 잡혔는지는 날짜로만 확인한 추정입니다 — 같은 날짜를 따로 잡은 예약도 함께 세어집니다. 취소·노쇼 예약은 세지 않습니다.';
