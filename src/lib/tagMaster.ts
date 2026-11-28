// tagMaster — 자주 쓰는 태그 목록 저장 (비코어, 237)
// 설정 행(preferences)에 두어 NAS 로 동기화된다 — 같은 지점 모든 PC 가 같은 목록을 본다.
// 규칙은 tagMasterRule.ts(순수).
import { getPreference, setPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';
import { sanitizeMaster } from './tagMasterRule';

export function getTagMaster(): string[] {
  return sanitizeMaster(getPreference('tagMaster'));
}

/**
 * @returns 정리된 목록과 **그 목록이 이 PC 에 남았는지** (296, 288~292 리뷰 M-7 계열).
 * 전에는 판정을 버려, 저장 공간이 모자란 PC 에서 태그를 추가하면 화면에만 생기고 다시 열면 사라졌다.
 */
export function saveTagMaster(list: string[]): { list: string[]; landed: PrefLanded } {
  const clean = sanitizeMaster(list);
  return { list: clean, landed: setPreference('tagMaster', clean) };
}
