// campaignRule — 캠페인(자동 발송 시나리오) 정의 모델과 순수 규칙 (156, GAP M-3). 저장은 campaignStore.ts, 대상 산출은 campaignTriggers.ts
// 캠페인 = 트리거(언제) + 조건(며칠) + 채널 + 본문 템플릿 + 반복 규칙 + 광고 여부. 발송 모드는 "승인 후 발송"만 — 직원이 대상을 보고 확인한 뒤 나간다.
// 자동(무인) 발송은 PC 가 꺼져 있어도 돌아야 하므로 서버 디스패처(scheduled_messages 확장, 승인 B-4) 뒤에 붙인다.
// 멱등키: 같은 캠페인·같은 고객·같은 회차(반복 규칙에 따른 버킷)에 두 번 나가지 않게 발송 기록에 남기는 키.
import type { ConsentState, AdChannel } from './adComplianceRule';
import { canReceiveAd } from './adComplianceRule';

export type CampaignTrigger =
  | 'reservation_tomorrow'   // 내일 예약 고객(리마인더)
  | 'birthday'               // 생일(오늘 ~ N일 뒤)
  | 'novisit'                // 마지막 방문 뒤 N일 이상, 다음 예약 없음
  | 'revisit_due'            // 재방문 권장일 지남(reminderEngine 기준)
  | 'first_visit_followup'   // 첫 방문 뒤 N일(후기·재방문 유도)
  | 'program_expiring'       // 회차권 만료 임박·만료
  | 'program_low'            // 회차권 잔여 1회·소진
  | 'reservation_today'      // 오늘 예약 고객(당일 아침 안내) (157)
  | 'after_visit'            // 방문 N일 뒤(홈케어·후기) (157)
  | 'noshow_followup'        // 어제 노쇼 고객 (157)
  | 'after_payment';         // 어제 결제 고객(감사 인사) (157)
export type CampaignChannel = 'sms' | 'kakao-channel';
/** once: 고객당 평생 1회 / yearly: 해마다 1회 / per_event: 사건(예약·회차권·방문)마다 1회 */
export type CampaignRepeat = 'once' | 'yearly' | 'per_event';

