// ═══════════════════════════════════════════════════════════════
// lastUsed — 데스크 입력 속도용 "지난번과 같게" 기억 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 결제수단처럼 매장마다 거의 고정인 값은 매번 고르지 않게 이 기기에 기억한다. 개인정보 아님.
// ═══════════════════════════════════════════════════════════════
const PAYMENT_METHOD_KEY = 'crm_last_payment_method';

export function getLastPaymentMethod(): string | null {
  try { return localStorage.getItem(PAYMENT_METHOD_KEY); } catch { return null; }
}

export function rememberPaymentMethod(method: string): void {
  try { if (method) localStorage.setItem(PAYMENT_METHOD_KEY, method); } catch { /* 저장 불가여도 동작엔 영향 없음 */ }
}
