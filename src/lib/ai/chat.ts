// src/lib/ai/chat.ts — 제공사 선택·폴백 오케스트레이션 (150, GAP A-1). AiChat 의 selectProvider + 폴백 루프를 옮긴 것 — 순서 불변(Claude 우선).
import { ADAPTERS } from './adapters';
import { findModel } from './catalog';
import { recordUsage } from './usage';
import type { AiProvider, ChatMessage, ChatResult } from './types';

export const PROVIDER_ORDER: AiProvider[] = ['claude', 'openai', 'gemini'];

/** 키가 있는 제공사 중 우선순위 첫 번째(Claude 우선). 하나도 없으면 null */
export function selectProvider(keys: Record<AiProvider, string>, order: AiProvider[] = PROVIDER_ORDER): AiProvider | null {
  return order.find(p => !!keys[p]) ?? null;
}

/** 선택된 제공사 뒤에 시도할 순서(키 있는 것만) */
export function fallbackOrder(primary: AiProvider, keys: Record<AiProvider, string>, order: AiProvider[] = PROVIDER_ORDER): AiProvider[] {
  return order.filter(p => p !== primary && !!keys[p]);
}

export interface ChatOptions {
  keys: Record<AiProvider, string>;
  models?: Partial<Record<AiProvider, string>>; // 제공사별 선택 모델(없으면 카탈로그 기본)
  system: string;
  context?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 사용량 기록(기본 true — 이 기기 추정 원장) */
  record?: boolean;
}

/** 우선 제공사로 호출하고 실패하면 키 있는 다른 제공사로 폴백. 전부 실패하면 마지막 오류를 던진다 */
export async function chatWithFallback(o: ChatOptions): Promise<ChatResult> {
  const primary = selectProvider(o.keys);
  if (!primary) throw new Error('AI API 키가 없습니다. 설정에서 키를 등록해주세요.');
  const tries = [primary, ...fallbackOrder(primary, o.keys)];
  let lastError: unknown = null;
  for (const p of tries) {
    try {
      const model = findModel(p, o.models?.[p]).id;
      const r = await ADAPTERS[p].chat({ apiKey: o.keys[p], model, system: o.system, context: o.context, messages: o.messages, maxTokens: o.maxTokens, temperature: o.temperature });
      if (o.record !== false) recordUsage(p, model, r.usage);
      return r;
    } catch (e) {
      lastError = e;
    }
  }
  const msg = lastError instanceof Error ? lastError.message : '';
  throw new Error(tries.length > 1 ? `모든 AI API 호출에 실패했습니다. API 키를 확인해주세요.${msg ? `\n(${msg})` : ''}` : (msg || 'AI 호출에 실패했습니다.'));
}
