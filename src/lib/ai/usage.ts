// src/lib/ai/usage.ts — 토큰·비용 추정과 이 기기 사용량 기록 (150, GAP A-1)
// 제공사가 usage 를 돌려주면 그 값을, 아니면 글자 수로 추정한다(한국어는 1토큰 ≈ 1.5자, 영문·숫자 ≈ 4자 — 보수적 평균 2자). 전부 "추정"으로 표시.
import { findModel } from './catalog';
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
export function estimateCostUsd(provider: AiProvider, modelId: string, usage: TokenUsage): number {
  const m = findModel(provider, modelId);
  return Math.round(((usage.input * m.inputPer1M + usage.output * m.outputPer1M) / 1_000_000) * 10000) / 10000;
}

export interface UsageDay { date: string; calls: number; input: number; output: number; usd: number; byProvider: Partial<Record<AiProvider, number>> }

const KEY = 'crm_ai_usage_log';
const KEEP_DAYS = 90;

function read(): UsageDay[] {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function write(list: UsageDay[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP_DAYS))); } catch { /* 저장 못 해도 호출은 성공 — 기록만 빠진다 */ }
}

/** 호출 1건을 그날 합계에 더한다(이 기기 localStorage — 서버 크레딧 원장(PHASE 5)이 열리면 그쪽이 정본) */
export function recordUsage(provider: AiProvider, modelId: string, usage: TokenUsage, date = new Date().toISOString().slice(0, 10)): UsageDay {
  const list = read();
  let day = list.find(d => d.date === date);
  if (!day) { day = { date, calls: 0, input: 0, output: 0, usd: 0, byProvider: {} }; list.push(day); list.sort((a, b) => a.date.localeCompare(b.date)); }
  day.calls += 1; day.input += usage.input; day.output += usage.output;
  day.usd = Math.round((day.usd + estimateCostUsd(provider, modelId, usage)) * 10000) / 10000;
  day.byProvider[provider] = (day.byProvider[provider] || 0) + 1;
  write(list);
  return day;
}

/** 이달 합계(추정) */
export function usageThisMonth(month = new Date().toISOString().slice(0, 7)): { calls: number; input: number; output: number; usd: number } {
  return read().filter(d => d.date.startsWith(month)).reduce((s, d) => ({ calls: s.calls + d.calls, input: s.input + d.input, output: s.output + d.output, usd: Math.round((s.usd + d.usd) * 10000) / 10000 }), { calls: 0, input: 0, output: 0, usd: 0 });
}
