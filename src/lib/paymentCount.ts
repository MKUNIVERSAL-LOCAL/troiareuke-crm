import type { Payment } from '../types';

/**
 * 결제 "건수" — 분할(복합) 결제는 결제 수단마다 한 행이지만 같은 referenceId(예약·회차권)를 가리키므로 1건으로 센다.
 * 매출 화면·대시보드·마감 요약이 같은 수를 보이게 한 곳에서 정의한다 (금액 감사 2026-11-20).
 */
export function countPaymentUnits(payments: Pick<Payment, 'id' | 'referenceId'>[]): number {
  return new Set(payments.map(p => p.referenceId ?? p.id)).size;
}
