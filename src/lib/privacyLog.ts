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
import type { ShopPreferences } from '../types';

export type PrivacyAction = NonNullable<ShopPreferences['privacyActions']>[number];
export type PrivacyActionType = PrivacyAction['type'];

const MAX_KEEP = 100; // 설정 payload 를 작게 — 100건이면 1년치 파기 대장으로 충분

export function listPrivacyActions(): PrivacyAction[] {
  const list = getPreference('privacyActions');
  return Array.isArray(list) ? list : [];
}

export function recordPrivacyAction(a: Omit<PrivacyAction, 'id' | 'at'>): void {
  if (a.count <= 0) return;
  const entry: PrivacyAction = { id: `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), ...a };
  setPreference('privacyActions', [entry, ...listPrivacyActions()].slice(0, MAX_KEEP));
}

/** 기록용 이름 가림 — '홍길동' → '홍○○' (한 글자 이름은 '○') */
export function maskNameForLog(name: string): string {
  const t = (name || '').trim();
  if (!t) return '○';
  return t.length === 1 ? '○' : t[0] + '○'.repeat(Math.min(t.length - 1, 3));
}

export const PRIVACY_ACTION_LABEL: Record<PrivacyActionType, string> = { anonymize: '익명화', merge: '병합' };
