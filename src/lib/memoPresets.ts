// memoPresets — 자주 쓰는 메모 문구 저장 (비코어, 251)
// 설정 행(preferences)에 둔다 — 문구는 매장 공용이고(직원이 각자 만들 필요가 없다) 쓰기는 문구를
// 추가·삭제할 때뿐이다(저장 행 쓰기 빈도 문제는 246 리뷰 H-1 참고 — 여기는 하루 몇 번 수준).
// 규칙은 memoPresetRule.ts(순수).
import { getPreference, setPreference } from './shopPreferences';
import { sanitizePresets, addPreset, removePreset } from './memoPresetRule';
import { describePrefLoss, describePrefRemovalLoss } from './prefLandedRule';
import { prefSaveMode } from './prefSaveMode';

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
    // 296(288~292 리뷰 LOW-7): 다른 설정과 **같은 문구**를 쓴다 — 릴리스 노트가 일곱 흐름을 묶어
    // "매장 종류에 따라 다르게 적는다" 고 했는데 여기만 자체 문구라 그 말이 반만 사실이었다
    const lost = describePrefLoss(landed, '자주 쓰는 문구', prefSaveMode());
    if (lost) return { list: memoPresets(), error: lost };
    return { list: memoPresets() };
  } catch {
    return { list: memoPresets(), error: '문구를 저장하지 못했습니다.' };
  }
}

export function deleteMemoPreset(value: string): { list: string[]; error?: string } {
  const next = removePreset(memoPresets(), value);
  try {
    const landed = setPreference('memoPresets', next); // (286) 판정은 한 곳에서
    const lost = describePrefRemovalLoss(landed, '문구', prefSaveMode()); // 296·297(리뷰 M-3)
    if (lost) return { list: memoPresets(), error: lost };
    return { list: memoPresets() };
  } catch {
    return { list: memoPresets(), error: '문구를 지우지 못했습니다.' };
  }
}
