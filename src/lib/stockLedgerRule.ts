/**
 * stockLedgerRule — 재고 입출고 원장의 순수 규칙 (저장소 의존 없음). 145, GAP P-5.
 * ERPNext Stock Ledger 의 "이동 행을 더하면 현재고" 규칙만 참고한 자체 구현(B).
 *  - 행은 부호 있는 수량(qty): 시작(open) +, 입고(in) +, 판매(sale) −, 판매 취소(cancel) +, 실사(count) ±, 조정(adjust) ±.
 *  - 원장 재고 = Σ qty. 제품 재고 숫자(코어 Product.stock)와 다르면 기록 없는 이동(다른 기기·옛 데이터)이 있었다는 뜻 — 원장을 재고에 맞추는 조정 행을 남긴다(재고를 원장에 맞추면 다른 기기의 판매를 되돌리게 되므로 하지 않는다).
 */
export type StockEntryKind = 'open' | 'in' | 'sale' | 'cancel' | 'count' | 'adjust';

export interface StockEntry {
  id: string;
  productId: string;
  kind: StockEntryKind;
  qty: number;          // 부호 있는 이동 수량
  resultStock: number;  // 이 행 반영 뒤 재고(기록 시점 스냅샷)
  at: string;           // ISO 일시
  date: string;         // YYYY-MM-DD (매입일·판매일 등 업무 날짜)
  unitCost?: number;    // 입고 단가
  refId?: string;       // 판매 id·지출 id
  note?: string;
  actor?: string;
}

export const STOCK_KIND_LABEL: Record<StockEntryKind, string> = { open: '시작 재고', in: '입고', sale: '판매', cancel: '판매 취소', count: '실사 조정', adjust: '조정' };

/** 원장 재고 = 행 합계 */
export function ledgerStock(entries: StockEntry[], productId: string): number {
  return entries.filter(e => e.productId === productId).reduce((s, e) => s + e.qty, 0);
}

export interface StockReconcile { ledger: number; current: number; diff: number }
/** diff = 현재 재고 − 원장 재고 (0 이면 일치) */
export function reconcile(entries: StockEntry[], productId: string, currentStock: number): StockReconcile {
  const ledger = ledgerStock(entries, productId);
  return { ledger, current: currentStock, diff: currentStock - ledger };
}

export interface StockSummary { received: number; sold: number; canceled: number; adjusted: number; receivedCost: number }
/** 기간 합계(from/to 포함, YYYY-MM-DD) — 입고 수량·매입액, 판매·취소·조정 */
export function summarize(entries: StockEntry[], productId: string, from?: string, to?: string): StockSummary {
  const out: StockSummary = { received: 0, sold: 0, canceled: 0, adjusted: 0, receivedCost: 0 };
  for (const e of entries) {
    if (e.productId !== productId) continue;
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    if (e.kind === 'in') { out.received += e.qty; out.receivedCost += e.qty * (e.unitCost || 0); }
    else if (e.kind === 'sale') out.sold += -e.qty;
    else if (e.kind === 'cancel') out.canceled += e.qty;
    else if (e.kind === 'count' || e.kind === 'adjust') out.adjusted += e.qty;
  }
  return out;
}

/** 제품의 행을 최신순으로 */
export function entriesOf(entries: StockEntry[], productId: string): StockEntry[] {
  // 같은 순간에 기록된 행(시작 재고 + 첫 이동)은 저장 순서(뒤가 최신)로 — at 만으로는 순서가 뒤집힌다
  return entries.map((e, i) => ({ e, i })).filter(x => x.e.productId === productId).sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i).map(x => x.e);
}
