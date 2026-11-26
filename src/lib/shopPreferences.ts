// 지점 환경설정(preferences) 접근 유틸 — shop_settings.preferences에 저장되어 NAS로 동기화된다.
//
// 2026-09-07: 결제수단·재방문 주기·기능 토글·API 가이드 체크가 PC별 localStorage에만 있어
// PC를 바꾸면 사라졌다. 이 유틸은 (1) 서버 동기 설정을 우선 읽고 (2) 예전 localStorage 값이 있으면
// 한 번 이관(migrate)한 뒤 (3) 저장은 항상 SettingsStore.save로 해 서버에 반영한다.
// localStorage는 오프라인·즉시 반응용 캐시로만 남긴다.
import { SettingsStore, getShopId } from './store';
import { prefLanded, type PrefLanded } from './prefLandedRule';
import type { ShopPreferences } from '../types';

type PrefKey = keyof ShopPreferences;

function readAll(): ShopPreferences {
  const prefs = SettingsStore.get().preferences;
  return prefs && typeof prefs === 'object' ? prefs : {};
}

export function getPreference<K extends PrefKey>(key: K): ShopPreferences[K] | undefined {
  return readAll()[key];
}

/**
 * 설정 한 칸을 저장하고 **정말 남았는지** 돌려준다 (284).
 * `safeSetItem` 은 저장 공간 초과를 삼키므로 반환값·예외로는 실패를 알 수 없다 —
 * 저장 직후 localStorage 원본을 되읽어 비교한다(254 리뷰 M-1 이 영수증 정보에서 쓴 방법을 한 곳으로).
 * 쓰는 쪽이 이 값을 무시해도 동작은 전과 같다(void 로 쓰던 호출 39곳 그대로).
 */
export function setPreference<K extends PrefKey>(key: K, value: ShopPreferences[K]): PrefLanded {
  const next: ShopPreferences = { ...readAll(), [key]: value };
  SettingsStore.save({ preferences: next });
  // `?? null` 로 접지 않는다 — undefined(키가 없다 = 확인된 실패)와 null(행을 못 읽었다 = 확인 불가)은 다른 답이다 (285, 리뷰 M-1)
  return prefLanded(readPersistedPreference(key), value);
}

/**
 * 예전 localStorage 값이 있고 서버 설정에는 아직 없으면 한 번 이관한다.
 * parse가 null을 돌려주면 이관하지 않는다. 이관 후 legacy 키는 지운다(이중 진실 방지).
 * **290(285~287 리뷰 H-2)**: 새 자리에 남지 않았으면 **원본을 지우지 않는다**. 저장 공간이 모자란 PC 에서
 * 판정을 버리고 지우면 로컬 모드에는 사본이 없어 그 설정이 **영구 소실**된다(결제수단·재방문 주기·가이드 상태).
 */
export function migrateLegacyPreference<K extends PrefKey>(
  key: K,
  legacyStorageKey: string,
  parse: (raw: string) => ShopPreferences[K] | null,
): ShopPreferences[K] | undefined {
  const current = readAll()[key];
  if (current !== undefined) return current;
  try {
    const raw = localStorage.getItem(legacyStorageKey);
    if (raw === null) return undefined;
    const parsed = parse(raw);
    if (parsed === null || parsed === undefined) return undefined;
    if (setPreference(key, parsed) !== 'lost') localStorage.removeItem(legacyStorageKey);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * 설정 행이 **디스크에 실제로** 저장됐는지 확인한다 (254 리뷰 M-1).
 * SettingsStore.get() 은 메모리 캐시를 먼저 돌려주고 safeSetItem 은 용량 초과를 삼키므로,
 * 캐시를 되읽는 확인은 저장 실패를 잡지 못한다 — localStorage 원본을 직접 본다.
 * 읽을 수 없으면(프라이빗 모드 등) null 을 돌려주고 호출 쪽이 "확인 불가" 로 다룬다.
 * 286 부터 **이 파일 안에서만** 쓴다 — 되읽기 판정이 네 벌로 갈라져 있던 것을 `setPreference` 한 곳으로 모았다(미사용 export 금지).
 */
function readPersistedPreference<K extends PrefKey>(key: K): ShopPreferences[K] | null | undefined {
  try {
    const raw = localStorage.getItem(`crm_${getShopId()}_settings`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const prefs = parsed?.preferences;
    if (!prefs || typeof prefs !== 'object') return undefined;
    return prefs[key];
  } catch {
    return null;
  }
}
