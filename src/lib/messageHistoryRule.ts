/** 발송 이력 판정 규칙(순수) — 발송 이력 화면·고객 활동 타임라인이 같은 식을 쓴다 (206, 203~205 리뷰 L-1) */

/**
 * 게이트웨이 미연동 건 — 실패로 기록되지만 발송을 시도한 것이 아니다. 비용이 0·없음(null 포함)이고 성공 0 인 실패 건.
 * 실제 실패(발송사 거절)도 cost 0 으로 기록돼 현 저장 경로에서는 둘이 같은 모양이다 — 그래서 할 일 문구는 "나가지 않은 문자"(208·210, 리뷰 L-2), 화면 배지는 둘 다 "미연동" 쪽으로 정직하게(성공처럼 보이지 않게) 표기한다.
 */
export function isGatewayPendingHistory(h: { status: string; successCount: number; cost?: number | null }): boolean {
  return h.status === 'failed' && h.successCount === 0 && !(h.cost ?? 0);
}

export interface ResendableInput { id: string; status: string; successCount: number; cost?: number | null; sentAt: string }
/**
 * 다시 보낼 만한 미연동 건 수 — 발송사가 그 뒤 실제로 살아났을 때만(가장 최근 성공 건보다 먼저 기록된 미연동 건). 성공 건이 없으면 0:
 * 발송사 미연결 매장에 "다시 보내기" 를 권하면 또 미연동으로 끝나는 헛걸음이 된다. 수신 고객이 기록된 건(사이드맵)·최근 days 일 안의 것만 (208)
 */
export function countResendable(history: ResendableInput[], hasRecipients: (historyId: string) => boolean, now: Date, days = 30): number {
  const since = now.getTime() - days * 86_400_000;
  let lastSuccess = -Infinity;
  for (const h of history) if (h.status === 'sent' && h.successCount > 0) { const t = new Date(h.sentAt).getTime(); if (!Number.isNaN(t) && t > lastSuccess) lastSuccess = t; }
  if (lastSuccess === -Infinity) return 0;
  let n = 0;
  for (const h of history) {
    if (!isGatewayPendingHistory(h)) continue;
    const t = new Date(h.sentAt).getTime();
    if (Number.isNaN(t) || t < since || t > lastSuccess) continue;
    if (hasRecipients(h.id)) n += 1;
  }
  return n;
}
