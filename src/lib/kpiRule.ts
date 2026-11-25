/**
 * kpiRule — 이달 운영 지표(순수 모듈). 정의: docs/ANALYTICS-DEFINITIONS.md "이달 방문 고객·재방문율·재예약률·이달 객단가".
 *  - 이달 방문 고객 = 이달에 방문일(완료 예약 ∪ 시술 기록)이 하나라도 있는 고객 수
 *  - 재방문율 = 그중 이달 이전에도 방문 기록이 있는 고객 비율
 *  - 재예약률 = 이달 방문 고객 중 다음(미래) 예약이 잡힌 고객 비율 (Zenoti·Vagaro 의 "재예약률" 공개 정의를 월 단위로)
 *  - 이달 객단가(현금 기준) = 이달 완료 결제 합 ÷ 이달 방문 고객 수 — 회차권 판매액이 포함된 현금 기준이라 고객 상세의 실현 매출 객단가와 다르다(라벨에 명시)
 * 분모가 0 이면 null(화면 "-"). 비율은 % 정수.
 */
export interface KpiInput {
  month: string;                              // YYYY-MM
  visitDays: Map<string, string[]>;           // 고객 id → 방문일(오름차순)
  payments: { customerId?: string; status: string; amount: number; paymentDate: string }[];
  upcomingByCustomer: Set<string>;            // 미래 예약(취소·노쇼 제외)이 있는 고객
}
export interface MonthlyKpis {
  visitors: number; returning: number; rebooked: number;
  revisitRate: number | null; rebookRate: number | null;
  avgTicket: number | null; monthRevenue: number;
}

export function monthlyKpis(i: KpiInput): MonthlyKpis {
  let visitors = 0, returning = 0, rebooked = 0;
  for (const [id, days] of i.visitDays) {
    const inMonth = days.some(d => d.startsWith(i.month));
    if (!inMonth) continue;
    visitors++;
    if (days.some(d => d < i.month)) returning++;  // 'YYYY-MM' 보다 사전순으로 앞 = 이전 달
    if (i.upcomingByCustomer.has(id)) rebooked++;
  }
  const monthRevenue = i.payments.filter(p => p.status === 'completed' && p.paymentDate.startsWith(i.month)).reduce((s, p) => s + (p.amount || 0), 0);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  return { visitors, returning, rebooked, revisitRate: pct(returning, visitors), rebookRate: pct(rebooked, visitors), avgTicket: visitors > 0 ? Math.round(monthRevenue / visitors) : null, monthRevenue };
}

/** 이달 방문했지만 다음 예약이 없는 고객 id — 재예약률의 분모 − 분자. 재예약 권유 목록(고객 목록 ?norebook=1) (184, GAP D-1) */
export function noRebookIds(i: Pick<KpiInput, 'month' | 'visitDays' | 'upcomingByCustomer'>): string[] {
  const out: string[] = [];
  for (const [id, days] of i.visitDays) if (days.some(d => d.startsWith(i.month)) && !i.upcomingByCustomer.has(id)) out.push(id);
  return out;
}
