/**
 * utilizationRule — 가동률(순수 모듈, 180, GAP R-10). 정의: docs/ANALYTICS-DEFINITIONS.md "가동률(이달)".
 *  - 가용 분 = 기간의 날마다 활성 직원별 근무 창(근무표 또는 영업시간) 길이 − 휴게. 매장 휴일은 호출 쪽이 창을 비워 넘긴다
 *  - 예약 분 = 같은 날들의 확정·완료 예약(대기·취소·노쇼 제외) 길이 합 — 종료 시각이 없으면 60분
 *  - 가동률 = 예약 분 ÷ 가용 분(%, 정수). 가용 분 0 이면 null(화면 "-"). 근무 외 예약도 세므로 100% 를 넘을 수 있다 — 그대로 보여 준다
 */
import { toInterval, type Interval } from './schedulingRule';

export interface UtilizationDay { date: string; windows: { work: Interval | null; breaks: Interval[] }[] }
export interface UtilizationInput {
  days: UtilizationDay[];
  reservations: { date: string; status: string; startTime: string; endTime: string }[];
}
export interface Utilization { bookedMin: number; availableMin: number; rate: number | null }

/** 분 → 시간 표기(소수 1자리, .0 은 생략: 270 → "4.5", 1020 → "17") — 타일·브리핑이 같은 숫자를 보이게 (182 리뷰 L-1) */
export function formatHours(min: number): string {
  return (min / 60).toFixed(1).replace(/\.0$/, '');
}

const len = (iv: Interval) => Math.max(0, iv.endMin - iv.startMin);

export function utilization(i: UtilizationInput): Utilization {
  let availableMin = 0;
  const dates = new Set<string>();
  for (const d of i.days) {
    dates.add(d.date);
    for (const w of d.windows) if (w.work) availableMin += Math.max(0, len(w.work) - w.breaks.reduce((s, b) => s + len(b), 0));
  }
  let bookedMin = 0;
  for (const r of i.reservations) {
    if (!dates.has(r.date) || (r.status !== 'confirmed' && r.status !== 'completed')) continue;
    const iv = toInterval(r.startTime, r.endTime);
    if (iv) bookedMin += len(iv);
  }
  return { bookedMin, availableMin, rate: availableMin > 0 ? Math.round((bookedMin / availableMin) * 100) : null };
}
