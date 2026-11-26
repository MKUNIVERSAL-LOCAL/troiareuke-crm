// reservationPolicy — 예약 정책(겹침 하드 블록) 저장 (비코어, 173, GAP R-3 2단계). 판정 규칙은 순수 reservationPolicyRule.ts
// 1단계(140)는 겹침을 경고하고 강행할 수 있었다. 이 정책을 켜면 같은 담당자의 겹치는 예약은 저장할 수 없다(빈 시간 제안만).
// 서버 측 409(B-2) 가 붙기 전까지는 클라이언트 판정이다 — 두 PC 가 동시에 같은 칸을 잡는 경우는 서버 승인 뒤 막힌다(설계 SERVER-INTEGRITY-DESIGN).
import { getPreference, setPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';
import { DEFAULT_RESERVATION_POLICY, type ReservationPolicy } from './reservationPolicyRule';

export function getReservationPolicy(): ReservationPolicy {
  const v = getPreference('reservationPolicy');
  return v && typeof v === 'object' ? { ...DEFAULT_RESERVATION_POLICY, ...v } : DEFAULT_RESERVATION_POLICY;
}
/** 304: 저장 판정을 돌려준다 — 이 설정이 안 남으면 다시 열 때 **겹침 예약을 다시 허용**하는데
 *  화면은 "이제 저장할 수 없습니다" 라고 말하고 있었다(284~302 가 설정 자리에서 없앤 그 거짓). */
export function setReservationPolicy(p: ReservationPolicy): PrefLanded {
  return setPreference('reservationPolicy', p);
}
