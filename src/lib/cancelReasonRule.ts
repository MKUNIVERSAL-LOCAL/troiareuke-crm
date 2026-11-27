// ═══════════════════════════════════════════════════════════════
// cancelReasonRule — 취소·노쇼 사유 규칙 (순수 모듈, 244, GAP R-10 후속)
// ───────────────────────────────────────────────────────────────
// 왜: 취소·노쇼는 숫자만 세고 "왜" 를 묻지 않았다. 매장 사정으로 깬 예약과 고객이 일정을 바꾼 예약이
//     한 덩어리로 보이면 손 쓸 데를 못 찾는다(상용 CRM Zenoti·Boulevard 는 취소 사유를 받아 보고서로 낸다).
// 정직성: 사유는 선택 입력이라 적지 않은 건이 생긴다 → 집계에 "사유 미기록 N건" 을 반드시 함께 적는다.
//          기록은 예약 id 옆에 두므로(설정 행) 예약이 지워지면 사유도 지운다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export type CancelKind = 'cancelled' | 'noshow';

/** by: 사유의 책임이 누구 쪽인지 — 매장 쪽(shop) 건수는 운영으로 줄일 수 있는 몫이다 */
export interface ReasonOption { id: string; label: string; by: 'customer' | 'shop' | 'unknown' }

const CANCEL_REASONS: ReasonOption[] = [
  { id: 'customer-schedule', label: '고객 일정 변경', by: 'customer' },
  { id: 'customer-condition', label: '고객 몸 상태·개인 사정', by: 'customer' },
  { id: 'shop-schedule', label: '매장 사정(직원·설비)', by: 'shop' },
  { id: 'duplicate', label: '중복·잘못 입력', by: 'shop' },
  { id: 'price', label: '가격·시술 상담 중단', by: 'customer' },
  { id: 'unreachable', label: '연락이 닿지 않음', by: 'unknown' },
];

const NOSHOW_REASONS: ReasonOption[] = [
  { id: 'no-contact', label: '연락 없이 오지 않음', by: 'customer' },
  { id: 'late-notice', label: '시간 지나 뒤늦게 연락', by: 'customer' },
  { id: 'wrong-date', label: '고객 날짜·시간 착오', by: 'customer' },
  { id: 'reminder-missed', label: '예약 안내를 못 받음', by: 'shop' },
];

export function reasonOptions(kind: CancelKind): ReasonOption[] {
  return kind === 'noshow' ? NOSHOW_REASONS : CANCEL_REASONS;
}

/**
 * 라벨·책임을 찾을 때는 **두 목록을 모두** 본다 (246 리뷰 M-3).
 * 취소로 적힌 예약을 노쇼로 바꾸는 식으로 상태와 기록의 kind 가 어긋나면,
 * 그 kind 목록에서만 찾던 코드가 내부 영어 id('no-contact')를 사장 화면에 사유로 찍었다.
 */
function findOption(value: string): ReasonOption | undefined {
  return CANCEL_REASONS.find(o => o.id === value) ?? NOSHOW_REASONS.find(o => o.id === value);
}

/** 등록된 보기인가 — 직접 입력(개인 사정이 적힐 수 있다)과 구분한다 (246 리뷰 M-4) */
export function isPresetReason(value: string): boolean {
  return findOption(value) !== undefined;
}

export const MAX_REASON_TEXT = 30;

/** 직접 입력 사유 정리 — 공백 축약·길이 제한. 빈 값이면 '' (기록하지 않는다) */
export function normalizeReasonText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_TEXT);
}

/** 저장값 → 화면 문구. 등록된 보기면 그 라벨, 아니면 직접 입력한 말 그대로 */
export function labelFor(kind: CancelKind, value: string): string {
  void kind; // 두 목록을 모두 보므로 kind 는 필요 없다 — 호출부 호환을 위해 남긴다
  const hit = findOption(value);
  return hit ? hit.label : normalizeReasonText(value);
}

function byOf(value: string): ReasonOption['by'] {
  const hit = findOption(value);
  return hit ? hit.by : 'unknown'; // 직접 입력은 책임을 짐작하지 않는다
}

export interface ReasonCount { label: string; count: number; by: ReasonOption['by'] }

export interface ReasonSummary {
  cancelled: number;
  noshow: number;
  /** 사유가 적힌 건수 */
  recorded: number;
  /** 사유를 적지 않은 건수 — 숨기지 않는다 */
  missing: number;
  /** 매장 쪽 사유 건수(직원·설비·중복 입력·안내 누락) */
  shopSide: number;
  /** 많은 사유 순서 */
  top: ReasonCount[];
}

/**
 * 한 달 집계. totals 는 예약에서 센 실제 취소·노쇼 건수, records 는 그중 사유가 적힌 것.
 * records 가 totals 보다 많으면(지워진 예약의 사유가 남은 경우) totals 를 믿는다 — 화면 숫자는 예약이 정본.
 */
