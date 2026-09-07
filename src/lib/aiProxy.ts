// 본사 AI 키 중계 — NAS 서버(/api/ai/*)가 본사 키로 AI를 대신 호출한다.
// 서버에 키가 없으면 enabled=false → 각 기능은 기존 "지점이 직접 키 입력" 경로로 동작한다.
// 상태는 5분 캐시하고, 바뀌면 'crm:ai-status-changed' 이벤트를 쏜다(화면 갱신용).
import { apiRequest, isAuthApiConfigured } from './authApi';

export interface AiProxyStatus {
  enabled: boolean;
  providers: string[];
  monthlyLimit: number;
  usedThisMonth: number;
  remaining: number | null;
}

const EVENT = 'crm:ai-status-changed';
let cached: { at: number; status: AiProxyStatus } | null = null;
let inflight: Promise<AiProxyStatus | null> | null = null;

const DISABLED: AiProxyStatus = { enabled: false, providers: [], monthlyLimit: 0, usedThisMonth: 0, remaining: null };

/** 마지막으로 알려진 상태 (동기). 아직 조회 전이면 비활성으로 본다. */
export function getCachedAiProxyStatus(): AiProxyStatus {
  return cached?.status ?? DISABLED;
}

export function isAiProxyEnabled(): boolean {
  return getCachedAiProxyStatus().enabled;
}

export async function refreshAiProxyStatus(force = false): Promise<AiProxyStatus | null> {
  if (!isAuthApiConfigured) return null;
  if (!force && cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.status;
  if (inflight) return inflight;
  inflight = apiRequest<AiProxyStatus>('/api/ai/status')
    .then(status => {
      const changed = cached?.status.enabled !== status.enabled;
      cached = { at: Date.now(), status };
      if (changed) window.dispatchEvent(new Event(EVENT));
      return status;
    })
    .catch(() => {
      // 구버전 서버(404)·오프라인 — 비활성으로 두고 다음에 다시 시도
      cached = { at: Date.now(), status: DISABLED };
      return null;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function onAiProxyStatusChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export async function aiProxyChat(messages: { role: string; content: string }[], systemPrompt: string): Promise<{ text: string; provider: string }> {
  const r = await apiRequest<{ text: string; provider: string }>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })), systemPrompt }),
  });
  void refreshAiProxyStatus(true);
  return r;
}

export async function aiProxySkinAnalysis(imageDataUrl: string, prompt: string): Promise<{ text: string; provider: string }> {
  const r = await apiRequest<{ text: string; provider: string }>('/api/ai/skin-analysis', {
    method: 'POST',
    body: JSON.stringify({ imageDataUrl, prompt }),
  });
  void refreshAiProxyStatus(true);
  return r;
}

// 앱 시작 시 한 번 조회 (로그인 전이면 401로 실패 → 비활성, 로그인 후 화면에서 다시 조회)
if (typeof window !== 'undefined') {
  setTimeout(() => { void refreshAiProxyStatus(); }, 1500);
}
