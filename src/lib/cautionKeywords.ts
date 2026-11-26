// cautionKeywords — 매장이 추가한 주의 키워드 저장 (비코어, 240)
// 설정 행(preferences)에 두어 NAS 로 동기화된다 — 같은 지점 모든 PC 가 같은 키워드를 쓴다.
// 규칙·정리는 customerAlertRule.sanitizeCautionKeywords(순수).
import { getPreference, setPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';
import { sanitizeCautionKeywords } from './customerAlertRule';

export function getCautionKeywords(): string[] {
  return sanitizeCautionKeywords(getPreference('cautionKeywords'));
}

/** @returns 정리된 목록과 **그 목록이 이 PC 에 남았는지** (296) */
export function saveCautionKeywords(list: string[]): { list: string[]; landed: PrefLanded } {
  const clean = sanitizeCautionKeywords(list);
  return { list: clean, landed: setPreference('cautionKeywords', clean) };
}
