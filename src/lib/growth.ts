/** 전기 대비 성장률(%) — 전기가 0 이면 계산 불가(null → "전월 매출 없음"), 같으면 0. 대시보드·매출 화면이 같은 규칙 (10차 숫자 점검 #M9, 2026-11-20) */
export function growthPct(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}
