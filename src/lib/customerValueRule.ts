/**
 * customerValueRule — 고객 가치 지표(순수 모듈). 정의: docs/ANALYTICS-DEFINITIONS.md "실현 매출·현금 유입·객단가·연간 기대 매출".
 * 마스터 프롬프트 13절: 회원권 **판매 시점(현금 유입)** 과 **사용 시점(실현 매출)** 을 구분해 중복 집계를 막는다.
 *  - 현금 유입 = 완료 결제 합(회차권 판매액 포함) — 기존 "누적 결제액"
 *  - 실현 매출 = 회차권이 아닌 완료 결제(단건 시술·제품·기타) + 회차권은 사용 회차 비율만큼(판매가 × 사용/총), 기간제는 판매가 전액(판매 시 실현으로 본다)
 *  - 객단가 = 실현 매출 ÷ 방문 횟수(방문 0 이면 없음)
 *  - 연간 기대 매출(예측) = 객단가 × (365 ÷ 방문 주기) — 지금 리듬이 1년 이어질 때의 기대값, 확정 아님. **개인 주기(방문 3회 이상)가 있을 때만**(매장 기본 주기로는 예측하지 않는다, 139 #M4)
 *  - 환불된 회차권(연결 결제가 전부 환불)은 실현 0, 수동 완료로 소멸한 잔여 회차는 실현되지 않은 채 남는다(선수금 잔액), 초과 차감은 판매가 상한 (139 #H1·#L4)
 */
export interface ValuePaymentLike { type: 'program' | 'product' | 'single_treatment' | 'other'; status: 'completed' | 'refunded' | 'pending'; amount: number }
export interface ValueProgramLike { pricePaid: number; totalSessions: number | null; usedSessions: number; refunded?: boolean }
export interface CustomerValue {
  cashCollected: number;
  realizedRevenue: number;
  avgTicket: number | null;
  annualForecast: number | null; // 예측
}

/** 회차권 1개의 실현 매출 — 회차제는 사용 비율, 기간제는 전액 */
export function realizedProgramRevenue(p: ValueProgramLike): number {
  if (p.refunded) return 0; // 결제가 환불된 회차권 — 현금이 돌아갔으므로 실현 매출도 없다 (139 #H1)
  if (p.totalSessions == null || p.totalSessions <= 0) return Math.max(0, p.pricePaid || 0);
  const used = Math.min(Math.max(0, p.usedSessions || 0), p.totalSessions);
  return Math.round((p.pricePaid || 0) * used / p.totalSessions);
}

export function computeCustomerValue(i: { payments: ValuePaymentLike[]; programs: ValueProgramLike[]; visits: number; cycleDays: number | null }): CustomerValue {
  const completed = i.payments.filter(p => p.status === 'completed');
  const cashCollected = completed.reduce((s, p) => s + (p.amount || 0), 0);
  const nonProgram = completed.filter(p => p.type !== 'program').reduce((s, p) => s + (p.amount || 0), 0);
  const programs = i.programs.reduce((s, p) => s + realizedProgramRevenue(p), 0);
  const realizedRevenue = nonProgram + programs;
  const avgTicket = i.visits > 0 ? Math.round(realizedRevenue / i.visits) : null;
  const annualForecast = avgTicket !== null && i.cycleDays && i.cycleDays > 0 ? Math.round(avgTicket * 365 / i.cycleDays) : null;
  return { cashCollected, realizedRevenue, avgTicket, annualForecast };
}
