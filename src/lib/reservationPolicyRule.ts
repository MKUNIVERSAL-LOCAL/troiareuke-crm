// reservationPolicyRule — 예약 정책 판정 (순수, 173, GAP R-3 2단계). 저장은 reservationPolicy.ts(설정 행)
export interface ReservationPolicy { blockOverlap: boolean }
export const DEFAULT_RESERVATION_POLICY: ReservationPolicy = { blockOverlap: false };

export type OverlapDecision = 'allow' | 'confirm' | 'block';
/** 겹침이 있을 때 — 정책이 켜져 있으면 막고(block), 꺼져 있으면 확인(confirm). 겹침이 없으면 allow. 버퍼·근무 창 경고는 정책과 무관하게 confirm */
export function decideOverlap(policy: ReservationPolicy, hasStaffOverlap: boolean): OverlapDecision {
  if (!hasStaffOverlap) return 'allow';
  return policy.blockOverlap ? 'block' : 'confirm';
}
