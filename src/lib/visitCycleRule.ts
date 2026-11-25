/**
 * visitCycleRule — 고객별 방문 주기 산출 규칙 (순수 모듈, 저장소 의존 없음). 정의는 docs/ANALYTICS-DEFINITIONS.md "방문 주기".
 * 재방문 권장일·리마인더·고객 상세는 지금까지 매장 공통 주기(기본 28일) 하나만 썼다 — 2주 간격 고객과 3개월 간격 고객이 같은 날 "기한 지남"이 됐다
 * (마스터 프롬프트 12절 "모든 고객에게 일괄 30일 기준을 적용하지 마라", GAP C-5, 2026-11-24).
 *  - 개인 주기 = 서로 다른 방문일 사이 간격(일)의 **중앙값**(이상치 — 한 번 오래 쉰 것 — 에 덜 흔들린다)
 *  - 방문 3회 이상(간격 2개 이상)일 때만 개인 주기, 아니면 매장 기본 주기(basis 'shop')
 *  - 7~365일로 묶는다(설정 화면의 범위와 같다 — 주 1회 회차권은 7, 그보다 짧은 간격은 7로)
 */
export const MIN_INTERVALS_FOR_PERSONAL = 2; // 방문 3회
export const PERSONAL_CYCLE_MIN_DAYS = 7;
export const PERSONAL_CYCLE_MAX_DAYS = 365;

export interface VisitCycle {
  days: number;
  basis: 'personal' | 'shop';
  intervals: number; // 개인 주기 근거가 된 간격 수(0 이면 매장 기준)
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000);
}

/** 방문일 목록(YYYY-MM-DD, 중복·순서 무관) → 개인 주기. 간격이 2개 미만이면 null */
export function personalCycleDays(visitDates: Iterable<string>): { days: number; intervals: number } | null {
  const days = [...new Set([...visitDates].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) { const g = dayDiff(days[i - 1], days[i]); if (g > 0) gaps.push(g); }
  if (gaps.length < MIN_INTERVALS_FOR_PERSONAL) return null;
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  const clamped = Math.min(PERSONAL_CYCLE_MAX_DAYS, Math.max(PERSONAL_CYCLE_MIN_DAYS, Math.round(median)));
  return { days: clamped, intervals: gaps.length };
}

/** 개인 주기가 있으면 그것, 없으면 매장 기본 주기 */
export function resolveVisitCycle(visitDates: Iterable<string>, shopDefaultDays: number): VisitCycle {
  const p = personalCycleDays(visitDates);
  return p ? { days: p.days, basis: 'personal', intervals: p.intervals } : { days: shopDefaultDays, basis: 'shop', intervals: 0 };
}
