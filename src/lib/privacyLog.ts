// ═══════════════════════════════════════════════════════════════
// privacyLog — 개인정보 처리 기록(익명화·병합) (비코어, 9차 점검 2026-11-20 #29)
// ───────────────────────────────────────────────────────────────
// 누가·언제·몇 명을 익명화/병합했는지 어디에도 남지 않았다(로그인 기록만 존재). 개인정보 파기 대장은 보관이 권장된다.
// 저장: 지점 환경설정(shopPreferences.privacyActions) — 서버(NAS)로 동기되고 PC 교체·서버 모드 로그아웃 wipe(코어)에도 남는다.
//   처음엔 이 PC localStorage 테이블로 두었다가, 서버 모드 로그아웃이 그 키를 지우는 것이 리뷰에서 드러나 옮겼다 (2026-11-20).
//   설정 테이블은 백업 파일에 들어가므로 기록도 함께 백업된다(stripSettingsSecrets 는 비밀 필드만 뺀다).
// 고객 이름은 넣지 않는다 — 나중에 그 고객을 익명화해도 기록에 이름이 남으면 삭제 요청의 취지에 어긋난다. 병합은 가린 이름(첫 글자+○○)만.
// ═══════════════════════════════════════════════════════════════

import { getPreference, setPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';
import type { ShopPreferences } from '../types';

export type PrivacyAction = NonNullable<ShopPreferences['privacyActions']>[number];
export type PrivacyActionType = PrivacyAction['type'];

const MAX_KEEP = 100; // 설정 payload 를 작게 — 100건이면 1년치 파기 대장으로 충분

/**
 * 대장이 이 PC 에 남지 않았을 때 화면이 적는 말 (296).
 * `describePrefLoss` 를 쓰지 않는다 — 그 문구는 "공간을 비운 뒤 다시 저장해주세요" 라고 하는데,
 * 익명화·병합은 **되돌릴 수 없어** 다시 할 수 없다. 처리는 끝났고 기록만 없다는 사실을 그대로 적는다.
 */
export const PRIVACY_LOG_LOST = '개인정보 처리는 끝났지만 파기 대장 기록이 이 PC 에 남지 않았습니다(저장 공간). 공간을 비운 뒤 설정 > 알림 설정의 파기 대장에서 확인해주세요 — 그 처리를 다시 할 필요는 없습니다.';


export function listPrivacyActions(): PrivacyAction[] {
  const list = getPreference('privacyActions');
  return Array.isArray(list) ? list : [];
}

/**
 * @returns 그 기록이 **이 PC 에 남았는지** (296). 개인정보 파기·병합은 되돌릴 수 없으므로, 대장이 남지
 * 않았으면 화면이 그 사실을 말해야 한다 — "기록했다" 고만 말하면 나중에 증빙이 없다.
 */
export function recordPrivacyAction(a: Omit<PrivacyAction, 'id' | 'at'>): PrefLanded {
  if (a.count <= 0) return 'landed'; // 적을 것이 없었다(뜻대로)
  const entry: PrivacyAction = { id: `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), ...a };
  return setPreference('privacyActions', [entry, ...listPrivacyActions()].slice(0, MAX_KEEP));
}

/** 기록용 이름 가림 — '홍길동' → '홍○○' (한 글자 이름은 '○') */
export function maskNameForLog(name: string): string {
  const t = (name || '').trim();
  if (!t) return '○';
  return t.length === 1 ? '○' : t[0] + '○'.repeat(Math.min(t.length - 1, 3));
}

export const PRIVACY_ACTION_LABEL: Record<PrivacyActionType, string> = { anonymize: '익명화', merge: '병합' };
