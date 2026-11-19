// ═══════════════════════════════════════════════════════════════
// refundDate — 결제 환불 "처리일" (순수 모듈, 저장소 의존 없음)
// ───────────────────────────────────────────────────────────────
// Payment 에는 환불일 필드가 없다(코어 toDbPayment 화이트리스트 — 필드 추가는 코어). 환불로 바꾸면 원 결제월의 매출이 소급해서 줄고
// 환불을 처리한 달에는 아무 숫자도 남지 않았다(10차 숫자 점검 #M1). 환불 저장 때 memo 앞에 [환불 YYYY-MM-DD] 를 적고(회차권 종료 notes 와 같은 패턴),
// 매출 화면·마감 요약이 "이달/오늘 환불 처리 N원" 보조행을 이 태그로 만든다. 매출 정의(완료 결제 합, 결제일 기준)는 바꾸지 않는다.
// ═══════════════════════════════════════════════════════════════

const REFUND_TAG_RE = /^\[환불 (\d{4}-\d{2}-\d{2})\]\s*/;

/** memo 앞에 환불 처리일 태그를 붙인다(이미 있으면 그대로) */
export function tagRefund(memo: string | undefined, date: string): string {
  const m = memo || '';
  if (REFUND_TAG_RE.test(m)) return m;
  return `[환불 ${date}]${m ? ' ' + m : ''}`;
}

/** 환불 처리일(YYYY-MM-DD) — 환불 결제가 아니거나 태그가 없으면(옛 환불) null */
export function refundedOn(p: { status: string; memo?: string }): string | null {
  if (p.status !== 'refunded') return null;
  const m = REFUND_TAG_RE.exec(p.memo || '');
  return m ? m[1] : null;
}

/** 표시용 memo — 태그를 뺀 나머지 */
export function memoWithoutRefundTag(memo: string | undefined): string {
  return (memo || '').replace(REFUND_TAG_RE, '');
}
