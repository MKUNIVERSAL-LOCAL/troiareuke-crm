// creditLedgerRule — AI 크레딧 원장 규칙 (순수, 160, docs/AI-GATEWAY-ARCHITECTURE.md 4절)
// 정본은 서버 테이블 ai_credit_ledger(161). 이 모듈은 불변식(잔액 ≥ 0, 가용 = 잔액 − 홀드, 멱등 consume)을 한 곳에 두어 서버·화면·테스트가 같은 계산을 쓰게 한다.
import type { AiPlan } from './modelRouterRule';

export type LedgerKind = 'grant' | 'hold' | 'consume' | 'release' | 'refund' | 'expire';
export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  amount: number;          // 양의 정수(크레딧)
  at: string;              // ISO
  requestId?: string;      // hold/consume/release 를 한 호출로 묶고 consume 멱등의 키
  note?: string;
}
export interface LedgerState { balance: number; holds: number; available: number }

/** 월 지급 크레딧(가설 — 163 가격 분석·C-8 에서 확정) */
export const MONTHLY_GRANT: Record<AiPlan, number> = { trial: 300, starter: 1000, pro: 3000, enterprise: 10000 };
export const DEFAULT_FX_KRW_PER_USD = 1400;
export const DEFAULT_MARGIN = 2.0;

/** 제공사 원가(USD) → 크레딧(정수, 올림). 1크레딧 = 원가 1원 × 마진 배수의 역수 — 기본 환율 1,400원·마진 2.0 (가설) */
export function creditsForCost(usd: number, fxKrwPerUsd = DEFAULT_FX_KRW_PER_USD, margin = DEFAULT_MARGIN): number {
  if (!(usd > 0) || !(fxKrwPerUsd > 0) || !(margin > 0)) return 0;
  return Math.ceil(usd * fxKrwPerUsd * margin);
}

/** 원장 → 잔액·활성 홀드·가용. 활성 홀드 = release 나 consume 으로 닫히지 않은 hold */
export function ledgerState(entries: LedgerEntry[]): LedgerState {
  let balance = 0;
  const openHolds = new Map<string, number>();
  for (const e of entries) {
    switch (e.kind) {
      case 'grant': case 'refund': balance += e.amount; break;
      case 'consume': case 'expire': balance -= e.amount; if (e.requestId) openHolds.delete(e.requestId); break;
      case 'hold': if (e.requestId) openHolds.set(e.requestId, e.amount); break;
      case 'release': if (e.requestId) openHolds.delete(e.requestId); break;
    }
  }
  const holds = [...openHolds.values()].reduce((a, b) => a + b, 0);
  return { balance, holds, available: balance - holds };
}

export type ApplyResult = { ok: true; entries: LedgerEntry[]; state: LedgerState } | { ok: false; error: string; state: LedgerState };

/** 행 추가 — 불변식을 어기면 ok:false 와 사유. 같은 requestId 의 consume 은 두 번째부터 무시(멱등, ok:true 로 그대로 돌려줌) */
export function applyEntry(entries: LedgerEntry[], e: LedgerEntry): ApplyResult {
  const state = ledgerState(entries);
  if (!Number.isInteger(e.amount) || e.amount <= 0) return { ok: false, error: '크레딧은 양의 정수여야 합니다.', state };
  if ((e.kind === 'hold' || e.kind === 'consume' || e.kind === 'release') && !e.requestId) return { ok: false, error: `${e.kind} 에는 requestId 가 필요합니다.`, state };
  if (e.kind === 'consume' && entries.some(x => x.kind === 'consume' && x.requestId === e.requestId)) return { ok: true, entries, state }; // 멱등
  if (e.kind === 'hold') {
    if (e.amount > state.available) return { ok: false, error: `가용 크레딧 ${state.available} 보다 많은 ${e.amount} 를 선점할 수 없습니다.`, state };
  }
  if (e.kind === 'consume') {
    const held = entries.find(x => x.kind === 'hold' && x.requestId === e.requestId && !entries.some(y => y.kind === 'release' && y.requestId === e.requestId))?.amount ?? 0;
    // 홀드가 있으면 그 홀드가 풀리며 차감되므로 가용 + 홀드분까지 허용
    if (e.amount > state.available + held) return { ok: false, error: `가용 크레딧 ${state.available + held} 보다 많은 ${e.amount} 를 차감할 수 없습니다.`, state };
  }
  if (e.kind === 'expire' && e.amount > state.balance) return { ok: false, error: '잔액보다 많은 크레딧을 소멸시킬 수 없습니다.', state };
  const next = [...entries, e];
  return { ok: true, entries: next, state: ledgerState(next) };
}

/** 월말 소멸 행 — 잔액 전부(이월 없음). 잔액 0 이면 null */
export function expireEntry(entries: LedgerEntry[], id: string, at: string): LedgerEntry | null {
  const { balance } = ledgerState(entries);
  return balance > 0 ? { id, kind: 'expire', amount: balance, at, note: '월말 소멸(이월 없음)' } : null;
}
