/**
 * resourceRule — 베드/룸 자원 배정·충돌의 순수 규칙 (저장소 의존 없음). 142, GAP R-5.
 *  - 자원은 한 번에 예약 하나만 쓴다(처리량 상한). 같은 날·같은 자원에 배정된 예약(취소/노쇼·본인 제외)과 반개구간으로 겹치면 충돌.
 *  - "자동 배정"은 등록 순서대로 첫 번째 빈 자원 — 매장이 자원 목록 순서로 우선순위를 정한다.
 */
import { toInterval, overlaps, type Interval } from './schedulingRule';
import type { Resource } from '../types';

export interface ResourceCandidate { startMin: number; endMin: number; date: string; excludeId?: string }
export interface AssignedReservation { id: string; date: string; startTime: string; endTime?: string; status: string; customerName?: string }

/** 그 자원을 같은 날 쓰는 예약 가운데 후보와 겹치는 것(시간이 깨진 예약은 충돌로 봐 확인) */
export function resourceConflicts(resourceId: string, assignments: Record<string, string>, reservations: AssignedReservation[], c: ResourceCandidate): AssignedReservation[] {
  const cand: Interval = { startMin: c.startMin, endMin: c.endMin };
  return reservations.filter(r => {
    if (r.id === c.excludeId || r.date !== c.date || r.status === 'cancelled' || r.status === 'noshow') return false;
    if (assignments[r.id] !== resourceId) return false;
    const iv = toInterval(r.startTime, r.endTime);
    return iv === null ? true : overlaps(cand, iv);
  });
}

/** 후보 시간에 비어 있는 자원들(사용 중인 자원만, 목록 순서 유지) */
export function freeResources(resources: Resource[], assignments: Record<string, string>, reservations: AssignedReservation[], c: ResourceCandidate): Resource[] {
  return resources.filter(res => res.isActive && resourceConflicts(res.id, assignments, reservations, c).length === 0);
}

export const RESOURCE_KIND_LABEL: Record<Resource['kind'], string> = { bed: '베드', room: '룸', device: '장비' };
