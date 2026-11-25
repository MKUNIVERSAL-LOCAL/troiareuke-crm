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
    setPreference('memoPresets', result.list);
    // 되읽어 확인 — safeSetItem 은 용량 초과를 삼킨다 (250 리뷰 M-3 과 같은 이유)
    const saved = memoPresets();
    if (!saved.includes(result.list[result.list.length - 1])) return { list: saved, error: '문구를 저장하지 못했습니다. 저장 공간을 확인해주세요.' };
    return { list: saved };
  } catch {
    return { list: memoPresets(), error: '문구를 저장하지 못했습니다.' };
  }
}

export function deleteMemoPreset(value: string): { list: string[]; error?: string } {
  const next = removePreset(memoPresets(), value);
  try {
    setPreference('memoPresets', next);
    const saved = memoPresets();
    if (saved.length !== next.length) return { list: saved, error: '문구를 지우지 못했습니다.' };
    return { list: saved };
  } catch {
    return { list: memoPresets(), error: '문구를 지우지 못했습니다.' };
  }
}
