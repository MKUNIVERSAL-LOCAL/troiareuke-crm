/**
 * 수동 발송(발송 창·상담 결과 안내) 성과 추정 — 발송 뒤 14일 안의 예약·결제를 "그 문자 덕" 으로 본다는 추정이지 인과가 아니다(화면은 항상 [추정]).
 * 숫자는 순수 규칙(campaignPerformanceRule)에서만 계산하고, 여기서는 이 PC 사이드맵(206)의 수신 고객으로 입력을 모은다 (211, GAP M-6 확장).
 * 행마다 전수 스캔을 하지 않도록 호출 쪽이 누른 행만 계산한다(발송 이력 "성과 보기").
 */
import { ReservationStore, PaymentStore } from './store';
import { recipientsOf } from './messageRecipients';
import { estimatePerformance, type CampaignPerformance } from './campaignPerformanceRule';

/** 이력 1건의 성과 추정. 수신 고객 기록이 없으면(204·206 전 이력·다른 PC 발송) null — 값을 만들지 않는다 */
export function estimateHistoryPerformance(historyId: string, sentAt: string): CampaignPerformance | null {
  const ids = recipientsOf(historyId);
  if (!ids || ids.length === 0) return null;
  const set = new Set(ids);
  const resv = ReservationStore.getAll().filter(r => set.has(r.customerId)); // 이 발송의 수신 고객만 — 전체 예약·결제를 고객마다 훑지 않게
  const pays = PaymentStore.getAll().filter(p => !!p.customerId && set.has(p.customerId));
  return estimatePerformance(ids.map(id => ({ customerId: id, at: sentAt })), resv, pays);
}
