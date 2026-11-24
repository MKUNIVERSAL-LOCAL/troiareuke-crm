// src/lib/ai/keys.ts — 지점 AI 키의 **유일한** 읽기/쓰기 지점 (150, GAP A-2)
// 지금은 localStorage `ai_key_<provider>` 평문 — 마스터 프롬프트 21절 위반 상태를 **한 곳에 모아** 둔다. 보관 개선(Electron safeStorage IPC = 코어 electron/* →
// 승인 D-13 / 서버 암호화 보관 = 동의·B-2)이 결정되면 이 파일의 두 함수만 바꾸면 된다. 키는 로그·백업(backupSanitize 가 ai_key_* 제외)·AI 컨텍스트에 절대 넣지 않는다.
import type { AiProvider } from './types';

const KEY_OF: Record<AiProvider, string> = { claude: 'ai_key_claude', openai: 'ai_key_openai', gemini: 'ai_key_gemini' };

export function getAiKey(provider: AiProvider): string {
  try { return (localStorage.getItem(KEY_OF[provider]) || '').trim(); } catch { return ''; }
}

export function setAiKey(provider: AiProvider, key: string): boolean {
  try {
    const v = key.trim();
    if (v) localStorage.setItem(KEY_OF[provider], v); else localStorage.removeItem(KEY_OF[provider]);
    return true;
  } catch { return false; }
}

export function getAllAiKeys(): Record<AiProvider, string> {
  return { claude: getAiKey('claude'), openai: getAiKey('openai'), gemini: getAiKey('gemini') };
}

/** 화면 표시용 — 앞 4·뒤 4 만 */
export function maskAiKey(key: string): string {
  const k = key.trim();
  if (!k) return '';
  if (k.length <= 10) return `${k.slice(0, 2)}••••`;
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

/** 키 형식 사전 점검(네트워크 없이) — 틀린 붙여넣기를 바로 잡는다. 통과해도 유효하다는 뜻은 아니다 */
export function looksLikeKey(provider: AiProvider, key: string): boolean {
  const k = key.trim();
  if (!k || /\s/.test(k)) return false;
  if (provider === 'claude') return k.startsWith('sk-ant-') && k.length > 20;
  if (provider === 'openai') return k.startsWith('sk-') && k.length > 20;
  return /^[A-Za-z0-9_-]{20,}$/.test(k);
}

/** 제공사별 선택 모델(이 기기 편의 설정, 카탈로그 id) — 없으면 카탈로그 기본 (151) */
export function getAiModel(provider: AiProvider): string | null {
  try { return localStorage.getItem(`crm_ai_model_${provider}`) || null; } catch { return null; }
}
export function setAiModel(provider: AiProvider, modelId: string): void {
  try { if (modelId) localStorage.setItem(`crm_ai_model_${provider}`, modelId); else localStorage.removeItem(`crm_ai_model_${provider}`); } catch { /* 기기 편의 설정 — 못 남겨도 기본 모델로 동작 */ }
}
export function getAiModels(): Partial<Record<AiProvider, string>> {
  const out: Partial<Record<AiProvider, string>> = {};
  for (const p of ['claude', 'openai', 'gemini'] as AiProvider[]) { const m = getAiModel(p); if (m) out[p] = m; }
  return out;
}
