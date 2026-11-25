// cautionKeywords — 매장이 추가한 주의 키워드 저장 (비코어, 240)
// 설정 행(preferences)에 두어 NAS 로 동기화된다 — 같은 지점 모든 PC 가 같은 키워드를 쓴다.
// 규칙·정리는 customerAlertRule.sanitizeCautionKeywords(순수).
import { getPreference, setPreference } from './shopPreferences';
import { sanitizeCautionKeywords } from './customerAlertRule';

export function getCautionKeywords(): string[] {
  return sanitizeCautionKeywords(getPreference('cautionKeywords'));
}

export function saveCautionKeywords(list: string[]): string[] {
  const clean = sanitizeCautionKeywords(list);
  setPreference('cautionKeywords', clean);
  return clean;
}
