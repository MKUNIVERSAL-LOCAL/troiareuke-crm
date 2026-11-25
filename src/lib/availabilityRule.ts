/**
 * availabilityRule — 가용 시작 시각 계산 (순수 모듈). 140, GAP R-4 1단계.
 * Easy!Appointments 의 규칙 순서(영업시간 → 휴게 → 차단 구간 → 기존 예약 → 간격 분할 → 소요 시간이 들어가는 칸만 → 사전 마감)를 **참고해 자체 구현**.
 * 지금 모델에는 영업시간·기존 예약만 있으므로 휴게·직원 근무표·자원은 busy 구간으로 넘기면 된다(141 에서 근무표·버퍼 모델 추가 예정).
 */
import { fromMinutes, overlaps, type Interval } from './schedulingRule';

export interface AvailabilityInput {
  openMin: number;            // 영업 시작(분)
  closeMin: number;           // 영업 끝(분, 자정 넘김은 1440+)
  durationMin: number;        // 시술 소요
  busy: Interval[];           // 기존 예약·휴게·차단
  stepMin?: number;           // 칸 간격(기본 30)
  bufferBeforeMin?: number;   // 시술 전 준비(기본 0)
  bufferAfterMin?: number;    // 시술 뒤 정리(기본 0)
  notBeforeMin?: number | null; // 이 시각 이전은 제외(오늘이면 지금)
}

/** 가능한 시작 시각(분) — 시술 구간이 영업(근무)시간 안에 들어가고, 준비·정리를 붙인 구간이 busy 와 겹치지 않는 칸 */
export function availableStarts(i: AvailabilityInput): number[] {
  const step = i.stepMin && i.stepMin > 0 ? i.stepMin : 30;
  const before = Math.max(0, i.bufferBeforeMin || 0), after = Math.max(0, i.bufferAfterMin || 0);
  const dur = Math.max(0, i.durationMin || 0);
  if (!(i.closeMin > i.openMin) || dur <= 0) return [];
  const out: number[] = [];
  const first = Math.ceil(i.openMin / step) * step;
  for (let t = first; t + dur <= i.closeMin; t += step) {
    if (i.notBeforeMin != null && t < i.notBeforeMin) continue;
    if (t < i.openMin) continue;
    // 준비·정리 버퍼는 기존 예약·휴게와의 간격에만 쓴다 — 근무 시작 전 준비·마감 뒤 정리는 허용(경고 규칙 checkStaffWindow 와 같은 기준) (144 리뷰 M-6)
    const block: Interval = { startMin: t - before, endMin: t + dur + after };
    if (i.busy.some(b => overlaps(block, b))) continue;
    out.push(t);
  }
  return out;
}

/** 앞에서 count 개를 'HH:mm' 로 */
export function nextAvailable(i: AvailabilityInput, count = 3): string[] {
  return availableStarts(i).slice(0, Math.max(0, count)).map(fromMinutes);
}
