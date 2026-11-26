/**
 * 수동 발송(발송 창·상담 결과 안내) 성과 추정 — 발송 뒤 14일 안의 예약·결제를 "그 문자 덕" 으로 본다는 추정이지 인과가 아니다(화면은 항상 [추정]).
 * 숫자는 순수 규칙(campaignPerformanceRule)에서만 계산하고, 여기서는 이 PC 사이드맵(206)의 수신 고객으로 입력을 모은다 (211, GAP M-6 확장).
 * 행마다 전수 스캔을 하지 않도록 호출 쪽이 누른 행만 계산한다(발송 이력 "성과 보기").
 */
import { ReservationStore, PaymentStore, CustomerStore } from './store';
import { recipientsOf } from './messageRecipients';
import { estimatePerformance, describePerformance, performanceRows, type CampaignPerformance } from './campaignPerformanceRule';
import { DRILL_MAX_ROWS, type DrillResult, type DrillRow } from './revenueDrilldownRule';

/**
 * 이력 1건의 성과 추정. 수신 고객 기록이 없으면(204·206 전 이력·다른 PC 발송) null — 값을 만들지 않는다.
 * @param known 호출 쪽이 이미 가진 수신 고객(발송 이력 화면의 목록 색인) — 사이드맵을 다시 읽지 않게 (215, 211 리뷰 L-2)
 */
export function estimateHistoryPerformance(historyId: string, sentAt: string, known?: string[]): CampaignPerformance | null {
  if (Number.isNaN(new Date(sentAt).getTime())) return null; // 옛 toLocaleString 발송일은 창을 계산할 수 없다 — 조용한 0 대신 표시 없음 (215, 리뷰 L-3)
  const ids = known ?? recipientsOf(historyId);
  if (!ids || ids.length === 0) return null;
  const set = new Set(ids);
  const resv = ReservationStore.getAll().filter(r => set.has(r.customerId)); // 이 발송의 수신 고객만 — 전체 예약·결제를 고객마다 훑지 않게
  const pays = PaymentStore.getAll().filter(p => !!p.customerId && set.has(p.customerId));
  return estimatePerformance(ids.map(id => ({ customerId: id, at: sentAt })), resv, pays);
}

/**
 * 화면 문구 — 부분 실패 발송은 사이드맵에 대상 전원이 적혀 있어 "발송 N명" 이 과대다(게이트웨이가 건수만 돌려줘 실패자를 가릴 수 없다).
 * 실패가 있으면 "대상 N명(성공 M·실패 K)" 으로 바꿔 같은 행의 "실패 K명" 과 모순되지 않게 한다 (215, 211 리뷰 H-1 — 가짜 성공 금지)
 */
export function describeHistoryPerformance(p: CampaignPerformance, h: { successCount: number; failCount: number }, formatPrice: (n: number) => string): string | null {
  if (h.failCount <= 0) return describePerformance(p, formatPrice);
  if (p.sent === 0) return null;
  const money = p.revenue > 0 ? ` ${formatPrice(p.revenue)}` : '';
  return `[추정] 대상 ${p.sent}명(성공 ${h.successCount}명·실패 ${h.failCount}명) → ${p.windowDays}일 내 예약 ${p.reserved}명 · 결제 ${p.paid}명${money}`;
}

/**
 * 성과 추정의 근거 목록 — "누가 세어졌는지" 를 고객 한 줄씩 보여 준다 (263, GAP M-6).
 * 숫자(estimateHistoryPerformance)와 **같은 창·같은 조건**으로 고르므로 합계가 요약 줄의 금액과 같다.
 * 수신 고객 기록이 없으면 null — 값을 만들지 않는다.
 */
export function historyPerformanceDrill(historyId: string, sentAt: string, known?: string[], opts: { showMoney?: boolean } = {}): DrillResult | null {
  if (Number.isNaN(new Date(sentAt).getTime())) return null;
  const ids = known ?? recipientsOf(historyId);
  if (!ids || ids.length === 0) return null;
  const set = new Set(ids);
  const resv = ReservationStore.getAll().filter(r => set.has(r.customerId));
  const pays = PaymentStore.getAll().filter(p => !!p.customerId && set.has(p.customerId));
  const nameOf = new Map(CustomerStore.getAll().map(c => [c.id, c.name]));
  const all = performanceRows(ids.map(id => ({ customerId: id, at: sentAt })), resv, pays);
  const total = all.reduce((a, r) => a + r.amount, 0);     // 자른 줄도 합계에는 들어간다 (260 규약)
  const rows: DrillRow[] = all.slice(0, DRILL_MAX_ROWS).map(r => ({
    key: r.customerId,
    label: nameOf.get(r.customerId) || '삭제된 고객',
    detail: [
      `발송 ${r.sentOn} · 창 ${r.windowEnd} 까지`,
      r.reservedOn ? `예약 ${r.reservedOn}` : '예약 없음',
      opts.showMoney === false ? (r.amount > 0 ? '결제 있음' : '결제 없음') : (r.paidOn ? `결제 ${r.paidOn}` : '결제 없음'),
    ].join(' · '),
    // 금액을 볼 권한이 없는 화면에서는 0 으로 — 문자 화면은 직원도 쓴다 (266, 리뷰 M-4)
    amount: opts.showMoney === false ? 0 : r.amount,
  }));
  return {
    rows,
    total: opts.showMoney === false ? 0 : total,
    ...(all.length > DRILL_MAX_ROWS ? { truncatedFrom: all.length } : {}),
    caveat: [
      '이 발송의 **수신 고객 전원**입니다 — 예약·결제가 없던 분도 함께 보여 줍니다(누가 움직이지 않았는지도 사실이라서).',
      '창 안에 예약·결제가 있었다는 사실만 보여 줍니다. 이 문자 때문이라는 뜻은 아닙니다(추정).',
      '보낸 뒤 실패한 수신자도 이 목록에 있습니다(게이트웨이가 건수만 돌려줘 실패자를 가릴 수 없습니다).',
      '다른 PC 에서 보낸 건과 사이드맵 기록 이전 발송은 빠집니다.',
      opts.showMoney === false ? '금액은 매출 권한이 있는 계정에서만 보입니다.' : '',
    ].filter(Boolean).join(' '),
    empty: '이 발송의 수신 고객 기록이 없습니다.',
  };
}
