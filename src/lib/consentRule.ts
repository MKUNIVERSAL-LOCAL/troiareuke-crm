// consentRule — 광고 수신 동의·거부 ↔ 고객 태그 (순수, 155, GAP C-8). 저장은 marketingConsent.ts
// 코어 Customer 에 동의 필드를 못 더하므로 태그(고객 행마다 서버 동기 — 설정 행 맵과 달리 다른 기기 저장에 밀리지 않는다)에 예약어로 적는다.
// 태그는 고객 화면에 칩으로 보여 직원이 상태를 바로 안다. 사전: 광고수신동의 / 광고수신거부 / 문자수신거부 / 카카오수신거부 (+ 동의일 광고동의:YYYY-MM-DD)
import type { ConsentState } from './adComplianceRule';

const TAG_AD_CONSENT = '광고수신동의';
const TAG_AD_OPTOUT = '광고수신거부';
const TAG_SMS_OPTOUT = '문자수신거부';
const TAG_KAKAO_OPTOUT = '카카오수신거부';
const CONSENT_DATE_RE = /^광고동의:(\d{4}-\d{2}-\d{2})$/;
const CONSENT_TAGS = [TAG_AD_CONSENT, TAG_AD_OPTOUT, TAG_SMS_OPTOUT, TAG_KAKAO_OPTOUT];

/** 동의 예약어 태그인가(상태 4종 + 동의일) — 고객 편집 폼은 이 태그를 보여주지도, 저장하지도 않는다(ConsentControl 만 바꾼다) (159 리뷰 H-1) */
export function isConsentTag(t: string): boolean {
  return CONSENT_TAGS.includes(t) || CONSENT_DATE_RE.test(t);
}
/** 동의일 태그인가 — 목록 필터 칩에서 날짜별로 늘어나지 않게 제외 (159 리뷰 L-13) */
export function isConsentDateTag(t: string): boolean {
  return CONSENT_DATE_RE.test(t);
}
/** 편집 폼이 저장할 태그 = 입력한 일반 태그(동의 예약어는 버림) + 기존 동의 태그 그대로 (159 리뷰 H-1) */
export function mergeGeneralTags(typed: string[], existing: string[] | undefined | null): string[] {
  return [...typed.filter(t => !isConsentTag(t)), ...(existing || []).filter(isConsentTag)];
}

/** 태그 → 동의 상태 */
export function consentFromTags(tags: string[] | undefined | null): ConsentState {
  const t = tags || [];
  const optout = t.includes(TAG_AD_OPTOUT);
  const consent = t.includes(TAG_AD_CONSENT);
  const consentAt = t.map(x => CONSENT_DATE_RE.exec(x)?.[1]).find(Boolean);
  return { ad: optout ? 'optout' : consent ? 'consented' : 'unknown', sms: !t.includes(TAG_SMS_OPTOUT), kakao: !t.includes(TAG_KAKAO_OPTOUT), consentAt: consentAt || undefined };
}

/** 동의 상태 → 태그 목록(일반 태그는 유지, 동의 태그는 상태대로 다시 쓴다) */
export function tagsWithConsent(tags: string[] | undefined | null, next: ConsentState, date: string): string[] {
  const keep = (tags || []).filter(x => !isConsentTag(x));
  const out = [...keep];
  if (next.ad === 'consented') out.push(TAG_AD_CONSENT, `광고동의:${next.consentAt || date}`);
  if (next.ad === 'optout') out.push(TAG_AD_OPTOUT);
  if (!next.sms) out.push(TAG_SMS_OPTOUT);
  if (!next.kakao) out.push(TAG_KAKAO_OPTOUT);
  return out;
}
