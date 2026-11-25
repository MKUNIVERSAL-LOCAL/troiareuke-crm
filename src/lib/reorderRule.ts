// ═══════════════════════════════════════════════════════════════
// reorderRule — 발주 제안 규칙 (순수 모듈, 248, GAP P-5 계열)
// ───────────────────────────────────────────────────────────────
// 왜: 재고 부족 알림은 "안전재고보다 적다" 만 말했다. 얼마나 급한지(며칠 남았는지)와 **몇 개를 주문해야 하는지**는
//     사장이 판매 기록을 뒤져 머리로 계산했고, 그래서 늘 "다 떨어진 뒤에" 주문한다.
//     상용 재고 도구(ERPNext reorder level, Zenoti 발주)는 소비 속도로 발주 수량을 제안한다.
// 공식(화면에 그대로 적는다 — 숨은 계산 금지):
//   하루 판매량 = 최근 N일(기본 30) 판매 수량 ÷ N      (취소된 판매는 뺀다)
//   남은 일수   = 현재고 ÷ 하루 판매량                  (하루 판매량 0 이면 "알 수 없음")
//   권장 발주   = (하루 판매량 × 커버 일수) + 안전재고 − 현재고, 0 이하면 발주 불필요
// 정직성: 판매 기록이 없으면 속도를 지어내지 않는다 — 안전재고에 못 미칠 때만 그 차이만큼 제안하고 사유를 적는다.
//          기간 안의 판매만 세므로 신제품·계절 제품은 과소·과대가 될 수 있다는 사실을 화면에 적는다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export interface ReorderProduct { id: string; name: string; unit: string; stock: number; minStock?: number }
export interface ReorderSale { productId?: string; productName?: string; quantity: number; saleDate: string; id?: string }

export interface ReorderInput {
  products: ReorderProduct[];
  sales: ReorderSale[];
  /** 취소(환불)된 판매 id — 재고가 되돌아온 건이라 소비로 세지 않는다 */
  canceledSaleIds?: Set<string>;
  today: string;              // YYYY-MM-DD
  windowDays?: number;        // 최근 며칠의 판매로 속도를 볼지 (기본 30)
  coverDays?: number;         // 며칠분을 채울지 (기본 30)
}

export interface ReorderRow {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  /** 기간 안 판매 수량 */
  sold: number;
  /** 하루 판매량(소수 1자리) */
  dailyRate: number;
  /** 남은 일수 — 하루 판매량 0 이면 null */
  daysLeft: number | null;
  /** 권장 발주 수량(개) */
  suggestQty: number;
  /** 근거 한 줄 */
  reason: string;
}

export const DEFAULT_WINDOW_DAYS = 30;
export const DEFAULT_COVER_DAYS = 30;

function daysBefore(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function reorderSuggestions(i: ReorderInput): ReorderRow[] {
  const windowDays = Math.max(1, i.windowDays ?? DEFAULT_WINDOW_DAYS);
  const coverDays = Math.max(1, i.coverDays ?? DEFAULT_COVER_DAYS);
  const from = daysBefore(i.today, windowDays);
  const canceled = i.canceledSaleIds ?? new Set<string>();

  const soldBy = new Map<string, number>();
  for (const s of i.sales) {
    if (!s.productId) continue;                                   // 제품 연결이 없는 옛 판매는 속도 계산에서 뺀다
    if (s.id && canceled.has(s.id)) continue;                     // 취소된 판매는 재고가 돌아왔다
    const date = String(s.saleDate || '').slice(0, 10);
    if (!date || date < from || date > i.today) continue;         // 기간 밖·미래 날짜 제외
    const qty = Math.max(0, Number(s.quantity) || 0);
    if (qty === 0) continue;
    soldBy.set(s.productId, (soldBy.get(s.productId) ?? 0) + qty);
  }

  const rows: ReorderRow[] = [];
  for (const p of i.products) {
    if (p.id.startsWith('sample_')) continue;                     // 샘플 제품은 재고가 움직이지 않는다
    const minStock = Math.max(0, Number(p.minStock) || 0);
    const stock = Math.max(0, Number(p.stock) || 0);
    const sold = soldBy.get(p.id) ?? 0;
    const dailyRate = Math.round((sold / windowDays) * 10) / 10;
    const daysLeft = dailyRate > 0 ? Math.floor(stock / dailyRate) : null;
    let suggestQty = 0;
    let reason = '';
    if (dailyRate > 0) {
      suggestQty = Math.max(0, Math.ceil(dailyRate * coverDays + minStock - stock));
      reason = `최근 ${windowDays}일 ${sold}${p.unit} 판매(하루 ${dailyRate}${p.unit}) · 현재고 ${stock}${p.unit}로 약 ${daysLeft}일분`;
    } else if (stock < minStock) {
      suggestQty = minStock - stock;                              // 속도를 지어내지 않고 안전재고까지만
      reason = `최근 ${windowDays}일 판매 기록 없음 — 안전재고 ${minStock}${p.unit} 기준`;
    } else {
      continue;                                                   // 제안할 것이 없으면 줄을 만들지 않는다
    }
    if (suggestQty <= 0) continue;
    rows.push({ id: p.id, name: p.name, unit: p.unit, stock, minStock, sold, dailyRate, daysLeft, suggestQty, reason });
  }

  // 급한 것부터 — 남은 일수가 적은 순, 속도를 모르는 건(판매 기록 없음)은 뒤로, 같으면 이름순
  return rows.sort((a, b) => {
    const ad = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const bd = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return ad - bd || a.name.localeCompare(b.name);
  });
}

/** 한 줄 문구 — "앰플 30개 주문 권장 (최근 30일 18개 판매 · 현재고 2개로 약 3일분)" */
export function describeReorderRow(r: ReorderRow): string {
  return `${r.name} ${r.suggestQty}${r.unit} 주문 권장 — ${r.reason}`;
}

/** 발주 목록 복사용 글 — 거래처에 그대로 보낼 수 있게 수량 중심으로 */
export function reorderListText(rows: ReorderRow[], today: string): string {
  if (rows.length === 0) return '';
  const lines = rows.map(r => `- ${r.name} ${r.suggestQty}${r.unit} (현재고 ${r.stock}${r.unit}${r.daysLeft !== null ? `, 약 ${r.daysLeft}일분` : ''})`);
  return [`[발주 요청] ${today}`, ...lines, '', '* 최근 판매 속도와 안전재고로 계산한 제안입니다. 수량은 매장이 확인 후 확정합니다.'].join('\n');
}

export const REORDER_CAVEAT =
  '최근 판매 속도로 계산한 제안입니다 — 신제품·계절 제품은 실제와 다를 수 있고, 제품을 연결하지 않은 옛 판매와 취소된 판매는 세지 않습니다. 수량은 확인 후 주문하세요.';
