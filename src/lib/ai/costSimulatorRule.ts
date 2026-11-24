// costSimulatorRule — 본사 Managed AI 원가·가격 시뮬레이터 (순수, 163, docs/AI-PRICING-AND-COST-ANALYSIS.md)
// 입력은 전부 **가설**(사용량·토큰·환율·요금)이고 모델 단가는 카탈로그(참고값)·모델 라우터(실제 선택 규칙)를 그대로 쓴다.
// 실측(161 서버 계측)이 쌓이면 가정만 바꿔 다시 돌린다 — 숫자는 여기서만 계산하고 문서는 결과를 옮겨 적는다.
import type { AiModel } from './catalog';
import type { AiProvider } from './types';
import { routeModel, type AiPlan, type AiTaskKind } from './modelRouterRule';

export const PLANS: AiPlan[] = ['trial', 'starter', 'pro', 'enterprise'];
export const KINDS: AiTaskKind[] = ['chat', 'briefing', 'skin-analysis', 'campaign-copy'];

export interface KindTokens { input: number; output: number }
export interface SimAssumptions {
  usagePerShop: Record<AiPlan, Record<AiTaskKind, number>>; // 매장 1곳의 월 호출 수(가설)
  tokens: Record<AiTaskKind, KindTokens>;                    // 호출 1회의 입력/출력 토큰(가설, 브리핑 컨텍스트 실측 근사)
  fxKrwPerUsd: number;
  planPriceKrw: Record<AiPlan, number>;                      // AI 월 요금(가설 C-8)
  catalog: AiModel[];
  available: AiProvider[];                                   // 본사 키를 넣을 제공사(C-7)
}
export type PlanMix = Record<AiPlan, number>; // 비중 합 1

export const DEFAULT_PLAN_MIX: PlanMix = { trial: 0.2, starter: 0.4, pro: 0.3, enterprise: 0.1 };
export const DEFAULT_PLAN_PRICE_KRW: Record<AiPlan, number> = { trial: 0, starter: 4900, pro: 9900, enterprise: 19900 };
export const DEFAULT_USAGE: SimAssumptions['usagePerShop'] = {
  trial: { chat: 20, briefing: 4, 'skin-analysis': 2, 'campaign-copy': 2 },
  starter: { chat: 40, briefing: 8, 'skin-analysis': 6, 'campaign-copy': 6 },
  pro: { chat: 80, briefing: 20, 'skin-analysis': 15, 'campaign-copy': 15 },
  enterprise: { chat: 150, briefing: 30, 'skin-analysis': 30, 'campaign-copy': 30 },
};
export const DEFAULT_TOKENS: Record<AiTaskKind, KindTokens> = {
  chat: { input: 1500, output: 400 },             // 시스템 지침 + CRM 자료 블록 + 질문
  briefing: { input: 3000, output: 700 },         // briefingRule 컨텍스트(가명·건수) + 5단 형식 응답
  'skin-analysis': { input: 1500, output: 300 },  // 이미지 토큰 근사 포함
  'campaign-copy': { input: 800, output: 250 },
};

export interface KindCost { kind: AiTaskKind; calls: number; model: string; usdPerCall: number; usd: number }
export interface PlanSim { plan: AiPlan; callsPerShop: number; byKind: KindCost[]; costUsdPerShop: number; costKrwPerShop: number; priceKrw: number; marginKrwPerShop: number; marginPct: number | null }
export interface Scenario { shops: number; rows: (PlanSim & { shops: number })[]; totalCostKrw: number; totalRevenueKrw: number; totalMarginKrw: number; marginPct: number | null; totalCalls: number }

/** 호출 1회 원가(USD) — 라우터가 고를 primary 모델 단가 × 토큰. 크레딧 보호는 끄고(무한) 본래 티어로 */
export function costPerCall(kind: AiTaskKind, plan: AiPlan, a: SimAssumptions): { usd: number; model: string } {
  const r = routeModel({ kind, plan, needsVision: kind === 'skin-analysis', available: a.available, catalog: a.catalog, creditsAvailable: Number.POSITIVE_INFINITY });
  if (!r.primary) return { usd: 0, model: '(없음)' };
  const t = a.tokens[kind];
  return { usd: (t.input / 1_000_000) * r.primary.inputPer1M + (t.output / 1_000_000) * r.primary.outputPer1M, model: r.primary.id };
}

export function simulatePlan(plan: AiPlan, a: SimAssumptions): PlanSim {
  const byKind: KindCost[] = KINDS.map(kind => {
    const calls = a.usagePerShop[plan][kind];
    const { usd, model } = costPerCall(kind, plan, a);
    return { kind, calls, model, usdPerCall: usd, usd: usd * calls };
  });
  const callsPerShop = byKind.reduce((s, k) => s + k.calls, 0);
  const costUsdPerShop = byKind.reduce((s, k) => s + k.usd, 0);
  const costKrwPerShop = costUsdPerShop * a.fxKrwPerUsd;
  const priceKrw = a.planPriceKrw[plan];
  const marginKrwPerShop = priceKrw - costKrwPerShop;
  return { plan, callsPerShop, byKind, costUsdPerShop, costKrwPerShop, priceKrw, marginKrwPerShop, marginPct: priceKrw > 0 ? Math.round((marginKrwPerShop / priceKrw) * 100) : null };
}

export function simulate(shops: number, mix: PlanMix, a: SimAssumptions): Scenario {
  const rows = PLANS.map(plan => ({ ...simulatePlan(plan, a), shops: Math.round(shops * mix[plan]) }));
  const totalCostKrw = rows.reduce((s, r) => s + r.costKrwPerShop * r.shops, 0);
  const totalRevenueKrw = rows.reduce((s, r) => s + r.priceKrw * r.shops, 0);
  const totalMarginKrw = totalRevenueKrw - totalCostKrw;
  return { shops, rows, totalCostKrw, totalRevenueKrw, totalMarginKrw, marginPct: totalRevenueKrw > 0 ? Math.round((totalMarginKrw / totalRevenueKrw) * 100) : null, totalCalls: rows.reduce((s, r) => s + r.callsPerShop * r.shops, 0) };
}

export function scenarios(shopCounts: number[], mix: PlanMix, a: SimAssumptions): Scenario[] {
  return shopCounts.map(n => simulate(n, mix, a));
}

/** 목표 마진율을 지키는 최저 월 요금(원, 100원 단위 올림) */
export function priceForMargin(plan: AiPlan, targetMarginPct: number, a: SimAssumptions): number {
  const cost = simulatePlan(plan, a).costKrwPerShop;
  if (targetMarginPct >= 100) return Number.POSITIVE_INFINITY;
  return Math.ceil(cost / (1 - targetMarginPct / 100) / 100) * 100;
}

/** C-7 예산 상한 제안 — 시나리오 원가의 안전 배수(기본 1.5), 만 원 단위 올림 */
export function budgetCapKrw(sc: Scenario, safety = 1.5): number {
  return Math.ceil((sc.totalCostKrw * safety) / 10_000) * 10_000;
}
