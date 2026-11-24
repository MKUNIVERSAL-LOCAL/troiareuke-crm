// adminAi — 본사 AI 서비스 관리 API (비코어, 162, docs/AI-GATEWAY-ARCHITECTURE.md 5·6절)
// 서버 모듈(161)은 승인 B-2·C-7 뒤에 배포된다. 그 전에는 /api/admin/ai/* 가 404 → 화면은 "미배포" 를 그대로 보여주고 숫자를 만들지 않는다.
import { apiRequest, AuthApiError } from './authApi';
import type { AiModel } from './ai/catalog';
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

export async function fetchAdminAiSummary(month: string): Promise<AdminAiSummary> {
  try { return await apiRequest<AdminAiSummary>(`/api/admin/ai/summary?month=${encodeURIComponent(month)}`); } catch (e) { translate(e); }
}
export async function fetchAdminAiBranches(month: string): Promise<AdminAiBranchRow[]> {
  try { const r = await apiRequest<{ branches: AdminAiBranchRow[] }>(`/api/admin/ai/branches?month=${encodeURIComponent(month)}`); return r.branches || []; } catch (e) { translate(e); }
}
export async function adminGrantAiCredits(payload: { branchId: string; amount: number; note: string }): Promise<{ balance: number }> {
  try { return await apiRequest<{ balance: number }>('/api/admin/ai/credits/grant', { method: 'POST', body: JSON.stringify(payload) }); } catch (e) { translate(e); }
}

// ── 모델 카탈로그 배포 — 기존 기능 플래그 경로(global 스코프의 'ai.catalog' payload)를 그대로 쓴다(서버 변경 없음, 150·154) ──
type FlagPayloadMap = Record<string, unknown>;

export async function fetchAiCatalogFlag(): Promise<AiModel[] | null> {
  const r = await apiRequest<{ scopes: Record<string, FlagPayloadMap> }>('/api/admin/feature-flags');
  const cat = r.scopes?.global?.['ai.catalog'];
  return Array.isArray(cat) ? (cat as AiModel[]) : null;
}

/** null 이면 키를 지워 지점이 기본 카탈로그로 돌아간다 */
export async function saveAiCatalogFlag(models: AiModel[] | null): Promise<void> {
  const r = await apiRequest<{ scopes: Record<string, FlagPayloadMap> }>('/api/admin/feature-flags');
  const global: FlagPayloadMap = { ...(r.scopes?.global || {}) };
  if (models) global['ai.catalog'] = models; else delete global['ai.catalog'];
  await apiRequest('/api/admin/feature-flags/global', { method: 'PUT', body: JSON.stringify({ flags: global }) });
}
