/**
 * customerValueRule — 고객 가치 지표(순수 모듈). 정의: docs/ANALYTICS-DEFINITIONS.md "실현 매출·현금 유입·객단가·연간 기대 매출".
 * 마스터 프롬프트 13절: 회원권 **판매 시점(현금 유입)** 과 **사용 시점(실현 매출)** 을 구분해 중복 집계를 막는다.
 *  - 현금 유입 = 완료 결제 합(회차권 판매액 포함) — 기존 "누적 결제액"
 *  - 실현 매출 = 회차권이 아닌 완료 결제(단건 시술·제품·기타) + 회차권은 사용 회차 비율만큼(판매가 × 사용/총), 기간제는 판매가 전액(판매 시 실현으로 본다)
 *  - 객단가 = 실현 매출 ÷ 방문 횟수(방문 0 이면 없음)
 *  - 연간 기대 매출(예측) = 객단가 × (365 ÷ 방문 주기) — 지금 리듬이 1년 이어질 때의 기대값, 확정 아님
 */
export interface ValuePaymentLike { type: 'program' | 'product' | 'single_treatment' | 'other'; status: 'completed' | 'refunded' | 'pending'; amount: number }
export interface ValueProgramLike { pricePaid: number; totalSessions: number | null; usedSessions: number }
export interface CustomerValue {
  cashCollected: number;
  realizedRevenue: number;
  avgTicket: number | null;
  annualForecast: number | null; // 예측
}

/** 회차권 1개의 실현 매출 — 회차제는 사용 비율, 기간제는 전액 */
export function realizedProgramRevenue(p: ValueProgramLike): number {
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
