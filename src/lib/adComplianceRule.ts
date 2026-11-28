/**
 * adComplianceRule — 광고성 메시지의 정보통신망법 요건 (순수 모듈). 155, GAP C-8·M-4.
 *  - 광고성 문자·카톡은 본문 맨 앞에 "(광고)", 끝에 "무료수신거부 080-xxx-xxxx"(또는 전송자 연락처)를 넣어야 한다(정통망법 50조·시행령).
 *  - 야간(21:00~익일 08:00) 광고 전송은 수신자 별도 동의가 없으면 금지 — 이 앱은 그 시간대 광고 발송을 막고 예약 발송은 허용 시간으로 안내한다.
 *  - 수신 동의가 없거나 수신거부한 고객은 광고 대상에서 뺀다(채널별). 거래 안내(예약 확인·회차권 만료 등 영업성 아닌 안내)는 광고가 아니라 이 규칙을 적용하지 않는다.
 * 동의·거부는 고객 태그(코어 Customer.tags — 고객 행마다 서버 동기)에 적어 두 기기 동시 저장에도 안전하다: 태그 사전은 marketingConsent.ts.
 */
const AD_PREFIX = '(광고)'; // 다시 보내기가 "원본이 광고였는지" 를 본문으로 판정할 때도 쓴다 (210)
const OPT_OUT_LABEL = '무료수신거부';
/** 본문이 광고 꾸밈(머리말)을 이미 갖고 있는가 — 발송 이력 재발송의 광고 판정 (210, 207 리뷰 H-1) */
export function looksLikeAdMessage(content: string): boolean {
  return content.trim().startsWith(AD_PREFIX);
}
/** 광고 꾸밈을 벗긴 원문 — 재발송 때 옛 080 번호 꼬리말이 남지 않게 (210, 리뷰 L-8) */
export function undecorateAdMessage(content: string): string {
  const body = content.trim().startsWith(AD_PREFIX) ? content.trim().slice(AD_PREFIX.length).trimStart() : content.trim();
  return body.split('\n').filter(line => !line.trim().startsWith(OPT_OUT_LABEL)).join('\n').trim();
}
export const QUIET_START_HOUR = 21; // 21:00 부터
export const QUIET_END_HOUR = 8;    // 08:00 전까지

export function isQuietHours(d: Date): boolean {
  const h = d.getHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** 다음 허용 시각(08:00) — 예약 발송 안내용 */
export function nextAllowedTime(d: Date): Date {
  const n = new Date(d);
  if (!isQuietHours(d)) return n;
  if (n.getHours() >= QUIET_START_HOUR) n.setDate(n.getDate() + 1);
  n.setHours(QUIET_END_HOUR, 0, 0, 0);
  return n;
}

/** 080 번호 형식(080-XXX-XXXX / 080-XXXX-XXXX) */
export function isValidOptOutNumber(n: string | undefined | null): boolean {
  return /^080-\d{3,4}-\d{4}$/.test((n || '').trim());
}

/** 광고 본문 꾸미기 — (광고) 머리말과 무료수신거부 꼬리말을 없을 때만 붙인다(중복 방지) */
export function decorateAdMessage(content: string, optOutNumber: string): string {
  let body = content.trim();
  if (!body.startsWith(AD_PREFIX)) body = `${AD_PREFIX} ${body}`;
  const tail = `${OPT_OUT_LABEL} ${optOutNumber.trim()}`;
  if (!body.includes(optOutNumber.trim())) body = `${body}\n${tail}`; // 문구만 보면 "무료수신거부는 매장으로…" 같은 본문에 번호가 빠진다 (159 리뷰 M-4)
  return body;
}

export type AdChannel = 'sms' | 'kakao';
export interface ConsentState { ad: 'consented' | 'optout' | 'unknown'; sms: boolean; kakao: boolean; consentAt?: string }

/** 광고를 이 채널로 보낼 수 있는가 — 동의가 있고 그 채널을 거부하지 않았을 때만 */
export function canReceiveAd(c: ConsentState, channel: AdChannel): boolean {
  return c.ad === 'consented' && (channel === 'sms' ? c.sms : c.kakao);
}

export interface AdCheckInput { isAd: boolean; channel: AdChannel; now: Date; optOutNumber: string | undefined | null; scheduledAt?: Date | null }
export interface AdCheckResult { ok: boolean; reasons: string[] }

/** 발송 직전 점검 — 광고가 아니면 통과. 광고면 080 번호·시간대를 본다 */
export function checkAdSend(i: AdCheckInput): AdCheckResult {
  if (!i.isAd) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  if (!isValidOptOutNumber(i.optOutNumber)) reasons.push('무료수신거부 080 번호가 없습니다. 설정 > 알림 설정에서 080 번호를 등록해야 광고를 보낼 수 있습니다.');
  const when = i.scheduledAt ?? i.now;
  if (isQuietHours(when)) {
    const next = nextAllowedTime(when);
    reasons.push(`광고는 21시~익일 8시에 보낼 수 없습니다(정보통신망법). ${String(next.getHours()).padStart(2, '0')}:00 이후로 예약 발송하세요.`);
  }
  return { ok: reasons.length === 0, reasons };
}
