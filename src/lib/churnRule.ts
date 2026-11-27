/**
 * churnRule — 이탈 위험 (순수 모듈). 정의: docs/ANALYTICS-DEFINITIONS.md "이탈 위험".
 * 일괄 "60일 미방문" 대신 **그 고객의 방문 주기**(visitCycleRule) 대비 얼마나 지났는지로 본다 — 2주 주기 고객이 6주 안 오면 위험, 3개월 주기 고객은 아직 정상.
 *  - 비율 = 마지막 방문 뒤 지난 일수 / 방문 주기. 2.0 이상 high, 1.3 이상 medium, 그 아래 low. 미래 예약이 잡혀 있으면 low.
 *  - 방문 기록이 없으면 판단하지 않는다(null).
 *  - 90일 위험 매출(예측): 최근 365일 결제 합을 하루 평균으로 환산 × 90 — "이 고객이 떠나면 석 달간 잃는 매출" 추정치. 확정값이 아니다.
 */
export type ChurnLevel = 'high' | 'medium' | 'low';
export const CHURN_HIGH_RATIO = 2.0;
const CHURN_MEDIUM_RATIO = 1.3;

export interface ChurnInput { daysSinceLastVisit: number | null; cycleDays: number; hasUpcomingReservation: boolean }
export interface ChurnRisk { level: ChurnLevel; ratio: number }

export function churnRisk(i: ChurnInput): ChurnRisk | null {
  if (i.daysSinceLastVisit === null || i.daysSinceLastVisit < 0 || !(i.cycleDays > 0)) return null;
  const ratio = Math.round((i.daysSinceLastVisit / i.cycleDays) * 100) / 100;
  if (i.hasUpcomingReservation) return { level: 'low', ratio };
  return { level: ratio >= CHURN_HIGH_RATIO ? 'high' : ratio >= CHURN_MEDIUM_RATIO ? 'medium' : 'low', ratio };
}

/** 최근 365일 결제 합 → 90일 위험 매출(예측, 원 단위 반올림) */
export function atRiskRevenue90(spentLast365: number): number {
  return Math.round(Math.max(0, spentLast365) / 365 * 90);
}

export const CHURN_LABEL: Record<ChurnLevel, string> = { high: '높음', medium: '주의', low: '낮음' };
