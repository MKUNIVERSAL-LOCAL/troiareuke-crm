/**
 * publicSlotsRule — 고객에게 보여 줄 "예약 가능 시작 시각" (순수 모듈). 143, GAP R-6 1단계.
 * 직원별 가용 시작(availabilityRule + staffScheduleRule 로 직원마다 계산한 분 배열)의 합집합에서,
 * 베드·룸 상한(resourceRule)에 걸리는 칸을 뺀다. 서버 공개 라우트(승인 B-2)가 같은 함수를 쓰도록 저장소 의존이 없다.
 */
import { overlaps, type Interval } from './schedulingRule';

export interface ResourceCapacity { total: number; busy: Interval[] }

/** @param staffStarts 직원마다 가능한 시작 시각(분) 배열 @param capacity 사용 중 자원 수와 그날 배정된 예약 구간(없으면 null) */
export function publicSlots(staffStarts: number[][], durationMin: number, capacity: ResourceCapacity | null): number[] {
  const dur = Math.max(0, durationMin || 0);
  const union = Array.from(new Set(staffStarts.flat())).sort((a, b) => a - b);
  if (!capacity) return union;
  if (capacity.total <= 0) return [];
  return union.filter(t => {
    const block: Interval = { startMin: t, endMin: t + dur };
    const used = capacity.busy.filter(b => overlaps(block, b)).length;
    return used < capacity.total;
  });
}
