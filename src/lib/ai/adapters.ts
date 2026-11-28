// src/lib/ai/adapters.ts — 제공사별 어댑터 3종 (150, GAP A-1). AiChat 의 callClaude/callOpenAI/callGemini 를 옮긴 것 — 동작 불변.
// 모델 id 는 카탈로그에서, 키는 호출 쪽이 keys.ts 로 넘긴다. 사용량은 제공사 응답의 usage 를 쓰고 없으면 글자 수 추정.
import { AiAdapterError, type AiAdapter, type ChatRequest, type TokenUsage } from './types';
import { estimateUsage } from './usage';

const DEFAULT_MAX = 2000;
const DEFAULT_TEMP = 0.7;

function joinInput(req: ChatRequest): string {
  return [req.system, req.context || '', ...req.messages.map(m => m.content)].join('\n');
}
function usageOr(req: ChatRequest, text: string, u?: { input?: number; output?: number }): TokenUsage {
  if (u && typeof u.input === 'number' && typeof u.output === 'number') return { input: u.input, output: u.output, estimated: false };
  return estimateUsage(joinInput(req), text);
}
function classify(status: number): AiAdapterError['code'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  return 'response';
}

/** Claude — 브라우저는 CORS 로 막혀 Electron IPC(코어 electron/main.cjs, 모델 고정)에서만 호출한다 */
const claudeAdapter: AiAdapter = {
  id: 'claude', name: 'Claude (Anthropic)', browserCapable: false,
  async chat(req) {
    const systemPrompt = req.context ? `${req.system}\n\n${req.context}` : req.system;
    const api = (window as Window & { electronAPI?: { callClaudeApi?: (p: { apiKey: string; messages: { role: string; content: string }[]; systemPrompt: string }) => Promise<string> } }).electronAPI;
    if (!api?.callClaudeApi) {
      throw new AiAdapterError('claude', 'cors', 'CLAUDE_CORS_BLOCKED: 브라우저에서 Claude API를 직접 호출할 수 없습니다 (CORS 정책).\nOpenAI 또는 Gemini API 키를 설정하면 웹에서도 AI 분석이 가능합니다.\nClaude를 사용하려면 데스크탑 앱에서 접속해주세요.');
    }
    const text = await api.callClaudeApi({ apiKey: req.apiKey, messages: req.messages.map(m => ({ role: m.role, content: m.content })), systemPrompt });
    return { text, provider: 'claude', model: req.model, usage: usageOr(req, text) };
  },
  async testConnection(apiKey, model) {
    try {
      await this.chat({ apiKey, model, system: '연결 테스트입니다. "OK" 한 단어만 답하세요.', messages: [{ role: 'user', content: 'OK?' }], maxTokens: 5 });
      return { ok: true, message: `연결됨 (${model})`, model };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '연결 실패' };
    }
  },
};

const openaiAdapter: AiAdapter = {
  id: 'openai', name: 'ChatGPT (OpenAI)', browserCapable: true,
  async chat(req) {
    const system = req.context ? `${req.system}\n\n${req.context}` : req.system;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${req.apiKey}` },
      body: JSON.stringify({ model: req.model, messages: [{ role: 'system', content: system }, ...req.messages], temperature: req.temperature ?? DEFAULT_TEMP, max_tokens: req.maxTokens ?? DEFAULT_MAX }),
    }).catch(() => { throw new AiAdapterError('openai', 'network', 'OpenAI 서버에 연결하지 못했습니다. 인터넷 연결을 확인해주세요.'); });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new AiAdapterError('openai', classify(response.status), err?.error?.message || `OpenAI 오류 (${response.status})`);
    }
    const data = await response.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    if (!text) throw new AiAdapterError('openai', 'response', 'OpenAI 가 빈 응답을 돌려줬습니다.');
    return { text, provider: 'openai', model: req.model, usage: usageOr(req, text, { input: data?.usage?.prompt_tokens, output: data?.usage?.completion_tokens }) };
  },
  async testConnection(apiKey, model) {
    try {
      await this.chat({ apiKey, model, system: '연결 테스트입니다. "OK" 한 단어만 답하세요.', messages: [{ role: 'user', content: 'OK?' }], maxTokens: 5 });
      return { ok: true, message: `연결됨 (${model})`, model };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '연결 실패' };
    }
  },
};

const geminiAdapter: AiAdapter = {
  id: 'gemini', name: 'Gemini (Google)', browserCapable: true,
  async chat(req) {
    const contents = req.messages.map((m, i) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: i === 0 && m.role === 'user' && req.context ? `[CRM 데이터]\n${req.context}\n\n[질문]\n${m.content}` : m.content }],
    }));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey }, // 키는 URL 이 아니라 헤더로 (보안 감사 2026-11-19)
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: req.system }] }, generationConfig: { temperature: req.temperature ?? DEFAULT_TEMP, maxOutputTokens: req.maxTokens ?? DEFAULT_MAX } }),
    }).catch(() => { throw new AiAdapterError('gemini', 'network', 'Gemini 서버에 연결하지 못했습니다. 인터넷 연결을 확인해주세요.'); });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new AiAdapterError('gemini', classify(response.status), err?.error?.message || `Gemini 오류 (${response.status})`);
    }
    const data = await response.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new AiAdapterError('gemini', 'response', 'Gemini 가 빈 응답을 돌려줬습니다.');
    return { text, provider: 'gemini', model: req.model, usage: usageOr(req, text, { input: data?.usageMetadata?.promptTokenCount, output: data?.usageMetadata?.candidatesTokenCount }) };
  },
  async testConnection(apiKey, model) {
    try {
      await this.chat({ apiKey, model, system: '연결 테스트입니다. "OK" 한 단어만 답하세요.', messages: [{ role: 'user', content: 'OK?' }], maxTokens: 5 });
      return { ok: true, message: `연결됨 (${model})`, model };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '연결 실패' };
    }
  },
};

export const ADAPTERS: Record<AiAdapter['id'], AiAdapter> = { claude: claudeAdapter, openai: openaiAdapter, gemini: geminiAdapter };
