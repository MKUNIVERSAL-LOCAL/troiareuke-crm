/**
 * refundRule — 환불 모델의 순수 규칙 (저장소 의존 없음). 148, GAP P-3. **오너 결정 #9 대기** — 어느 모델이든 쓰는 공통 규칙만 여기에.
 *  A(현행) 원 결제 상태를 refunded 로 뒤집기: 원 결제월 매출이 소급해 줄고 부분 환불·환불일이 없다.
 *  B(권장) 환불일 기준 음수 결제 행: 원 결제는 그대로, 환불은 그 달 매출에서 차감, 부분 환불·사유·처리자가 행에 남는다(모든 집계가 Σ amount 라 그대로 맞음).
 * 결정 뒤 UI(매출 > 결제 수정 > 환불)만 이 모듈에 연결한다 — 설계서 docs/REFUND-MODEL-DESIGN-2026-11-24.md.
 */
export interface RefundablePayment { id: string; paymentDate: string; type: 'program' | 'product' | 'single_treatment' | 'other'; typeLabel: string; amount: number; status: 'completed' | 'refunded' | 'pending'; customerId?: string; customerName?: string; referenceId?: string; paymentMethod: string; memo?: string }
export interface RefundRequest { amount: number; date: string; reason?: string; actor?: string; paymentMethod?: string }

export const REFUND_ROW_TAG = /^\[환불 (\d{4}-\d{2}-\d{2}) ← (\d{4}-\d{2}-\d{2}) ([^\]]+)\]/;

/** B 모델의 환불 행 memo 태그 — "[환불 처리일 ← 원결제일 원결제id]" 로 원 결제를 되짚는다(코어 Payment 에 환불 전용 필드가 없다) */
export function refundMemo(original: Pick<RefundablePayment, 'id' | 'paymentDate'>, date: string, reason?: string, actor?: string): string {
  const tail = [reason?.trim(), actor?.trim() ? `처리 ${actor.trim()}` : ''].filter(Boolean).join(' · ');
  return `[환불 ${date} ← ${original.paymentDate} ${original.id}]${tail ? ' ' + tail : ''}`;
}

/** 환불 행인가(B 모델) — 음수 완료 결제 + 태그 */
export function isRefundRow(p: Pick<RefundablePayment, 'amount' | 'status' | 'memo'>): boolean {
  return p.status === 'completed' && p.amount < 0 && REFUND_ROW_TAG.test(p.memo || '');
}

/** 환불 행이 가리키는 원 결제 id */
export function refundOriginalId(p: Pick<RefundablePayment, 'memo'>): string | null {
  const m = REFUND_ROW_TAG.exec(p.memo || '');
  return m ? m[3] : null;
}

/** 원 결제에 이미 처리된 환불 합(양수) */
export function refundedSoFar(original: Pick<RefundablePayment, 'id'>, payments: RefundablePayment[]): number {
  return payments.filter(p => isRefundRow(p) && refundOriginalId(p) === original.id).reduce((s, p) => s + -p.amount, 0);
}

/** 환불 요청 검증 — 막는 이유 또는 null. 0 < 금액 ≤ 원 결제액 − 기존 환불, 날짜는 원 결제일 이후, 원 결제는 완료 상태 */
export function validateRefund(original: RefundablePayment, payments: RefundablePayment[], req: RefundRequest): string | null {
  if (original.status !== 'completed') return '완료된 결제만 환불할 수 있습니다.';
  if (original.amount <= 0) return '0원 결제·환불 행은 환불할 수 없습니다.';
  if (!Number.isInteger(req.amount) || req.amount <= 0) return '환불 금액은 1원 이상 정수여야 합니다.';
  const left = original.amount - refundedSoFar(original, payments);
  if (req.amount > left) return `환불 가능한 금액은 ${left.toLocaleString('ko-KR')}원까지입니다(원 결제 ${original.amount.toLocaleString('ko-KR')}원 중 이미 ${(original.amount - left).toLocaleString('ko-KR')}원 환불).`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date)) return '환불일을 선택해주세요.';
  if (req.date < original.paymentDate) return '환불일은 원 결제일보다 앞설 수 없습니다.';
  return null;
}

/** B 모델 환불 행 — 원 결제와 같은 type/고객/참조, 금액은 음수, 결제일은 환불일(그 달 매출에서 차감) */
export function buildRefundRow(original: RefundablePayment, req: RefundRequest): Omit<RefundablePayment, 'id'> & { discountAmount: number } {
  return {
    paymentDate: req.date,
    type: original.type,
    typeLabel: `${original.typeLabel} 환불`,
    amount: -Math.abs(req.amount),
    status: 'completed',
    customerId: original.customerId,
    customerName: original.customerName,
    referenceId: original.referenceId,
    paymentMethod: req.paymentMethod || original.paymentMethod,
    discountAmount: 0,
    memo: refundMemo(original, req.date, req.reason, req.actor),
  };
}

/** 회차권 환불 제안액 — 잔여 회차 × 회당 가격 × (1 − 위약금율). 기간제·총 회차 0 은 null(사람이 정한다) */
export function suggestedProgramRefund(p: { pricePaid: number; totalSessions: number | null; usedSessions: number }, penaltyPct = 0): number | null {
  if (!p.totalSessions || p.totalSessions <= 0 || p.pricePaid <= 0) return null;
  const remaining = Math.max(0, p.totalSessions - Math.max(0, p.usedSessions || 0));
  const raw = (p.pricePaid / p.totalSessions) * remaining * (1 - Math.min(100, Math.max(0, penaltyPct)) / 100);
  return Math.max(0, Math.round(raw));
}

/** 그 달 순매출(B 모델) — 완료 결제 Σ amount(환불 행은 음수라 그대로 차감). 매출 화면의 "총 매출" 정의와 같다 */
export function netRevenue(payments: Pick<RefundablePayment, 'paymentDate' | 'status' | 'amount'>[], month: string): number {
  return payments.filter(p => p.status === 'completed' && p.paymentDate.startsWith(month)).reduce((s, p) => s + p.amount, 0);
}
