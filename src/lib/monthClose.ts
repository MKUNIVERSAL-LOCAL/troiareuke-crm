// monthClose — 월 마감 잠금·월 목표 (비코어, 147, GAP P-7·P-6)
// 세무 신고 뒤 숫자가 바뀌면 안 되는 달을 잠근다. 지점 설정 행(preferences.closedMonths)에 두어 NAS 동기·모든 기기에 적용.
// 코어 저장소는 못 막으므로(코어 잠금) 사용자가 거치는 저장 경로(결제·지출·제품 판매/취소·예약 완료 결제·회차권 등록/취소·입고 지출)에서 막는다.
import { getPreference, setPreference, persistedPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';

/** 디스크에 남아 있는 마감 월 목록 — 읽을 수 없으면 null (300) */
function persistedClosedMonths(): string[] | null {
  const v = persistedPreference('closedMonths');
  if (v === null) return null;       // 행 자체를 못 읽었다
  if (v === undefined) return [];    // 그 칸이 아직 없다 = 마감한 적이 없다
  return Array.isArray(v) ? v : [];
}

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

/**
 * 지금 메모리의 마감 목록이 **이 PC 에 남아 있는지** (294, 288~292 리뷰 M-6).
 * 토스트는 몇 초 뒤 사라지고 잠금 배지는 남으므로, 화면이 **렌더마다** 이 값을 물어 사실을 함께 적는다.
 */
/**
 * **그 달**의 마감 상태가 이 PC 에 남아 있는지 (300, 297~299 리뷰 M-2).
 * 297 은 목록 전체를 비교했다 — 그래서 **다른 달**의 마감 해제가 안 남은 PC 에서 11월 카드에도
 * "저장 안 됨" 이 떴다(지점은 "이번 달 마감이 안 됐다" 로 읽는다). 카드는 달마다 열리므로 판정도 달마다 한다.
 */
export function monthCloseSavedFor(month: string): PrefLanded {
  const wanted = isMonthClosed(month);
  const persisted = persistedClosedMonths();
  if (persisted === null) return wanted ? 'unknown' : 'landed'; // 행을 못 읽어도 주장이 없으면 잃은 것이 없다
  return persisted.includes(month) === wanted ? 'landed' : 'lost';
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
