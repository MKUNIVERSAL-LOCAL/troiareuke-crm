// src/lib/ai/types.ts — AI 제공사 어댑터 공통 인터페이스 (비코어, 150, GAP A-1)
// AI 는 해석·추천만 한다 — 숫자 계산은 내부 엔진(*Rule.ts)이 하고 컨텍스트로 넘긴다(마스터 프롬프트 12절). 키는 keys.ts 한 곳에서만 읽는다.
import { scrubKeyLike } from './keyLeak';

export type AiProvider = 'claude' | 'openai' | 'gemini';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface ChatRequest {
  apiKey: string;
  model: string;
  system: string;          // 시스템 프롬프트(역할·규칙)
  context?: string;        // CRM 자료 블록(가명화된 <data>) — 제공사마다 넣는 자리가 다르다
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface TokenUsage { input: number; output: number; estimated: boolean } // estimated: 제공사가 안 알려줘 글자 수로 추정

export interface ChatResult { text: string; provider: AiProvider; model: string; usage: TokenUsage }

export interface ConnectionTest { ok: boolean; message: string; model?: string }

export interface AiAdapter {
  id: AiProvider;
  name: string;
  /** 브라우저(웹·PWA)에서 직접 호출 가능한가 — Claude 는 CORS 로 Electron IPC 에서만 */
  browserCapable: boolean;
  chat(req: ChatRequest): Promise<ChatResult>;
  testConnection(apiKey: string, model: string): Promise<ConnectionTest>;
}

export class AiAdapterError extends Error {
  constructor(public provider: AiProvider, public code: 'cors' | 'auth' | 'rate' | 'network' | 'response', message: string) {
    super(scrubKeyLike(message)); // 제공사 오류 문구가 키를 되돌려줘도 화면·대화 기록·다음 턴 전송에 남지 않게 (154 리뷰 M-2)
    this.name = 'AiAdapterError';
  }
}
