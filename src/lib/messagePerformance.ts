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
 * 금액을 숨기는 화면의 줄 순서 — **화면에 보이는 이름 순**(274, 리뷰 M-2).
 * 271 은 `customerId` 로 정렬했는데 그 값은 난수라(=순서가 없다) 안내문의 "이름 순" 과 달랐다.
 * 금액 순을 쓰면 맨 위가 최다 결제자라는 사실이 드러나므로, 금액을 숨길 때만 이름 순으로 바꾼다.
 */
function sortForHiddenAmount(rows: DrillRow[]): DrillRow[] {
  return [...rows].sort((a, b) => a.label.localeCompare(b.label, 'ko') || a.key.localeCompare(b.key));
}

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
export function describeHistoryPerformance(p: CampaignPerformance, h: { successCount: number; failCount: number }, formatPrice: (n: number) => string, showMoney = true): string | null {
  if (h.failCount <= 0) return describePerformance(p, formatPrice, showMoney);
  if (p.sent === 0) return null;
  const money = showMoney && p.revenue > 0 ? ` ${formatPrice(p.revenue)}` : ''; // 매출 권한 없으면 금액을 빼고 사람 수만 (270, 리뷰 M-1)
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
  const labeled: DrillRow[] = all.map(r => ({
    key: r.customerId,
    label: nameOf.get(r.customerId) || '삭제된 고객',
    detail: [
      `발송 ${r.sentOn} · 창 ${r.windowEnd} 까지`,
      r.reservedOn ? `예약 ${r.reservedOn}` : '예약 없음',
      r.paidOn ? `결제 ${r.paidOn}` : '결제 없음', // 0원 완료 결제도 결제다 — 금액으로 판정하지 않는다 (270, 리뷰 M-4)
    ].join(' · '),
    amount: r.amount,
  }));
  // 금액을 숨길 때만 이름 순으로(그 뒤 자른다) — 금액 순 그대로면 맨 위가 최다 결제자다 (274, 리뷰 M-2)
  const rows = (opts.showMoney === false ? sortForHiddenAmount(labeled) : labeled).slice(0, DRILL_MAX_ROWS);
  return {
    rows,
    total,
    ...(all.length > DRILL_MAX_ROWS ? { truncatedFrom: all.length } : {}),
    // 금액을 0 으로 바꿔 넘기지 않는다 — 칸 자체를 숨긴다(0 원이라고 적으면 거짓) (270, 리뷰 H-1)
    ...(opts.showMoney === false ? { hideAmount: true } : {}),
    caveat: [
      '창 안에 예약·결제가 있었다는 사실만 보여 줍니다. 이 문자 때문이라는 뜻은 아닙니다(추정).',
      '보낸 뒤 실패한 수신자도 이 목록에 있습니다(게이트웨이가 건수만 돌려줘 실패자를 가릴 수 없습니다).',
      '다른 PC 에서 보낸 건과 사이드맵 기록 이전 발송은 빠집니다.',
      opts.showMoney === false ? '결제 금액은 매출 권한이 있는 계정에서만 보입니다.' : '',
    ].filter(Boolean).join(' '),
    empty: '이 발송의 수신 고객 기록이 없습니다.',
  };
}

/**
 * 캠페인 성과 근거 목록 (267, GAP M-6) — 발송 이력 쪽(263)과 **같은 규칙·같은 모양**.
 * 캠페인은 고객마다 발송 시각이 달라(회차·조건에 따라) 고객별 첫 발송일부터 창을 연다.
 * 발송 기록이 없으면 빈 목록 + 빈 상태 문구를 돌려준다(버튼은 성과 줄이 있을 때만 보이므로 실제로는 비지 않는다).
 */
export function campaignPerformanceDrill(sends: { customerId: string; at: string }[], opts: { showMoney?: boolean } = {}): DrillResult {
  const set = new Set(sends.map(s => s.customerId));
  const resv = ReservationStore.getAll().filter(r => set.has(r.customerId));
  const pays = PaymentStore.getAll().filter(p => !!p.customerId && set.has(p.customerId));
  const nameOf = new Map(CustomerStore.getAll().map(c => [c.id, c.name]));
  const all = performanceRows(sends, resv, pays);
  const total = all.reduce((a, r) => a + r.amount, 0);
  const labeled: DrillRow[] = all.map(r => ({
    key: r.customerId,
    label: nameOf.get(r.customerId) || '삭제된 고객',
    detail: [
      `발송 ${r.sentOn} · 창 ${r.windowEnd} 까지`,
      r.reservedOn ? `예약 ${r.reservedOn}` : '예약 없음',
      r.paidOn ? `결제 ${r.paidOn}` : '결제 없음', // 0원 완료 결제도 결제다 (270, 리뷰 M-4)
    ].join(' · '),
    amount: r.amount,
  }));
  // 금액을 숨길 때만 이름 순으로(그 뒤 자른다) — 금액 순 그대로면 맨 위가 최다 결제자다 (274, 리뷰 M-2)
  const rows = (opts.showMoney === false ? sortForHiddenAmount(labeled) : labeled).slice(0, DRILL_MAX_ROWS);
  return {
    rows,
    total,
    ...(all.length > DRILL_MAX_ROWS ? { truncatedFrom: all.length } : {}),
    ...(opts.showMoney === false ? { hideAmount: true } : {}), // (270, 리뷰 H-1)
    caveat: [
      '창 안에 예약·결제가 있었다는 사실만 보여 줍니다. 이 캠페인 때문이라는 뜻은 아닙니다(추정).',
      '이 PC 의 발송 기록 기준입니다 — 다른 PC 에서 보낸 건은 빠집니다(서버 보관은 승인 뒤).',
      opts.showMoney === false ? '결제 금액은 매출 권한이 있는 계정에서만 보입니다.' : '',
    ].filter(Boolean).join(' '),
    empty: '이 캠페인으로 보낸 기록이 아직 없습니다.',
  };
}
