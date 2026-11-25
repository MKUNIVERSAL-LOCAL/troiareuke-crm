// marketingConsent — 광고 수신 동의·거부 저장(고객 태그)과 무료수신거부 080 번호(지점 설정) (비코어, 155, GAP C-8·M-4)
// 규칙(태그 ↔ 상태)은 순수 consentRule.ts, 광고 표기·시간대는 adComplianceRule.ts.
import { CustomerStore } from './store';
import { todayISO } from './format';
import { getPreference, setPreference } from './shopPreferences';
import { consentFromTags, tagsWithConsent } from './consentRule';
import { logCustomerEdit } from './customerHistory'; // 동의 토글도 변경 이력에 (254 리뷰 H-2)
import type { Customer } from '../types';
import type { ConsentState } from './adComplianceRule';

export function consentOf(c: Pick<Customer, 'tags'>): ConsentState {
  return consentFromTags(c.tags);
}

interface ConsentPatch { ad?: 'consented' | 'optout' | 'unknown'; sms?: boolean; kakao?: boolean }

/** 고객의 동의 상태를 바꿔 저장한다(태그 갱신 — 코어 CustomerStore.update, 고객 행 단위 동기) */
export function setConsent(customerId: string, patch: ConsentPatch, actor?: string): ConsentState | null {
  const c = CustomerStore.getAll().find(x => x.id === customerId);
  if (!c) return null;
  const cur = consentOf(c);
  const ad = patch.ad ?? cur.ad;
  const next: ConsentState = { ad, sms: patch.sms ?? cur.sms, kakao: patch.kakao ?? cur.kakao, consentAt: ad === 'consented' ? (cur.ad === 'consented' ? cur.consentAt : todayISO()) : undefined };
  const nextTags = tagsWithConsent(c.tags, next, todayISO());
  CustomerStore.update(customerId, { tags: nextTags });
  // 광고 수신 동의는 법적으로 다툴 수 있는 항목이라 변경 사실을 남긴다 (254 리뷰 H-2)
  logCustomerEdit(customerId, { tags: c.tags }, { tags: nextTags }, actor);
  return next;
}

/** 무료수신거부 080 번호 — 지점 설정 행(모든 기기 동기) */
export function getOptOutNumber(): string {
  const v = getPreference('adsOptOutNumber');
  return typeof v === 'string' ? v : '';
}
export function setOptOutNumber(n: string): void {
  setPreference('adsOptOutNumber', n.trim());
}
