/** 발송 이력 판정 규칙(순수) — 발송 이력 화면·고객 활동 타임라인이 같은 식을 쓴다 (206, 203~205 리뷰 L-1) */

/**
 * 게이트웨이 미연동 건 — 실패로 기록되지만 발송을 시도한 것이 아니다. 비용이 0·없음(null 포함)이고 성공 0 인 실패 건.
 * 실제 실패(발송사 거절)는 Messaging 이 cost 0 으로 같이 기록하므로 현 저장 경로에서는 둘이 같은 모양 — 화면은 둘 다 "미연동" 쪽으로 정직하게(성공처럼 보이지 않게) 표기한다.
 */
export function isGatewayPendingHistory(h: { status: string; successCount: number; cost?: number | null }): boolean {
  return h.status === 'failed' && h.successCount === 0 && !(h.cost ?? 0);
}
