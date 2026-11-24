// campaignCandidates — 켜진 캠페인의 "오늘 대상"을 한 번에 고르는 공용 경로 (비코어, 178 리뷰 M-2·M-3)
// 대시보드 오늘 할 일(177)·AI 브리핑 연락할 고객·추천(158)·실행 창(156)이 같은 선별을 각자 복제하며 전수 스캔(통계 인덱스·세그먼트 사실·발송 기록)을
// 캠페인마다 다시 돌리던 것을 여기서 각 1회만 읽어 재사용한다. 규칙은 campaignRule(순수), 원 후보는 campaignTriggers.
import { listCampaigns, sentKeysByCampaign, sentKeysOf } from './campaignStore';
import { collectRawCandidates, triggerContext, type TriggerContext } from './campaignTriggers';
import { selectCandidates, type Campaign, type Selection } from './campaignRule';
import { buildSegmentFacts, segmentIdsFor } from './savedSegments';
import { toISO } from './revisitRule';

export interface CampaignSelection { campaign: Campaign; selection: Selection }

/** 켜진 캠페인 전부의 오늘 대상 — 통계 인덱스(ctx)·세그먼트 사실·발송 기록은 각 1회 */
export function selectEnabledCampaigns(today = new Date(), ctx: TriggerContext = triggerContext()): CampaignSelection[] {
  const campaigns = listCampaigns().filter(c => c.enabled);
  if (campaigns.length === 0) return [];
  const year = toISO(today).slice(0, 4);
  const facts = campaigns.some(c => c.segmentId) ? buildSegmentFacts() : undefined; // 세그먼트 캠페인이 있을 때만 (170 리뷰 M-2)
  const sent = sentKeysByCampaign();
  return campaigns.map(c => ({ campaign: c, selection: selectCandidates(c, collectRawCandidates(c, today, ctx), sent.get(c.id) ?? new Set<string>(), year, segmentIdsFor(c.segmentId, facts)) }));
}

/** 캠페인 하나의 오늘 대상 — 실행 창 */
export function selectCampaign(c: Campaign, today = new Date()): Selection {
  return selectCandidates(c, collectRawCandidates(c, today), sentKeysOf(c.id), toISO(today).slice(0, 4), segmentIdsFor(c.segmentId));
}
