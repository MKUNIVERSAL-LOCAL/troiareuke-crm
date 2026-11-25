/**
 * upcomingRule — "다음 예약이 잡혀 있다"의 단일 정의 (순수). 139(135~138 리뷰 #H3·#M3).
 * 재예약률·이탈 위험·재방문 리마인더가 각자 다른 조건(오늘 완료 예약 포함, 노쇼 포함/제외)을 써서 숫자가 어긋났다.
 *  - 취소·노쇼 제외
 *  - 오늘 이후 날짜, 또는 오늘이면서 아직 완료되지 않은 예약
 */
export function isUpcomingReservation(r: { date: string; status: string }, today: string): boolean {
  if (r.status === 'cancelled' || r.status === 'noshow') return false;
  return r.date > today || (r.date === today && r.status !== 'completed');
}
