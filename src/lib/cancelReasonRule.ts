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

export const CANCEL_REASONS: ReasonOption[] = [
  { id: 'customer-schedule', label: '고객 일정 변경', by: 'customer' },
  { id: 'customer-condition', label: '고객 몸 상태·개인 사정', by: 'customer' },
  { id: 'shop-schedule', label: '매장 사정(직원·설비)', by: 'shop' },
  { id: 'duplicate', label: '중복·잘못 입력', by: 'shop' },
  { id: 'price', label: '가격·시술 상담 중단', by: 'customer' },
  { id: 'unreachable', label: '연락이 닿지 않음', by: 'unknown' },
];

export const NOSHOW_REASONS: ReasonOption[] = [
  { id: 'no-contact', label: '연락 없이 오지 않음', by: 'customer' },
  { id: 'late-notice', label: '시간 지나 뒤늦게 연락', by: 'customer' },
  { id: 'wrong-date', label: '고객 날짜·시간 착오', by: 'customer' },
  { id: 'reminder-missed', label: '예약 안내를 못 받음', by: 'shop' },
];

export function reasonOptions(kind: CancelKind): ReasonOption[] {
  return kind === 'noshow' ? NOSHOW_REASONS : CANCEL_REASONS;
}

export const MAX_REASON_TEXT = 30;

/** 직접 입력 사유 정리 — 공백 축약·길이 제한. 빈 값이면 '' (기록하지 않는다) */
export function normalizeReasonText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_TEXT);
}

/** 저장값 → 화면 문구. 목록 id 면 그 라벨, 아니면 직접 입력한 말 그대로 */
export function labelFor(kind: CancelKind, value: string): string {
  const hit = reasonOptions(kind).find(o => o.id === value);
  return hit ? hit.label : normalizeReasonText(value);
}

function byOf(kind: CancelKind, value: string): ReasonOption['by'] {
  const hit = reasonOptions(kind).find(o => o.id === value);
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
    if (byOf(rec.kind, rec.reason) === 'shop') shopSide += 1;
    const prev = counts.get(label);
    if (prev) prev.count += 1;
    else counts.set(label, { label, count: 1, by: byOf(rec.kind, rec.reason) });
  }
  const total = totals.cancelled + totals.noshow;
  return {
    cancelled: totals.cancelled,
    noshow: totals.noshow,
    recorded: Math.min(recorded, total),
    missing: Math.max(0, total - recorded),
    shopSide,
    top: [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

/** 화면 한 줄 — 취소·노쇼가 없으면 아무것도 적지 않는다 */
export function describeReasonSummary(s: ReasonSummary, topN = 3): string | null {
  if (s.cancelled + s.noshow === 0) return null;
  const head = `이달 취소 ${s.cancelled}건 · 노쇼 ${s.noshow}건`;
  if (s.top.length === 0) return `${head} — 사유 미기록 ${s.missing}건`;
  const list = s.top.slice(0, topN).map(t => `${t.label} ${t.count}건`).join(' · ');
  const tail = s.missing > 0 ? ` · 사유 미기록 ${s.missing}건` : '';
  return `${head} — ${list}${tail}`;
}
