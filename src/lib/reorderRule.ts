// ═══════════════════════════════════════════════════════════════
// reorderRule — 발주 제안 규칙 (순수 모듈, 248, GAP P-5 계열)
// ───────────────────────────────────────────────────────────────
// 왜: 재고 부족 알림은 "안전재고보다 적다" 만 말했다. 얼마나 급한지(며칠 남았는지)와 **몇 개를 주문해야 하는지**는
//     사장이 판매 기록을 뒤져 머리로 계산했고, 그래서 늘 "다 떨어진 뒤에" 주문한다.
//     상용 재고 도구(ERPNext reorder level, Zenoti 발주)는 소비 속도로 발주 수량을 제안한다.
// 공식(화면에 그대로 적는다 — 숨은 계산 금지):
//   하루 판매량 = 최근 N일(기본 30) 판매 수량 ÷ **센 날수**  (취소된 판매는 뺀다)
//     센 날수 = min(N, 그 제품 첫 판매 이후 날수) — 영업 3일 된 매장의 "3일에 3개" 를 하루 0.1개로 깎지 않는다 (250 리뷰 M-8)
//   남은 일수   = 현재고 ÷ 하루 판매량                  (판매가 0건이면 "알 수 없음")
//   권장 발주   = (하루 판매량 × 커버 일수) + 안전재고 − 현재고, 0 이하면 발주 불필요
//   계산은 **원래 속도**로 하고 화면에만 소수 한 자리로 적는다 — 반올림한 값으로 계산하면 남은 일수가 25%,
//   수량이 50% 까지 어긋났다 (250 리뷰 M-1·H-2).
// 정직성: 판매가 **0건일 때만** "판매 기록 없음" 이라고 적는다(전에는 한 달에 1개 팔린 제품도 그렇게 적었다 — H-2).
//          재고부족 규칙은 매장 공용 isLowStock(stock <= minStock)을 그대로 쓴다 — 헤더가 "재고부족" 이라는 제품을
//          발주 제안이 "주문할 것 없음" 이라고 말하던 것 (250 리뷰 H-1).
//          기간 안의 판매만 세므로 계절 제품은 과소·과대가 될 수 있고, 센 날수가 짧으면 그 사실을 근거 줄에 적는다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export interface ReorderProduct { id: string; name: string; unit: string; stock: number; minStock?: number; isActive?: boolean }
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
  /** 하루 판매량 — 계산에 쓰는 원값(화면은 dailyRateText) */
  dailyRate: number;
  /** 화면에 적는 하루 판매량(소수 한 자리) */
  dailyRateText: string;
  /** 속도를 센 날수 — windowDays 보다 짧으면 자료가 적다는 뜻 */
  countedDays: number;
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
  const firstSale = new Map<string, string>();                    // 제품별 가장 오래된 판매일(기간 밖 포함) — 센 날수 계산용
  for (const s of i.sales) {
    if (!s.productId) continue;                                   // 제품 연결이 없는 옛 판매는 속도 계산에서 뺀다
    if (s.id && canceled.has(s.id)) continue;                     // 취소된 판매는 재고가 돌아왔다
    const date = String(s.saleDate || '').slice(0, 10);
    if (!date || date > i.today) continue;                        // 미래 날짜 제외
    const qty = Math.max(0, Number(s.quantity) || 0);
    if (qty === 0) continue;
    const prevFirst = firstSale.get(s.productId);
    if (!prevFirst || date < prevFirst) firstSale.set(s.productId, date);
    if (date < from) continue;                                    // 기간 밖은 속도에 넣지 않는다(첫 판매일만 기억)
    soldBy.set(s.productId, (soldBy.get(s.productId) ?? 0) + qty);
  }
  const daysBetween = (a: string, b: string): number =>
    Math.max(1, Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1);

  const rows: ReorderRow[] = [];
  for (const p of i.products) {
    if (p.id.startsWith('sample_')) continue;                     // 샘플 제품은 재고가 움직이지 않는다
    if (p.isActive === false) continue;                           // 단종·비활성은 발주 대상이 아니다(isLowStock 과 같은 기준)
    const minStock = Math.max(0, Number(p.minStock) || 0);
    const stock = Number(p.stock) || 0;                           // 음수 재고(실사 오차)를 0 으로 꾸미지 않는다 (250 리뷰 L-9)
    const sold = soldBy.get(p.id) ?? 0;
    const first = firstSale.get(p.id);
    // 센 날수 — 첫 판매가 기간 안이면 그 날부터, 아니면 기간 전체
    const countedDays = first && first > from ? Math.min(windowDays, daysBetween(first, i.today)) : windowDays;
    const dailyRate = sold > 0 ? sold / countedDays : 0;          // 계산은 원값으로 (250 리뷰 M-1)
    const dailyRateText = dailyRate > 0 ? String(Math.round(dailyRate * 10) / 10 || Math.round(dailyRate * 100) / 100) : '0';
    const daysLeft = dailyRate > 0 ? Math.floor(Math.max(0, stock) / dailyRate) : null;
    const lowStock = stock <= minStock;                           // 매장 공용 규칙(isLowStock)과 같은 기준 (250 리뷰 H-1)
    let suggestQty = 0;
    let reason = '';
    if (sold > 0) {
      suggestQty = Math.max(0, Math.ceil(dailyRate * coverDays + minStock - stock));
      const short = countedDays < windowDays ? ` · 판매 기록이 ${countedDays}일치뿐이라 추정이 거칠다` : '';
      reason = `최근 ${countedDays}일 ${sold}${p.unit} 판매(하루 ${dailyRateText}${p.unit}) · 현재고 ${stock}${p.unit}로 약 ${daysLeft}일분${short}`;
      if (suggestQty === 0 && lowStock) { suggestQty = Math.max(1, minStock - stock); reason += ' · 안전재고 아래라 최소 수량 제안'; }
    } else if (lowStock) {
      suggestQty = Math.max(1, minStock - stock);                 // 속도를 지어내지 않고 안전재고까지만(같으면 1개)
      reason = `최근 ${windowDays}일 판매 기록 없음 — 안전재고 ${minStock}${p.unit}·현재고 ${stock}${p.unit} 기준`;
    } else {
      continue;                                                   // 제안할 것이 없으면 줄을 만들지 않는다
    }
    if (suggestQty <= 0) continue;
    rows.push({ id: p.id, name: p.name, unit: p.unit, stock, minStock, sold, dailyRate, dailyRateText, countedDays, daysLeft, suggestQty, reason });
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

/** 빈 상태 문구 — 재고부족 규칙과 같은 기준으로 말한다 (250 리뷰 H-1) */
export const REORDER_EMPTY = '지금 주문할 제품이 없습니다. 재고가 모두 안전재고를 넘고, 최근 판매 속도로도 부족하지 않습니다.';

/** 발주 목록 복사용 글 — 거래처에 그대로 보낼 수 있게 수량 중심으로 */
export function reorderListText(rows: ReorderRow[], today: string): string {
  if (rows.length === 0) return '';
  const lines = rows.map(r => `- ${r.name} ${r.suggestQty}${r.unit} (현재고 ${r.stock}${r.unit}${r.daysLeft !== null ? `, 약 ${r.daysLeft}일분` : ''})`);
  return [`[발주 요청] ${today}`, ...lines, '', '* 최근 판매 속도와 안전재고로 계산한 제안입니다. 수량은 매장이 확인 후 확정합니다.'].join('\n');
}

export const REORDER_CAVEAT =
  '최근 판매 속도로 계산한 제안입니다 — 계절 제품은 실제와 다를 수 있고, 판매 기록이 짧은 제품은 근거 줄에 그 사실을 적습니다. 제품을 연결하지 않은 옛 판매와 취소된 판매는 세지 않습니다. 아직 안전재고를 넘었지만 곧 떨어질 제품도 올라오고 판매 중지한 제품은 빠지므로, 대시보드의 "재고 부족" 수와 줄 수가 다를 수 있습니다. 수량은 확인 후 주문하세요.';
