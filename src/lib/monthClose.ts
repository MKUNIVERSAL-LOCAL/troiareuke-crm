// monthClose — 월 마감 잠금·월 목표 (비코어, 147, GAP P-7·P-6)
// 세무 신고 뒤 숫자가 바뀌면 안 되는 달을 잠근다. 지점 설정 행(preferences.closedMonths)에 두어 NAS 동기·모든 기기에 적용.
// 코어 저장소는 못 막으므로(코어 잠금) 사용자가 거치는 저장 경로(결제·지출·제품 판매/취소·예약 완료 결제·회차권 등록/취소·입고 지출)에서 막는다.
import { getPreference, setPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';

function closedMonths(): string[] {
  const v = getPreference('closedMonths');
  return Array.isArray(v) ? v : [];
}

export function isMonthClosed(month: string): boolean {
  return closedMonths().includes(month);
}

/** @returns 마감이 **정말 저장됐는지** — 화면이 "마감했습니다" 를 말하기 전에 확인한다 (284) */
export function closeMonth(month: string): PrefLanded {
  // 아무 일도 하지 않았다 — "마감했습니다" 도 거짓이고, "저장 공간이 모자랍니다" 도 거짓이다 (290, 리뷰 LOW-7)
  if (!/^\d{4}-\d{2}$/.test(month)) return 'invalid';
  if (isMonthClosed(month)) return 'landed';             // 이미 그 상태다(뜻대로 됐다)
  return setPreference('closedMonths', [...closedMonths(), month].sort());
}

export function reopenMonth(month: string): PrefLanded {
  if (!/^\d{4}-\d{2}$/.test(month)) return 'invalid';   // 마감과 같은 가드 — 290 전에는 쓰레기 월을 넘기면 "마감을 풀었습니다" 라고 말했다
  if (!isMonthClosed(month)) return 'landed';            // 이미 풀려 있다(뜻대로 됐다)
  return setPreference('closedMonths', closedMonths().filter(m => m !== month));
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

export function saveMonthlyTarget(month: string, target: number | null): PrefLanded {
  const v = getPreference('monthlyTargets');
  const next: Record<string, number> = { ...(v && typeof v === 'object' ? v : {}) };
  if (target && target > 0) next[month] = target; else delete next[month];
  return setPreference('monthlyTargets', next);
}
