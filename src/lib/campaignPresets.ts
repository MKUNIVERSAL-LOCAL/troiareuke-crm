// campaignPresets — 기본 시나리오 16개 (순수, 157, GAP M-3). 지점은 한 번에 추가한 뒤 문구·일수만 고친다.
// 거래 안내(예약·회차권·결제·노쇼·홈케어)는 isAd=false, 혜택·이벤트는 isAd=true(수신 동의 고객만, (광고)·080 자동).
import type { Campaign } from './campaignRule';

export type CampaignPreset = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'> & { key: string; group: '예약' | '케어' | '리텐션' | '회차권' | '이벤트' };

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  { key: 'resv_tomorrow', group: '예약', name: '예약 전날 안내', enabled: true, trigger: 'reservation_tomorrow', days: 0, channel: 'sms', repeat: 'per_event', isAd: false,
    content: '{고객명}님, 내일 {예약일시} {시술명} 예약을 기다리고 있어요. 변경이 필요하면 미리 연락 주세요. — {매장명}' },
  { key: 'resv_today', group: '예약', name: '예약 당일 아침 안내', enabled: true, trigger: 'reservation_today', days: 0, channel: 'sms', repeat: 'per_event', isAd: false,
    content: '{고객명}님, 오늘 {예약일시} 예약이 있어요. 편안한 마음으로 오세요. — {매장명}' },
  { key: 'noshow', group: '예약', name: '노쇼 사후 안내', enabled: true, trigger: 'noshow_followup', days: 0, channel: 'sms', repeat: 'per_event', isAd: false,
    content: '{고객명}님, 어제 {예약일시} 예약에 못 오셨네요. 괜찮으시다면 편한 날로 다시 잡아드릴게요. — {매장명}' },
  { key: 'homecare_1d', group: '케어', name: '시술 다음날 홈케어 안내', enabled: true, trigger: 'after_visit', days: 1, channel: 'kakao-channel', repeat: 'per_event', isAd: false,
    content: '{고객명}님, 어제 관리 받으신 피부는 오늘 하루 자극을 피하고 보습을 충분히 해주세요. 불편한 점이 있으면 바로 연락 주세요. — {매장명}' },
  { key: 'first_3d', group: '케어', name: '첫 방문 3일 뒤 안내', enabled: true, trigger: 'first_visit_followup', days: 3, channel: 'kakao-channel', repeat: 'once', isAd: false,
    content: '{고객명}님, 첫 방문 감사합니다. 관리 후 피부 상태는 어떠세요? 궁금한 점은 언제든 물어보세요. — {매장명}' },
  { key: 'first_14d', group: '케어', name: '첫 방문 2주 뒤 재방문 안내', enabled: true, trigger: 'first_visit_followup', days: 14, channel: 'sms', repeat: 'once', isAd: false,
    content: '{고객명}님, 첫 관리 후 2주가 지났어요. 효과를 이어가려면 지금이 다음 관리 적기입니다. — {매장명}' },
  { key: 'thanks_pay', group: '케어', name: '결제 감사 인사', enabled: true, trigger: 'after_payment', days: 0, channel: 'sms', repeat: 'per_event', isAd: false,
    content: '{고객명}님, 어제 {결제금액} 결제해 주셔서 감사합니다. 정성껏 관리해 드릴게요. — {매장명}' },
  { key: 'revisit_due', group: '리텐션', name: '재방문 권장일 안내', enabled: true, trigger: 'revisit_due', days: 0, channel: 'sms', repeat: 'once', isAd: false,
    content: '{고객명}님, 마지막 관리({마지막방문일}) 후 권장 주기가 지났어요. 편한 시간으로 예약 도와드릴게요. — {매장명}' },
  { key: 'novisit_30', group: '리텐션', name: '미방문 30일 안부', enabled: true, trigger: 'novisit', days: 30, channel: 'kakao-channel', repeat: 'once', isAd: false,
    content: '{고객명}님, 한 달 동안 잘 지내셨나요? 피부 컨디션이 궁금해요. 언제든 편하게 들러주세요. — {매장명}' },
  { key: 'novisit_60', group: '리텐션', name: '미방문 60일 케어 안내', enabled: true, trigger: 'novisit', days: 60, channel: 'kakao-channel', repeat: 'once', isAd: false,
    content: '{고객명}님, 두 달 넘게 못 봬서 아쉬워요. 계절이 바뀌어 피부 관리가 필요한 때입니다. 예약 도와드릴까요? — {매장명}' },
  { key: 'novisit_90', group: '리텐션', name: '미방문 90일 복귀 혜택', enabled: true, trigger: 'novisit', days: 90, channel: 'sms', repeat: 'once', isAd: true,
    content: '{고객명}님, 오랜만이에요! 다시 찾아주시는 분께 재방문 혜택을 준비했어요. 자세한 내용은 매장으로 문의해 주세요. — {매장명}' },
  { key: 'bday', group: '이벤트', name: '생일 축하', enabled: true, trigger: 'birthday', days: 0, channel: 'kakao-channel', repeat: 'yearly', isAd: false,
    content: '{고객명}님, 생일 축하드려요! 올해도 건강하고 빛나는 피부로 함께할게요. — {매장명}' },
  { key: 'bday_week', group: '이벤트', name: '생일 주간 혜택', enabled: true, trigger: 'birthday', days: 7, channel: 'sms', repeat: 'yearly', isAd: true,
    content: '{고객명}님, 생일 주간을 맞아 특별 혜택을 준비했어요. 이번 주 방문 시 안내드릴게요. — {매장명}' },
  { key: 'prog_exp_14', group: '회차권', name: '회차권 만료 2주 전 안내', enabled: true, trigger: 'program_expiring', days: 14, channel: 'sms', repeat: 'per_event', isAd: false,
    content: '{고객명}님, {프로그램명} 이용 기간이 {만료일}에 끝나요. 남은 {잔여회차}회를 기간 안에 쓰실 수 있게 예약 도와드릴게요. — {매장명}' },
  { key: 'prog_exp_3', group: '회차권', name: '회차권 만료 3일 전 안내', enabled: true, trigger: 'program_expiring', days: 3, channel: 'sms', repeat: 'per_event', isAd: false,
    content: '{고객명}님, {프로그램명} 이용 기간이 {만료일}로 곧 끝나요. 잔여 {잔여회차}회를 꼭 사용해 주세요. — {매장명}' },
  { key: 'prog_low', group: '회차권', name: '회차권 잔여 1회·소진 재구매 안내', enabled: true, trigger: 'program_low', days: 0, channel: 'sms', repeat: 'per_event', isAd: false,
    content: '{고객명}님, {프로그램명} 회차가 {잔여회차}회 남았어요. 관리 흐름이 끊기지 않게 다음 프로그램을 안내드릴게요. — {매장명}' },
];

/** 아직 없는 프리셋만 — 같은 이름의 캠페인이 있으면 건너뛴다 */
export function missingPresets(existingNames: string[]): CampaignPreset[] {
  const set = new Set(existingNames);
  return CAMPAIGN_PRESETS.filter(p => !set.has(p.name));
}
