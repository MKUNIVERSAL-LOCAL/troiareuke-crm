// stockLedger — 재고 입출고 원장 저장소 (비코어, 145, GAP P-5)
// 코어 Product.stock 은 숫자 하나뿐이라 "왜 바뀌었는지"가 남지 않았다(입고는 지출 원장으로만 추적). 이 원장은 이동마다 행을 남기고 Σ 로 재고를 설명한다.
// 저장: 이 기기 localStorage `crm_<shop>_stock_ledger`(추가만 하는 행). 서버 컬렉션 `stock_ledger` 는 화이트리스트 승인(B-2, S-7)이 필요해
// 그 전까지는 기기별 원장이다 — 다른 기기의 판매는 여기 없으므로 "현재 재고 ≠ 원장"이 생기고, 그때는 원장을 재고에 맞추는 조정 행을 남긴다(StockLedgerModal).
// 승인 뒤에는 같은 행 형식을 서버에 올리는 어댑터만 붙이면 된다(bookingRequests 와 같은 방식).
import { getShopId, safeSetItem } from './store';
import { todayISO } from './format';
import type { Product } from '../types';
import { foldOldest, type StockEntry, type StockEntryKind } from './stockLedgerRule';

const KEY = () => `crm_${getShopId()}_stock_ledger`;
const MAX_ENTRIES = 20000; // 오래된 행부터 잘라 저장소를 지킨다(한 제품 하루 수십 건이어도 수년치)

function read(): StockEntry[] {
  try { const raw = localStorage.getItem(KEY()); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function write(list: StockEntry[]): void {
  safeSetItem(KEY(), JSON.stringify(list.length > MAX_ENTRIES ? foldOldest(list, list.length - MAX_ENTRIES, genId) : list)); // 잘린 행의 Σ 는 시작 재고 행으로 (149 리뷰 M-1)
}


function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function allStockEntries(): StockEntry[] {
  return read();
}

export interface StockMovement {
  product: Pick<Product, 'id' | 'stock'>; // stock = 이동 **전** 재고
  kind: Exclude<StockEntryKind, 'open'>;
  qty: number;        // 부호 있는 이동 수량(판매는 음수)
  date?: string;      // 업무 날짜(기본 오늘)
  unitCost?: number;
  refId?: string;
  note?: string;
  actor?: string;
}

/** 이동 한 건을 기록한다. 그 제품의 첫 기록이면 이동 전 재고를 "시작 재고" 행으로 먼저 남겨 Σ 가 현재고와 맞게 한다 */
export function recordStockMovement(m: StockMovement): StockEntry | null {
  if (m.product.id.startsWith('sample_')) return null; // 샘플 제품은 코어 adjustStock 이 no-op — 원장도 남기지 않는다 (149 리뷰 L-7)
  const list = read();
  const at = new Date().toISOString();
  const date = m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : todayISO();
  if (!list.some(e => e.productId === m.product.id)) {
    list.push({ id: genId(), productId: m.product.id, kind: 'open', qty: m.product.stock, resultStock: m.product.stock, at, date, note: '원장 시작 시점의 재고' });
  }
  const entry: StockEntry = {
    id: genId(), productId: m.product.id, kind: m.kind, qty: m.qty, resultStock: m.product.stock + m.qty, at, date,
    ...(m.unitCost !== undefined ? { unitCost: m.unitCost } : {}),
    ...(m.refId ? { refId: m.refId } : {}),
    ...(m.note ? { note: m.note } : {}),
    ...(m.actor ? { actor: m.actor } : {}),
  };
  list.push(entry);
  write(list);
  return entry;
}

/** 제품 삭제 시 원장도 정리 */
export function removeStockEntries(productId: string): void {
  const list = read();
  const next = list.filter(e => e.productId !== productId);
  if (next.length !== list.length) write(next);
}
