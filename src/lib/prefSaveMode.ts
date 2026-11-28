// 설정 저장이 이 PC 뿐인지, 서버에도 올라가는지 (290, 285~287 리뷰 H-1)
// 코어 `SettingsStore.save` 가 같은 조건(`isSupabaseConfigured || isNasDataConfigured`)으로 서버 upsert 를
// 보내고, 다시 열 때 서버 값을 받아온다 — 그래서 이 PC 쓰기가 실패해도 "사라진다" 고 단정할 수 없다.
// 순수 모듈(*Rule.ts)이 아니다: 설정값을 읽으므로 lib-units 로는 고정할 수 없고, 문구 판정은 규칙 쪽에 있다.
import { isSupabaseConfigured } from './supabase';
import { isNasDataConfigured } from './nasData';
import type { PrefSaveMode } from './prefLandedRule';

export function prefSaveMode(): PrefSaveMode {
  return isSupabaseConfigured || isNasDataConfigured ? 'server-backed' : 'local-only';
}
