// followUp — 고객 연락 기록·미루기 저장 (비코어, 249)
// 설정 행(preferences)에 둔다 — 한 직원이 전화하면 **다른 PC 도 그 사실을 알아야** 두 번 전화하지 않는다.
// 쓰기는 직원이 [연락 기록] 을 누를 때뿐이고 payload 가 작다(500건 상한) — 결제마다 쓰던 243 과 다르다(246 리뷰 H-1).
// 규칙은 followUpRule.ts(순수).
import { getPreference, setPreference } from './shopPreferences';
import { todayISO } from './format';
import {
  sanitizeFollowUps, pruneFollowUps, snoozedIdSet, addDays, defaultSnoozeDays,
  type FollowUpRecord,
} from './followUpRule';

/** 기록 보관 기간(일) */
const KEEP_DAYS = 365;

function keepFrom(): string {
  return addDays(todayISO(), -KEEP_DAYS);
}

export function followUps(): Record<string, FollowUpRecord> {
  return sanitizeFollowUps(getPreference('followUps'));
}

export function followUpOf(customerId: string): FollowUpRecord | null {
  return followUps()[customerId] ?? null;
}

/** 지금 미뤄 둔 고객 id 들 — 할 일 목록·고객 필터가 같은 집합을 쓴다 */
export function snoozedCustomerIds(today = todayISO()): Set<string> {
  return snoozedIdSet(followUps(), today);
}

/**
 * 연락 결과를 기록한다. snoozeDays 를 주지 않으면 결과별 기본값(예약 잡음 30일·부재 3일 …)을 쓴다.
 * 0 이면 미루지 않는다(기록만 남는다). 저장 실패는 false 로 알린다 — 화면이 가짜 성공을 말하지 않게.
 */
export function saveFollowUp(customerId: string, input: { result: string; note?: string; snoozeDays?: number; actor?: string }): boolean {
  try {
    const today = todayISO();
    const days = input.snoozeDays ?? defaultSnoozeDays(input.result);
    const rec: FollowUpRecord = {
      at: today,
      result: input.result,
      ...(days > 0 ? { until: addDays(today, days) } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
    };
    const next = pruneFollowUps({ ...followUps(), [customerId]: rec }, keepFrom(), undefined, today);
    setPreference('followUps', next);
    // 저장이 정말 됐는지 되읽어 확인한다 — safeSetItem 은 용량 초과를 삼키므로 try/catch 만으로는
    // 아무것도 저장되지 않았는데 "기록했습니다" 가 떴다 (250 리뷰 M-3)
    const saved = followUps()[customerId];
    return !!saved && saved.result === rec.result && saved.until === rec.until;
  } catch {
    return false;
  }
}

/** 미루기 해제 — 기록은 남기고 목록에 다시 나오게 한다 */
export function clearSnooze(customerId: string): boolean {
  try {
    const map = followUps();
    const rec = map[customerId];
    if (!rec) return true;
    const { until: _until, ...rest } = rec;
    void _until;
    setPreference('followUps', pruneFollowUps({ ...map, [customerId]: rest }, keepFrom(), undefined, todayISO()));
    return !followUps()[customerId]?.until; // 되읽어 확인 (250 리뷰 M-3)
  
  } catch {
    return false;
  }
}
