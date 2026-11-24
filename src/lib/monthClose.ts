// monthClose — 월 마감 잠금·월 목표 (비코어, 147, GAP P-7·P-6)
// 세무 신고 뒤 숫자가 바뀌면 안 되는 달을 잠근다. 지점 설정 행(preferences.closedMonths)에 두어 NAS 동기·모든 기기에 적용.
// 코어 저장소는 못 막으므로(코어 잠금) 사용자가 거치는 저장 경로(결제·지출·제품 판매/취소·예약 완료 결제·회차권 등록/취소·입고 지출)에서 막는다.
import { getPreference, setPreference } from './shopPreferences';

export function closedMonths(): string[] {
  const v = getPreference('closedMonths');
  return Array.isArray(v) ? v : [];
}

export function isMonthClosed(month: string): boolean {
  return closedMonths().includes(month);
}

export function closeMonth(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month) || isMonthClosed(month)) return;
  setPreference('closedMonths', [...closedMonths(), month].sort());
}

export function reopenMonth(month: string): void {
  setPreference('closedMonths', closedMonths().filter(m => m !== month));
}

/** 날짜(YYYY-MM-DD)가 마감된 달이면 막는 이유를, 아니면 null */
export function monthCloseBlock(dateISO: string | undefined | null): string | null {
  const month = (dateISO || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month) || !isMonthClosed(month)) return null;
  const [y, m] = month.split('-');
  return `${y}년 ${Number(m)}월은 마감돼 결제·지출·판매를 바꿀 수 없습니다. 매출·손익 화면에서 마감을 푼 뒤 수정해주세요.`;
}

export function monthlyTarget(month: string): number | null {
  const v = getPreference('monthlyTargets');
  const t = v && typeof v === 'object' ? v[month] : undefined;
  return typeof t === 'number' && t > 0 ? t : null;
}

export function saveMonthlyTarget(month: string, target: number | null): void {
  const v = getPreference('monthlyTargets');
  const next: Record<string, number> = { ...(v && typeof v === 'object' ? v : {}) };
  if (target && target > 0) next[month] = target; else delete next[month];
  setPreference('monthlyTargets', next);
}