export interface Campaign {
  id: string;
  name: string;
  enabled: boolean;
  trigger: CampaignTrigger;
  /** 트리거의 일수 조건(생일 N일 전부터 / 미방문 N일 / 첫 방문 N일 뒤). 쓰지 않는 트리거는 무시 */
  days: number;
  channel: CampaignChannel;
  /** 본문 템플릿 — {고객명} {매장명} {예약일시} {시술명} {프로그램명} {잔여회차} {만료일} {마지막방문일} */
  content: string;
  /** 광고성(이벤트·할인) — 수신 동의 고객만, (광고)·080 자동 표기, 21~08시 차단 (155 규칙) */
  isAd: boolean;
  repeat: CampaignRepeat;
  /** 저장 세그먼트 id — 있으면 트리거 대상 중 이 세그먼트에 든 고객만(167, GAP C-6·M-2 연결) */
  segmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export const TRIGGER_LABELS: Record<CampaignTrigger, string> = {
  reservation_tomorrow: '내일 예약 고객',
  birthday: '생일',
  novisit: '미방문 고객',
  revisit_due: '재방문 권장일 지난 고객',
  first_visit_followup: '첫 방문 고객 사후 안내',
  program_expiring: '회차권 만료 임박',
  program_low: '회차권 잔여 1회·소진',
  reservation_today: '오늘 예약 고객',
  after_visit: '방문 뒤 사후 안내',
  noshow_followup: '어제 노쇼 고객',
  after_payment: '어제 결제 고객',
};
/** 트리거가 일수 조건을 쓰는지와 기본값 */
export const TRIGGER_DAYS: Partial<Record<CampaignTrigger, { label: string; defaultDays: number; min: number; max: number }>> = {
  birthday: { label: '생일 며칠 전부터', defaultDays: 0, min: 0, max: 30 },
  novisit: { label: '마지막 방문 뒤 며칠 이상', defaultDays: 60, min: 7, max: 365 },
  first_visit_followup: { label: '첫 방문 뒤 며칠', defaultDays: 3, min: 1, max: 60 },
  program_expiring: { label: '만료 며칠 전부터', defaultDays: 14, min: 1, max: 60 },
  after_visit: { label: '방문 며칠 뒤', defaultDays: 1, min: 1, max: 30 },
};
/** 트리거별 권장 반복 규칙 — 사건형은 per_event, 생일은 yearly, 나머지는 once */
export const TRIGGER_DEFAULT_REPEAT: Record<CampaignTrigger, CampaignRepeat> = {
  reservation_tomorrow: 'per_event',
  birthday: 'yearly',
  novisit: 'once',
  revisit_due: 'once',
  first_visit_followup: 'once',
  program_expiring: 'per_event',
  program_low: 'per_event',
  reservation_today: 'per_event',
  after_visit: 'per_event',
  noshow_followup: 'per_event',
  after_payment: 'per_event',
};
export const REPEAT_LABELS: Record<CampaignRepeat, string> = { once: '고객당 1회', yearly: '해마다 1회', per_event: '사건마다 1회' };
export const CAMPAIGN_VARS = ['{고객명}', '{매장명}', '{예약일시}', '{시술명}', '{프로그램명}', '{잔여회차}', '{만료일}', '{마지막방문일}', '{결제금액}'];

/** 사람이 읽는 트리거 설명 */
export function describeTrigger(c: Pick<Campaign, 'trigger' | 'days'>): string {
  switch (c.trigger) {
    case 'reservation_tomorrow': return '내일 예약(확정·대기)이 있는 고객에게';
    case 'birthday': return c.days > 0 ? `생일 ${c.days}일 전부터 생일까지` : '생일 당일에';
    case 'novisit': return `마지막 방문 뒤 ${c.days}일 이상 지나고 다음 예약이 없는 고객에게`;
    case 'revisit_due': return '재방문 권장일이 지났고 다음 예약이 없는 고객에게';
    case 'first_visit_followup': return `첫 방문 ${c.days}일 뒤에`;
    case 'program_expiring': return `회차권 만료 ${c.days}일 전부터(만료 뒤 포함)`;
    case 'program_low': return '회차권이 1회 남았거나 소진된 고객에게';
    case 'reservation_today': return '오늘 예약(확정·대기)이 있는 고객에게(아침 안내)';
    case 'after_visit': return `방문 ${c.days}일 뒤에`;
    case 'noshow_followup': return '어제 예약에 오지 않은(노쇼) 고객에게';
    case 'after_payment': return '어제 결제한 고객에게';
  }
}

/** 멱등키 — 캠페인·고객·회차 버킷. once → 고정, yearly → 연도, per_event → 사건 키(예약 id·회차권 id·방문일) */
export function idempotencyKey(campaignId: string, customerId: string, repeat: CampaignRepeat, bucket: { year: string; eventId: string }): string {
  const b = repeat === 'once' ? 'once' : repeat === 'yearly' ? bucket.year : bucket.eventId;
  return `${campaignId}|${customerId}|${b}`;
}

/** 템플릿 변수 치환 — 값이 없는 변수는 빈 문자열이 아니라 그대로 두어 발송 전 점검(치환 안 된 변수)에 걸리게 한다 */
export function renderCampaignContent(content: string, vars: Record<string, string>): string {
  return content.replace(/\{[^{}]+\}/g, m => (vars[m] !== undefined && vars[m] !== '' ? vars[m] : m));
}

function hasUnresolvedVars(s: string): boolean {
  return /\{[^{}]+\}/.test(s);
}

export function validateCampaign(c: Pick<Campaign, 'name' | 'content' | 'trigger' | 'days'>): string[] {
  const errs: string[] = [];
  if (!c.name.trim()) errs.push('캠페인 이름을 입력해주세요.');
  if (!c.content.trim()) errs.push('메시지 내용을 입력해주세요.');
  const d = TRIGGER_DAYS[c.trigger];
  if (d && (!Number.isInteger(c.days) || c.days < d.min || c.days > d.max)) errs.push(`${d.label}: ${d.min}~${d.max} 사이 정수로 입력해주세요.`);
  const unknown = (c.content.match(/\{[^{}]+\}/g) || []).filter(v => !CAMPAIGN_VARS.includes(v));
  if (unknown.length) errs.push(`쓸 수 없는 변수: ${[...new Set(unknown)].join(', ')}`);
  return errs;
}

/** 트리거가 산출한 원 후보 — 고객·사유·변수·사건 키 */
export interface RawCandidate {
  customerId: string;
  customerName: string;
  phone: string;
  consent: ConsentState;
  reason: string;
  vars: Record<string, string>;
  eventId: string;
  /** yearly 반복의 연도 버킷(생일이면 그 생일의 연도) — 없으면 실행 연도. 12월 말·1월 초 두 번 나가지 않게 (159 리뷰 M-2) */
  yearBucket?: string;
}
export type SkipReason = 'already_sent' | 'no_consent' | 'channel_optout' | 'no_phone' | 'unresolved_vars' | 'not_in_segment';
export const SKIP_LABELS: Record<SkipReason, string> = {
  already_sent: '이미 발송',
  no_consent: '광고 수신 동의 없음·거부',
  channel_optout: '이 채널 수신 거부',
  no_phone: '전화번호 없음',
  unresolved_vars: '채울 수 없는 변수',
  not_in_segment: '세그먼트 밖',
};
export interface CampaignCandidate extends RawCandidate { key: string; message: string }
export interface Selection { ready: CampaignCandidate[]; skipped: { customerId: string; customerName: string; why: SkipReason }[] }

/** 원 후보 → 발송 가능 후보: 멱등키 중복·동의·채널 거부·번호·변수 치환을 거른다. 광고가 아니면 동의는 보지 않고 채널 거부만 본다 */
export function selectCandidates(c: Pick<Campaign, 'id' | 'repeat' | 'isAd' | 'channel' | 'content'>, raw: RawCandidate[], sentKeys: Set<string>, year: string, segmentIds?: Set<string> | null): Selection {
  const ready: CampaignCandidate[] = [];
  const skipped: Selection['skipped'] = [];
  const adChannel: AdChannel = c.channel === 'sms' ? 'sms' : 'kakao';
  const seen = new Set<string>();
  for (const r of raw) {
    const key = idempotencyKey(c.id, r.customerId, c.repeat, { year: r.yearBucket ?? year, eventId: r.eventId });
    if (seen.has(key)) continue; // 같은 고객이 사건 둘로 두 번 잡혀도 한 회차엔 한 번
    seen.add(key);
    const skip = (why: SkipReason) => skipped.push({ customerId: r.customerId, customerName: r.customerName, why });
    if (sentKeys.has(key)) { skip('already_sent'); continue; }
    if (segmentIds && !segmentIds.has(r.customerId)) { skip('not_in_segment'); continue; } // 저장 세그먼트로 좁힘 (167)
    if (c.isAd && !canReceiveAd(r.consent, adChannel)) { skip(r.consent.ad === 'consented' ? 'channel_optout' : 'no_consent'); continue; }
    if (!c.isAd && (adChannel === 'sms' ? !r.consent.sms : !r.consent.kakao)) { skip('channel_optout'); continue; }
    if (!/^\d{10,11}$/.test(r.phone.replace(/\D/g, ''))) { skip('no_phone'); continue; }
    const message = renderCampaignContent(c.content, { '{고객명}': r.customerName, ...r.vars });
    if (hasUnresolvedVars(message)) { skip('unresolved_vars'); continue; }
    ready.push({ ...r, key, message });
  }
  return { ready, skipped };
}