export function summarizeReasons(
  totals: { cancelled: number; noshow: number },
  records: { kind: CancelKind; reason: string }[],
): ReasonSummary {
  const counts = new Map<string, ReasonCount>();
  let recorded = 0;
  let shopSide = 0;
  for (const rec of records) {
    const label = labelFor(rec.kind, rec.reason);
    if (!label) continue;
    recorded += 1;
    if (byOf(rec.reason) === 'shop') shopSide += 1;
    const prev = counts.get(label);
    if (prev) prev.count += 1;
    else counts.set(label, { label, count: 1, by: byOf(rec.reason) });
  }
  const total = totals.cancelled + totals.noshow;
  return {
    cancelled: totals.cancelled,
    noshow: totals.noshow,
    recorded: Math.min(recorded, total),
    missing: Math.max(0, total - recorded),
    shopSide: Math.min(shopSide, total), // 지워진 예약의 기록이 남아 총건수를 넘기지 않게 (246 리뷰 M-5)
    top: [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

/**
 * 화면 한 줄 — 취소·노쇼가 없으면 아무것도 적지 않는다.
 * monthLabel: 보고 있는 달("11월") — 주간 보기가 달을 넘나들 때 "이달" 이 어느 달인지 모르던 것 (246 리뷰 L-10).
 * **매장 쪽 사유 건수**를 함께 적는다 — 운영으로 줄일 수 있는 몫이라 이 기능의 핵심 숫자인데
 * 계산만 하고 화면에 없었다 (246 리뷰 M-5).
 */
export function describeReasonSummary(s: ReasonSummary, monthLabel?: string, topN = 3): string | null {
  if (s.cancelled + s.noshow === 0) return null;
  const head = `${monthLabel ?? '이달'} 취소 ${s.cancelled}건 · 노쇼 ${s.noshow}건`;
  const shop = s.shopSide > 0 ? ` · 그중 매장 쪽 사유 ${s.shopSide}건` : '';
  if (s.top.length === 0) return `${head} — 사유 미기록 ${s.missing}건`;
  const list = s.top.slice(0, topN).map(t => `${t.label} ${t.count}건`).join(' · ');
  const tail = s.missing > 0 ? ` · 사유 미기록 ${s.missing}건` : '';
  return `${head} — ${list}${tail}${shop}`;
}

/**
 * 지난달과 비교 (253) — 숫자 하나로는 "많은 건지" 알 수 없다. 매장이 손 쓸 수 있는 몫(매장 쪽 사유)이
 * 늘었는지가 핵심이라 그 변화를 따로 돌려준다.
 * 정직성: 지난달 자료가 아예 없으면(기록 시작 전) 비교하지 않는다 — 0 에서 늘었다고 말하지 않는다.
 */
export interface ReasonTrend {
  /** 지난달 자료가 있는가(취소·노쇼가 한 건이라도 있었는가) — 건수 비교의 조건 */
  comparable: boolean;
  /**
   * 매장 쪽 사유를 비교할 수 있는가 — **두 달 모두 사유가 적혀 있어야** 한다.
   * 지난달에 아무도 사유를 적지 않았으면 previous.shopSide 가 0 이라 "매장 쪽 +3" 처럼
   * 거짓 악화(또는 이번 달에 안 적으면 거짓 개선)를 말했다 (254 리뷰 H-1).
   */
  shopComparable: boolean;
  /** 지난달에 사유가 적힌 건수 — 화면이 기준을 밝힐 때 쓴다 */
  previousRecorded: number;
  cancelDelta: number;
  noshowDelta: number;
  shopSideDelta: number;
}

export function compareReasonMonths(current: ReasonSummary, previous: ReasonSummary): ReasonTrend {
  const comparable = previous.cancelled + previous.noshow > 0;
  return {
    comparable,
    shopComparable: previous.recorded > 0 && current.recorded > 0,
    previousRecorded: previous.recorded,
    cancelDelta: current.cancelled - previous.cancelled,
    noshowDelta: current.noshow - previous.noshow,
    shopSideDelta: current.shopSide - previous.shopSide,
  };
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/** 한 줄 꼬리말 — 비교할 수 없거나 변화가 없으면 아무것도 적지 않는다 */
export function describeReasonTrend(t: ReasonTrend): string | null {
  if (!t.comparable) return null;
  const parts: string[] = [];
  if (t.cancelDelta !== 0) parts.push(`취소 ${signed(t.cancelDelta)}`);
  if (t.noshowDelta !== 0) parts.push(`노쇼 ${signed(t.noshowDelta)}`);
  // 매장 쪽 사유는 두 달 모두 사유가 적혀 있을 때만 비교한다 (254 리뷰 H-1)
  if (t.shopComparable && t.shopSideDelta !== 0) parts.push(`매장 쪽 사유 ${signed(t.shopSideDelta)}`);
  if (parts.length === 0) return '지난달과 취소·노쇼 건수가 같습니다';
  const basis = t.shopComparable ? ` (지난달 사유 기록 ${t.previousRecorded}건 기준)` : '';
  return `지난달 대비 ${parts.join(' · ')}${basis}`;
}

/** 지난달(YYYY-MM) */
export function previousMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
