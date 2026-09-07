// 지점 환경설정(preferences) 접근 유틸 — shop_settings.preferences에 저장되어 NAS로 동기화된다.
//
// 2026-09-07: 결제수단·재방문 주기·기능 토글·API 가이드 체크가 PC별 localStorage에만 있어
// PC를 바꾸면 사라졌다. 이 유틸은 (1) 서버 동기 설정을 우선 읽고 (2) 예전 localStorage 값이 있으면
// 한 번 이관(migrate)한 뒤 (3) 저장은 항상 SettingsStore.save로 해 서버에 반영한다.
// localStorage는 오프라인·즉시 반응용 캐시로만 남긴다.
import { SettingsStore } from './store';
import type { ShopPreferences } from '../types';

type PrefKey = keyof ShopPreferences;

function readAll(): ShopPreferences {
  const prefs = SettingsStore.get().preferences;
  return prefs && typeof prefs === 'object' ? prefs : {};
}

export function getPreference<K extends PrefKey>(key: K): ShopPreferences[K] | undefined {
  return readAll()[key];
}

export function setPreference<K extends PrefKey>(key: K, value: ShopPreferences[K]): void {
  const next: ShopPreferences = { ...readAll(), [key]: value };
  SettingsStore.save({ preferences: next });
}

/**
 * 예전 localStorage 값이 있고 서버 설정에는 아직 없으면 한 번 이관한다.
 * parse가 null을 돌려주면 이관하지 않는다. 이관 후 legacy 키는 지운다(이중 진실 방지).
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
    setPreference(key, parsed);
    localStorage.removeItem(legacyStorageKey);
    return parsed;
  } catch {
    return undefined;
  }
}
