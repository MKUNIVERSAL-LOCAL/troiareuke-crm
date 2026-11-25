// ═══════════════════════════════════════════════════════════════
// rebookStatsRule — 체크아웃 재예약 성과 규칙 (순수 모듈, 243, GAP R-11 후속 / 246 리뷰 반영)
// ───────────────────────────────────────────────────────────────
// 왜: 231 로 "결제 직후 다음 방문 추천"을 넣었지만 그게 실제 예약으로 이어지는지 알 수 없었다.
//     효과를 모르면 주기·문구를 고칠 근거가 없고, 매장은 이 안내가 도움이 되는지 판단할 수 없다.
// 세는 방법(정직하게):
//   - 추천: 안내가 뜬 건수. **고객+추천일이 같으면 한 건**으로 센다 — 시술·제품 결제를 따로 등록하면
//     같은 방문에 안내가 두 번 뜨는데, 그걸 2건으로 세면 성과가 과대·클릭률이 과소가 된다 (246 리뷰 M-1).
//   - 예약 잡기: [예약 잡기] 를 누른 건수.
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
  /** 안내가 뜬 날(매장 기준 YYYY-MM-DD) — ISO 는 UTC 라 달 경계가 어긋난다 (246 리뷰 L-1) */
  day?: string;
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

/** 같은 안내로 볼 기준 — 고객 + 추천일 */
export function rebookKey(e: Pick<RebookLogEntry, 'customerId' | 'suggestedDate'>): string {
  return `${e.customerId}|${e.suggestedDate}`;
}

/** 안내가 뜬 날(매장 기준). 옛 기록은 day 가 없어 ISO 앞 10자로 떨어뜨린다 */
export function entryDay(e: RebookLogEntry): string {
  return e.day && DATE_RE.test(e.day) ? e.day : e.shownAt.slice(0, 10);
}

/**
 * 저장값 정리 — 모양이 깨진 기록은 버린다.
 * 같은 고객+추천일 기록이 여러 건이면 **한 건으로 합치고 [예약 잡기] 기록은 살린다**
 * (전에는 뒤에 온 것으로 덮어 클릭 기록이 사라졌다 — 246 리뷰 L-3).
 */
export function sanitizeRebookLog(value: unknown): RebookLogEntry[] {
  const list = Array.isArray(value) ? value : [];
  const byKey = new Map<string, RebookLogEntry>();
  for (const raw of list) {
    if (!isEntry(raw)) continue;
    const clean: RebookLogEntry = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : `${raw.customerId}-${raw.shownAt}`,
      customerId: raw.customerId,
      suggestedDate: raw.suggestedDate,
      ...(raw.basis ? { basis: String(raw.basis).slice(0, 20) } : {}),
      shownAt: raw.shownAt,
      ...(raw.day && DATE_RE.test(String(raw.day)) ? { day: String(raw.day) } : {}),
      ...(raw.clickedAt ? { clickedAt: String(raw.clickedAt) } : {}),
    };
    const key = rebookKey(clean);
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, clean); continue; }
    // 먼저 뜬 안내를 기준으로 두고, 어느 쪽에든 눌림 기록이 있으면 살린다
    const first = prev.shownAt <= clean.shownAt ? prev : clean;
    const clickedAt = prev.clickedAt ?? clean.clickedAt;
    byKey.set(key, { ...first, ...(clickedAt ? { clickedAt } : {}) });
  }
  return [...byKey.values()].sort((a, b) => a.shownAt.localeCompare(b.shownAt));
}

export const MAX_REBOOK_LOG = 2000;

/**
 * 기록이 무한정 쌓이게 두지 않는다. 오래된 것부터 버리고, keepFrom(YYYY-MM-DD) 이전 기록도 버린다.
 * 버려진 기록의 달은 함께 돌려준다 — 그 달 집계는 실제보다 작으므로 화면이 그 사실을 말해야 한다 (246 리뷰 M-2).
 */
export function trimRebookLog(entries: RebookLogEntry[], keepFrom: string, max = MAX_REBOOK_LOG): { entries: RebookLogEntry[]; droppedMonths: string[] } {
  const dropped = new Set<string>();
  const kept: RebookLogEntry[] = [];
  for (const e of entries) {
    if (entryDay(e) >= keepFrom) kept.push(e);
    else dropped.add(entryDay(e).slice(0, 7));
  }
  if (kept.length > max) {
    for (const e of kept.slice(0, kept.length - max)) dropped.add(entryDay(e).slice(0, 7));
    kept.splice(0, kept.length - max);
  }
  return { entries: kept, droppedMonths: [...dropped].sort() };
}

/** 기간 안의 기록만 — 화면이 "이달" 로 자를 때 쓴다 (yearMonth: YYYY-MM, 매장 기준 날짜) */
export function entriesInMonth(entries: RebookLogEntry[], yearMonth: string): RebookLogEntry[] {
  return entries.filter(e => entryDay(e).slice(0, 7) === yearMonth);
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
  // 고객+추천일이 같으면 한 건 — 같은 방문에 결제를 두 건 올려 안내가 두 번 떴을 때 과대 집계를 막는다
  const seen = new Map<string, boolean>(); // key → 눌렀는지
  for (const e of entries) {
    if (!isEntry(e)) continue;
    const key = rebookKey(e);
    seen.set(key, (seen.get(key) ?? false) || !!e.clickedAt);
  }
  let clicked = 0;
  let booked = 0;
  for (const [key, wasClicked] of seen) {
    if (wasClicked) clicked += 1;
    if (live.has(key)) booked += 1;
  }
  const shown = seen.size;
  const pct = (n: number) => (shown > 0 ? Math.round((n / shown) * 1000) / 10 : null);
  return { shown, clicked, booked, clickRate: pct(clicked), bookRate: pct(booked) };
}

/**
 * 화면 한 줄 — 추천이 없었으면 아무것도 적지 않는다(0건 줄을 보여 주지 않는다).
 * truncated: 보관 한도로 그 달 기록 일부가 빠졌다 → 숫자가 실제보다 작다는 사실을 함께 적는다.
 */
export function describeRebookSummary(s: RebookSummary, truncated = false): string | null {
  if (s.shown === 0) return null;
  const head = `다음 방문 추천 ${s.shown}건 · [예약 잡기] ${s.clicked}건(${s.clickRate}%) · 추천일에 예약이 잡힌 건 ${s.booked}건(${s.bookRate}%)`;
  return truncated ? `${head} — 기록 보관 한도로 이 달 일부가 빠져 실제보다 적게 나옵니다` : head;
}

export const REBOOK_STATS_CAVEAT =
  '이 PC 에 쌓인 기록입니다(다른 PC 의 추천은 세지 않습니다). 추천일에 예약이 잡혔는지는 날짜로만 확인한 추정이라, 같은 날짜를 따로 잡은 예약도 함께 세어지고 고객 사정으로 **다른 날짜**에 잡은 예약은 세어지지 않습니다. 확정·대기 예약은 세고 취소·노쇼는 세지 않습니다.';
