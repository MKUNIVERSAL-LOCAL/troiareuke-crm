// memoPresets — 자주 쓰는 메모 문구 저장 (비코어, 251)
// 설정 행(preferences)에 둔다 — 문구는 매장 공용이고(직원이 각자 만들 필요가 없다) 쓰기는 문구를
// 추가·삭제할 때뿐이다(저장 행 쓰기 빈도 문제는 246 리뷰 H-1 참고 — 여기는 하루 몇 번 수준).
// 규칙은 memoPresetRule.ts(순수).
import { getPreference, setPreference } from './shopPreferences';
import { sanitizePresets, addPreset, removePreset } from './memoPresetRule';

export function memoPresets(): string[] {
  return sanitizePresets(getPreference('memoPresets'));
}

/** 문구 추가 — 거절 사유가 있으면 그대로 돌려준다(가짜 성공 금지) */
export function saveMemoPreset(value: string): { list: string[]; error?: string } {
  const result = addPreset(memoPresets(), value);
  if (result.error) return result;
  try {
    // 되읽기 확인은 `setPreference` 한 곳에서 한다 (286, 282~284 리뷰 LOW — 전에는 판정이 네 벌이었다).
    // 'unknown'(설정 행을 못 읽음)은 실패로 단정하지 않는다 — 없는 실패를 알리면 그것도 거짓이다.
    const landed = setPreference('memoPresets', result.list);
    if (landed === 'lost') return { list: memoPresets(), error: '문구를 저장하지 못했습니다. 저장 공간을 확인해주세요.' };
    return { list: memoPresets() };
  } catch {
    return { list: memoPresets(), error: '문구를 저장하지 못했습니다.' };
  }
}

export function deleteMemoPreset(value: string): { list: string[]; error?: string } {
  const next = removePreset(memoPresets(), value);
  try {
    const landed = setPreference('memoPresets', next); // (286) 판정은 한 곳에서
    if (landed === 'lost') return { list: memoPresets(), error: '문구를 지우지 못했습니다.' };
    return { list: memoPresets() };
  } catch {
    return { list: memoPresets(), error: '문구를 지우지 못했습니다.' };
  }
}
