/**
 * rfmRule — RFM(최근성 Recency·빈도 Frequency·금액 Monetary) 5분위 점수와 고객 구분 (순수 모듈). 정의: docs/ANALYTICS-DEFINITIONS.md "RFM".
 *  - 점수는 **매장 안 상대 순위**(백분위)로 1~5: 같은 값은 같은 점수(평균 순위), 고객이 적어도 동작한다(5명 미만이면 점수 폭이 좁아질 뿐).
 *  - 최근성은 "마지막 방문 뒤 지난 일수"가 작을수록 높은 점수, 빈도·금액은 클수록 높은 점수.
 *  - 고객 구분은 점수 규칙으로만 정한다(AI 아님): 미방문 / 신규(방문 1회·R≥4) / 충성 / 우수 / 이탈 우려 / 휴면 / 일반.
 * (마스터 프롬프트 12절, GAP C-6, 2026-11-24)
 */
export interface RfmInput { id: string; recencyDays: number | null; frequency: number; monetary: number }
export type RfmSegment = '미방문' | '신규' | '충성' | '우수' | '이탈 우려' | '휴면' | '일반'; // '이탈 우려'(RFM 상대 순위) ≠ '이탈 위험'(churnRule, 개인 주기 대비) — 같은 단어가 두 정의로 보이던 것 (139 #M5)
export interface RfmScore { r: number; f: number; m: number; segment: RfmSegment }

/** 값 배열 → 1~5 점수(백분위 기준, 동점은 평균 순위). higherIsBetter=false 면 작을수록 5점 */
export function quintileScores(values: number[], higherIsBetter = true): number[] {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map(v => {
    let less = 0, equal = 0;
    for (const x of sorted) { if (x < v) less++; else if (x === v) equal++; else break; }
    const pct = (less + equal / 2) / n;              // 0~1, 동점은 가운데
    const p = higherIsBetter ? pct : 1 - pct;
    return Math.min(5, Math.max(1, Math.floor(p * 5) + 1));
  });
}

export function segmentOf(score: { r: number; f: number; m: number }, hasVisit: boolean, frequency: number): RfmSegment {
  if (!hasVisit) return '미방문';
  if (frequency <= 1 && score.r >= 4) return '신규';
  if (score.r >= 4 && score.f >= 4) return '충성';
  if (score.r >= 3 && score.m >= 4) return '우수';
  if (score.r <= 2 && (score.f >= 3 || score.m >= 4)) return '이탈 우려';
  if (score.r <= 2) return '휴면';
  return '일반';
}

/** 고객 집합 전체를 한 번에 — 방문 기록이 없는 고객은 점수 1·'미방문'(백분위 계산에서는 제외) */
export function scoreRfm(inputs: RfmInput[]): Map<string, RfmScore> {
  const visited = inputs.filter(i => i.recencyDays !== null);
  const rs = quintileScores(visited.map(i => i.recencyDays as number), false);
  const fsc = quintileScores(visited.map(i => i.frequency), true);
  const ms = quintileScores(visited.map(i => i.monetary), true);
  const out = new Map<string, RfmScore>();
  visited.forEach((i, k) => { const sc = { r: rs[k], f: fsc[k], m: ms[k] }; out.set(i.id, { ...sc, segment: segmentOf(sc, true, i.frequency) }); });
  for (const i of inputs) if (i.recencyDays === null) out.set(i.id, { r: 1, f: 1, m: 1, segment: '미방문' });
  return out;
}
