import type { Payment } from '../types';

/** 취소(환불)된 제품 판매 id 집합 — 판매 행에는 수정 API 가 없어(코어) 연결 결제의 환불 상태로 식별한다. 제품 화면·직원 실적·엑셀 제품판매 시트가 같은 규칙 (111 #H2, 114 리뷰) */
export function canceledSaleIds(payments: Pick<Payment, 'status' | 'referenceId' | 'type'>[]): Set<string> {
  // type 도 본다 — 환불된 회차권·예약 연결 결제의 referenceId 가 섞이지 않게 (11차 #L1)
  return new Set(payments.filter(p => p.type === 'product' && p.status === 'refunded' && p.referenceId).map(p => p.referenceId as string));
}
