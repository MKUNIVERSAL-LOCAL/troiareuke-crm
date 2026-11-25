// tagMaster — 자주 쓰는 태그 목록 저장 (비코어, 237)
// 설정 행(preferences)에 두어 NAS 로 동기화된다 — 같은 지점 모든 PC 가 같은 목록을 본다.
// 규칙은 tagMasterRule.ts(순수).
import { getPreference, setPreference } from './shopPreferences';
import { sanitizeMaster } from './tagMasterRule';

export function getTagMaster(): string[] {
  return sanitizeMaster(getPreference('tagMaster'));
}

export function saveTagMaster(list: string[]): string[] {
  const clean = sanitizeMaster(list);
  setPreference('tagMaster', clean);
  return clean;
}
