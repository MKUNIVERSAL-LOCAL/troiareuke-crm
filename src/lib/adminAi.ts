// adminAi — 본사 AI 서비스 관리 API (비코어, 162, docs/AI-GATEWAY-ARCHITECTURE.md 5·6절)
// 서버 모듈(161)은 승인 B-2·C-7 뒤에 배포된다. 그 전에는 /api/admin/ai/* 가 404 → 화면은 "미배포" 를 그대로 보여주고 숫자를 만들지 않는다.
// 모델 카탈로그 배포는 161 의 전용 엔드포인트(PUT /api/admin/ai/catalog)와 함께 — 기존 기능 플래그 PUT 은 서버가 boolean 만 받아 배열을 거절한다(165 리뷰 H-1).
import { apiRequest, AuthApiError } from './authApi';
import type { AiProvider } from './ai/types';

export interface AdminAiSummary {
  month: string;             // YYYY-MM
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;               // 제공사 추정 원가 합(USD)
  credits: number;           // 차감 크레딧 합
  activeBranches: number;    // 이달 1회 이상 호출한 지점 수
  failRate: number | null;   // 실패 비율 % (호출 0 이면 null)
  fallbackRate: number | null;
  byModel: { provider: AiProvider; model: string; calls: number; usd: number }[];
}
export interface AdminAiBranchRow {
  branchId: string;
  branchName: string | null;
  plan: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  creditsUsed: number;
  creditsBalance: number;
  lastCallAt: string | null;
}

/** 서버에 AI 게이트웨이 모듈이 없음(404) — 승인 B-2 전 정상 상태 */
export class AiModuleNotDeployed extends Error {
  constructor() { super('서버 AI 모듈이 아직 배포되지 않았습니다(승인 B-2·C-7 뒤 161 묶음).'); this.name = 'AiModuleNotDeployed'; }
}

function translate(e: unknown): never {
  if (e instanceof AuthApiError && e.status === 404) throw new AiModuleNotDeployed();
  throw e;
}

// pg numeric 은 JSON 에 문자열로 실려 온다 — 화면의 toFixed·비교가 깨지지 않게 숫자로 강제 (165 리뷰 L-8)
const num = (v: unknown): number => { const n = typeof v === 'string' ? Number(v) : (v as number); return Number.isFinite(n) ? n : 0; };
const nullableNum = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

export async function fetchAdminAiSummary(month: string): Promise<AdminAiSummary> {
  try {
    const r = await apiRequest<AdminAiSummary>(`/api/admin/ai/summary?month=${encodeURIComponent(month)}`);
    return {
      month: String(r.month || month), calls: num(r.calls), inputTokens: num(r.inputTokens), outputTokens: num(r.outputTokens), usd: num(r.usd), credits: num(r.credits),
      activeBranches: num(r.activeBranches), failRate: nullableNum(r.failRate), fallbackRate: nullableNum(r.fallbackRate),
      byModel: Array.isArray(r.byModel) ? r.byModel.map(m => ({ provider: m.provider, model: String(m.model), calls: num(m.calls), usd: num(m.usd) })) : [],
    };
  } catch (e) { translate(e); }
}
export async function fetchAdminAiBranches(month: string): Promise<AdminAiBranchRow[]> {
  try {
    const r = await apiRequest<{ branches: AdminAiBranchRow[] }>(`/api/admin/ai/branches?month=${encodeURIComponent(month)}`);
    return (r.branches || []).map(b => ({
      branchId: String(b.branchId), branchName: b.branchName ?? null, plan: String(b.plan || ''),
      calls: num(b.calls), inputTokens: num(b.inputTokens), outputTokens: num(b.outputTokens), usd: num(b.usd), creditsUsed: num(b.creditsUsed), creditsBalance: num(b.creditsBalance),
      lastCallAt: b.lastCallAt ?? null,
    }));
  } catch (e) { translate(e); }
}
export async function adminGrantAiCredits(payload: { branchId: string; amount: number; note: string }): Promise<{ balance: number }> {
  try { const r = await apiRequest<{ balance: unknown }>('/api/admin/ai/credits/grant', { method: 'POST', body: JSON.stringify(payload) }); return { balance: num(r.balance) }; } catch (e) { translate(e); }
}
