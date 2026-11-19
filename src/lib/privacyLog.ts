// ═══════════════════════════════════════════════════════════════
// privacyLog — 개인정보 처리 기록(익명화·병합) (비코어, 9차 점검 2026-11-20 #29)
// ───────────────────────────────────────────────────────────────
// 누가·언제·몇 명을 익명화/병합했는지 어디에도 남지 않았다(로그인 기록만 존재). 개인정보 파기 대장은 보관이 권장된다.
// 저장: 이 기기 localStorage `crm_<shopId>_privacy_actions` — 테이블 이름 규칙(fullBackup TABLE_NAME_RE)에 맞춰 백업 파일에 함께 들어간다.
// 서버(NAS) 동기는 코어 store 테이블 추가가 필요해 하지 않는다(로드맵 메모) — 설정 > 보존기간 카드에서 최근 기록을 본다.
// ═══════════════════════════════════════════════════════════════

import { getShopId } from './store';

export type PrivacyActionType = 'anonymize' | 'merge';

export interface PrivacyAction {
  id: string;
  at: string;              // ISO
  type: PrivacyActionType;
  count: number;           // 처리한 고객 수
  actor: string;           // 처리한 계정(이름 또는 이메일)
  detail?: string;         // 예: '보존기간 경과 일괄' / '고객 요청' / '병합: A → B'
}

const MAX_KEEP = 200;
const key = () => `crm_${getShopId()}_privacy_actions`;

export function listPrivacyActions(): PrivacyAction[] {
  try {
    const raw = localStorage.getItem(key());
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as PrivacyAction[]) : [];
  } catch {
    return [];
  }
}

export function recordPrivacyAction(a: Omit<PrivacyAction, 'id' | 'at'>): void {
  if (a.count <= 0) return;
  const next = [{ id: `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), ...a }, ...listPrivacyActions()].slice(0, MAX_KEEP);
  try { localStorage.setItem(key(), JSON.stringify(next)); } catch { /* 저장 공간 부족 — 기록은 보조 수단, 처리 자체는 이미 끝났다 */ }
}

export const PRIVACY_ACTION_LABEL: Record<PrivacyActionType, string> = { anonymize: '익명화', merge: '병합' };
