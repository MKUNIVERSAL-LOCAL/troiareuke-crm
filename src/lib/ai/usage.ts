// src/lib/ai/usage.ts — 토큰·비용 추정과 이 기기 사용량 기록 (150, GAP A-1)
// 제공사가 usage 를 돌려주면 그 값을, 아니면 글자 수로 추정한다(한국어는 1토큰 ≈ 1.5자, 영문·숫자 ≈ 4자 — 보수적 평균 2자). 전부 "추정"으로 표시.
import { findModel } from './catalog';
import type { AiUsageDayInput } from './usageSummaryRule';
import type { AiProvider, TokenUsage } from './types';

/** 글자 수 → 토큰 추정(보수적) */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let hangul = 0, other = 0;
  for (const ch of text) { if (/[가-힣]/.test(ch)) hangul++; else other++; }
  return Math.ceil(hangul / 1.5 + other / 4);
}

export function estimateUsage(inputText: string, outputText: string): TokenUsage {
  return { input: estimateTokens(inputText), output: estimateTokens(outputText), estimated: true };
}

/** USD 비용(참고값) — 카탈로그 단가 × 토큰 / 100만 */
function costUsdRaw(provider: AiProvider, modelId: string, usage: TokenUsage): number {
  const m = findModel(provider, modelId);
  return (usage.input * m.inputPer1M + usage.output * m.outputPer1M) / 1_000_000;
}
export function estimateCostUsd(provider: AiProvider, modelId: string, usage: TokenUsage): number {
  return Math.round(costUsdRaw(provider, modelId, usage) * 10000) / 10000;
}

/** 날짜별 기록 한 줄 — 모양은 순수 규칙(`usageSummaryRule`)이 받는 입력과 같다(319) */
export type UsageDay = AiUsageDayInput;

const KEY = 'crm_ai_usage_log';
const KEEP_DAYS = 90;

function read(): UsageDay[] {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function write(list: UsageDay[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP_DAYS))); } catch { /* 저장 못 해도 호출은 성공 — 기록만 빠진다 */ }
}

/** 호출 1건을 그날 합계에 더한다(이 기기 localStorage — 서버 크레딧 원장(PHASE 5)이 열리면 그쪽이 정본) */
function localDate(d = new Date()): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; } // UTC 로 전날에 기록되지 않게 (154 리뷰 L-1)

export function recordUsage(provider: AiProvider, modelId: string, usage: TokenUsage, date = localDate()): UsageDay {
  const list = read();
  let day = list.find(d => d.date === date);
  if (!day) { day = { date, calls: 0, input: 0, output: 0, usd: 0, byProvider: {} }; list.push(day); list.sort((a, b) => a.date.localeCompare(b.date)); }
  day.calls += 1; day.input += usage.input; day.output += usage.output;
  day.usd = day.usd + costUsdRaw(provider, modelId, usage); // 누적은 원값, 표시만 반올림 (154 리뷰 L-2)
  day.byProvider[provider] = (day.byProvider[provider] || 0) + 1;
  write(list);
  return day;
}

/**
 * 이 기기에 쌓인 날짜별 기록 전부 — 요약·집계는 순수 규칙(`summarizeAiUsage`)이 한다 (319).
 * 319 전에는 `usageThisMonth()` 가 이달 합계 **한 줄만** 돌려줬고, 그래서 날짜별·제공사별로 쌓아 둔
 * 기록 90일분을 **어느 화면도 보지 않았다**. 집계를 여기서 또 하지 않는다(규칙을 두 벌로 만들지 않는다).
 */
export function usageLog(): UsageDay[] {
  return read();
}

/** 이 기기 기록은 며칠분까지 남는가 — 화면이 "90일" 같은 수를 **직접 적지 않게** 여기서 준다 */
export const USAGE_KEEP_DAYS = KEEP_DAYS;

/** 이 기기 현지 기준 이번 달 YYYY-MM — UTC 로 전달에 걸리지 않게 `localDate` 를 그대로 쓴다(154 리뷰 L-1) */
export function currentUsageMonth(): string {
  return localDate().slice(0, 7);
}
