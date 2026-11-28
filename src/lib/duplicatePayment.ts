// duplicatePayment — 중복 결제 의심 확인(저장소 조회 + 확인창) (비코어, 264, GAP P-4)
// 규칙은 순수 duplicatePaymentRule 에만 있고, 여기서는 이 PC 결제를 모아 넘기고 확인창을 띄운다.
// 두 화면(매출 결제 등록·예약 완료 결제)이 같은 규칙을 쓰도록 한 곳에 둔다.
import { PaymentStore } from './store';
import { askConfirm } from './confirmDialog';
import { formatPrice } from './format';
import { findDuplicateSuspects, describeDuplicateWarning, type DupCandidate } from './duplicatePaymentRule';

/**
 * 중복으로 보이면 확인창을 띄운다.
 * @returns 저장해도 되는가 — 의심이 없으면 true(창을 띄우지 않는다), 직원이 [그대로 등록] 을 고르면 true
 */
export async function confirmIfDuplicatePayment(
  // 281(리뷰 M-2): 지금 등록할 결제의 유형·수단·할인도 받아 창에 한 줄 적는다(비교 상대가 화면에 있어야 한다)
  candidate: DupCandidate & { customerName?: string; typeLabel?: string; paymentMethod?: string; discountAmount?: number },
): Promise<boolean> {
  const suspects = findDuplicateSuspects(
    candidate,
    PaymentStore.getAll().map(p => ({
      id: p.id, customerId: p.customerId, amount: p.amount, paymentDate: p.paymentDate,
      status: p.status, createdAt: p.createdAt, paymentMethod: p.paymentMethod, typeLabel: p.typeLabel,
      discountAmount: p.discountAmount, // (279) 같은 실결제액끼리 구별할 수 있게 문구에 적는다
    })),
    new Date().toISOString(),
  );
  if (suspects.length === 0) return true;
  return askConfirm({
    title: '같은 금액 결제가 이미 있습니다',
    message: describeDuplicateWarning(suspects, candidate, formatPrice),
    confirmLabel: '그대로 등록',
    cancelLabel: '취소하고 확인',
    danger: true, // 매출·회차권이 부풀 수 있는 쪽이라 기본 선택을 취소로 (221 과 같은 태도)
  });
}
