// src/lib/ai/catalog.ts — 모델 카탈로그 (순수, 150, GAP A-1)
// 기본값은 코드에, 본사가 내려주는 갱신(어드민 기능 플래그 payload)이 있으면 덮어쓴다(원격 갱신 가능). 가격은 **참고값**(USD / 100만 토큰, pricingAsOf 기준) —
// 실제 청구는 제공사 콘솔이 정본이며 화면에는 "추정"으로만 표시한다(마스터 프롬프트 13절).
/** 아는 제공사 — 화면·순수 규칙이 **같은 목록**을 본다(두 벌로 두면 하나만 늘어난다, 324) */
export const AI_PROVIDERS = ['claude', 'openai', 'gemini'] as const;

import type { AiProvider } from './types';

export interface AiModel {
  provider: AiProvider;
  id: string;
  label: string;
  inputPer1M: number;   // USD
  outputPer1M: number;  // USD
  contextK: number;     // 컨텍스트 창(천 토큰)
  vision: boolean;
  default?: boolean;
  note?: string;
}

export const PRICING_AS_OF = '2026-11';

/** 기본 카탈로그 — AiChat 이 쓰던 모델을 기본값으로 두어 동작 불변 */
export const DEFAULT_CATALOG: AiModel[] = [
  { provider: 'claude', id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', inputPer1M: 3, outputPer1M: 15, contextK: 200, vision: true, default: true, note: 'Electron 앱에서만(브라우저 CORS)' },
  { provider: 'openai', id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPer1M: 0.15, outputPer1M: 0.6, contextK: 128, vision: true, default: true },
  { provider: 'openai', id: 'gpt-4o', label: 'GPT-4o', inputPer1M: 2.5, outputPer1M: 10, contextK: 128, vision: true },
  { provider: 'gemini', id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', inputPer1M: 0.075, outputPer1M: 0.3, contextK: 1000, vision: true, default: true },
  { provider: 'gemini', id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', inputPer1M: 1.25, outputPer1M: 5, contextK: 2000, vision: true },
];

let override: AiModel[] | null = null;

/** 본사가 내려준 카탈로그로 교체(검증 통과분만). null 이면 기본값으로 복귀 */
export function setCatalogOverride(models: unknown): boolean {
  if (models === null) { override = null; return true; }
  if (!Array.isArray(models)) return false;
  const ok = models.filter(isAiModel);
  if (ok.length === 0) return false;
  override = ok;
  return true;
}

export function isAiModel(m: unknown): m is AiModel {
  if (!m || typeof m !== 'object') return false;
  const x = m as Record<string, unknown>;
  return (x.provider === 'claude' || x.provider === 'openai' || x.provider === 'gemini')
    && typeof x.id === 'string' && x.id.length > 0 && typeof x.label === 'string'
    && typeof x.inputPer1M === 'number' && x.inputPer1M >= 0 && typeof x.outputPer1M === 'number' && x.outputPer1M >= 0
    && typeof x.contextK === 'number' && typeof x.vision === 'boolean';
}

export function catalog(): AiModel[] {
  return override ?? DEFAULT_CATALOG;
}

export function modelsOf(provider: AiProvider): AiModel[] {
  return catalog().filter(m => m.provider === provider);
}

export function defaultModel(provider: AiProvider): AiModel {
  const list = modelsOf(provider);
  return list.find(m => m.default) ?? list[0] ?? DEFAULT_CATALOG.find(m => m.provider === provider && m.default)!;
}

export function findModel(provider: AiProvider, id: string | undefined | null): AiModel {
  return (id && modelsOf(provider).find(m => m.id === id)) || defaultModel(provider);
}

export const PROVIDER_LABEL: Record<AiProvider, string> = { claude: 'Claude (Anthropic)', openai: 'ChatGPT (OpenAI)', gemini: 'Gemini (Google)' };
