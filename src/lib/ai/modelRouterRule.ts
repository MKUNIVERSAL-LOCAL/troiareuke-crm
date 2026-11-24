// modelRouterRule — 본사 AI 게이트웨이의 모델 선택 규칙 (순수, 160, docs/AI-GATEWAY-ARCHITECTURE.md 3절)
// 서버(161)와 클라이언트가 같은 규칙을 쓰기 위한 참조 구현. 결정적: 같은 입력 → 같은 primary·폴백 순서.
import type { AiModel } from './catalog';
import type { AiProvider } from './types';

export type AiTaskKind = 'chat' | 'briefing' | 'skin-analysis' | 'campaign-copy';
export type AiPlan = 'trial' | 'starter' | 'pro' | 'enterprise';
export type ModelTier = 'economy' | 'standard' | 'premium';

export const LOW_CREDIT_THRESHOLD = 200;
/** 티어 가격 밴드 — 입력+출력 USD/100만 토큰 상한 */
const TIER_MAX_PRICE: Record<ModelTier, number> = { economy: 1, standard: 20, premium: Infinity };
const TIER_ORDER: ModelTier[] = ['economy', 'standard', 'premium'];
const PLAN_TIER: Record<AiPlan, ModelTier> = { trial: 'economy', starter: 'economy', pro: 'standard', enterprise: 'premium' };

export interface RouteInput {
  kind: AiTaskKind;
  plan: AiPlan;
  needsVision: boolean;
  available: AiProvider[];     // 서버에 키가 있는 제공사
  catalog: AiModel[];
  creditsAvailable: number;    // 가용 크레딧(잔액 − 홀드)
}
export type RouteReason = 'ok' | 'low-credits' | 'no-credits' | 'no-model';
export interface RouteDecision { primary: AiModel | null; fallbacks: AiModel[]; tier: ModelTier; reason: RouteReason }

const price = (m: AiModel) => m.inputPer1M + m.outputPer1M;
const up = (t: ModelTier) => TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(t) + 1)];
const down = (t: ModelTier) => TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(t) - 1)];

/** 플랜·작업으로 티어를 정한다 — 브리핑·캠페인 문구는 한 단계 위(품질이 매출 설명·고객 문구에 직결) */
export function tierFor(kind: AiTaskKind, plan: AiPlan): ModelTier {
  const base = PLAN_TIER[plan];
  return kind === 'briefing' || kind === 'campaign-copy' ? up(base) : base;
}

export function routeModel(i: RouteInput): RouteDecision {
  if (i.creditsAvailable <= 0) return { primary: null, fallbacks: [], tier: 'economy', reason: 'no-credits' };
  let tier = tierFor(i.kind, i.plan);
  let reason: RouteReason = 'ok';
  if (i.creditsAvailable < LOW_CREDIT_THRESHOLD && tier !== 'economy') { tier = 'economy'; reason = 'low-credits'; }
  const usable = i.catalog
    .filter(m => i.available.includes(m.provider) && (!i.needsVision || m.vision))
    .sort((a, b) => price(b) - price(a) || a.id.localeCompare(b.id)); // 비싼(품질) 순, 같은 값은 id 로 고정
  if (usable.length === 0) return { primary: null, fallbacks: [], tier, reason: 'no-model' };
  // 밴드 안 후보가 없으면 한 단계씩 내린다(economy 까지)
  let t = tier;
  let inBand = usable.filter(m => price(m) <= TIER_MAX_PRICE[t]);
  while (inBand.length === 0 && t !== 'economy') { t = down(t); inBand = usable.filter(m => price(m) <= TIER_MAX_PRICE[t]); }
  if (inBand.length === 0) inBand = [usable[usable.length - 1]]; // 전부 밴드 밖이면 가장 싼 것 하나
  const primary = inBand[0];
  const rest = usable.filter(m => m !== primary && price(m) <= TIER_MAX_PRICE[t]);
  return { primary, fallbacks: rest, tier: t, reason };
}
