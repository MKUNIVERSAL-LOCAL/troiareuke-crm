// ═══════════════════════════════════════════════════════════════
// stockCountRule — 전 제품 재고 실사 규칙 (순수 모듈, 245, GAP P-5 후속)
// ───────────────────────────────────────────────────────────────
// 왜: 실사 조정이 제품 하나씩 창을 열어 수량을 맞추는 방식이라, 제품 30종인 매장은 창을 30번 열어야 했다.
//     그래서 아무도 실사를 하지 않고 재고 숫자가 현실과 멀어진다(발주·원가·재고부족 알림이 전부 틀어진다).
// 하는 일: 입력칸 묶음을 받아 제품별 차이를 계산하고, 저장할 것(차이 있는 제품)만 골라 준다.
// 정직성: 숫자가 아닌 입력·음수는 거절해서 "0 으로 맞췄다" 가 되지 않게 한다.
//          빈칸은 "세지 않은 제품" 이고 건드리지 않는다(0 으로 맞추지 않는다).
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export interface CountItem { id: string; name: string; unit: string; stock: number }

export interface CountRow extends CountItem {
  /** 입력한 실제 수량 — 빈칸이면 null(세지 않음) */
  counted: number | null;
  /** 실제 − 현재고. counted 가 null 이면 0 */
  diff: number;
  /** 입력이 잘못된 경우 사유 — 있으면 저장하지 않는다 */
  error?: string;
  /**
   * 세는 동안 **삭제된** 제품 — 반영할 곳이 없다 (277, 리뷰 M-4).
   * 화면 경고만 갈라 놓고 반영 버튼 수·요약·입력칸은 그대로 세던 탓에, 한 화면이 위에서는
   * "삭제된 제품 1종은 반영되지 않습니다", 아래에서는 "3종 실사 반영" 이라고 말했다.
   */
  removed?: boolean;
}

/** 입력 문자열 → 수량. 빈칸은 null, 숫자가 아니거나 음수·소수면 undefined(오류) */
export function parseCountedQty(raw: string): number | null | undefined {
  const s = String(raw ?? '').replace(/[,\s]/g, '');
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** @param removedIds 세는 동안 제품 목록에서 사라진 제품 — 반영 대상에서 빼고 화면에도 그렇게 적는다 (277) */
export function buildCountRows(items: CountItem[], inputs: Record<string, string>, removedIds?: ReadonlySet<string>): CountRow[] {
  return items.map(it => {
    if (removedIds?.has(it.id)) return { ...it, counted: null, diff: 0, removed: true };
    const parsed = parseCountedQty(inputs[it.id] ?? '');
    if (parsed === undefined) return { ...it, counted: null, diff: 0, error: '숫자만 입력해주세요(0 이상)' };
    if (parsed === null) return { ...it, counted: null, diff: 0 };
    return { ...it, counted: parsed, diff: parsed - it.stock };
  });
}

export interface CountSummary {
  /** 수량을 적은 제품 수 */
  entered: number;
  /** 적었고 현재고와 같은 제품 수 */
  matched: number;
  /** 적었고 다른 제품 수 — 저장 대상 */
  changed: number;
  /** 아직 세지 않은 제품 수 */
  untouched: number;
  /** 잘못 적은 제품 수 */
  invalid: number;
  /** 세는 동안 삭제된 제품 수 — 반영 대상이 아니다 (277) */
  removed: number;
  /** 늘어난 합 */
  plus: number;
  /** 줄어든 합(음수) */
  minus: number;
}

export function countSummary(rows: CountRow[]): CountSummary {
  const s: CountSummary = { entered: 0, matched: 0, changed: 0, untouched: 0, invalid: 0, removed: 0, plus: 0, minus: 0 };
  for (const r of rows) {
    if (r.removed) { s.removed += 1; continue; } // 삭제된 제품은 "안 센 제품" 으로도 세지 않는다
    if (r.error) { s.invalid += 1; continue; }
    if (r.counted === null) { s.untouched += 1; continue; }
    s.entered += 1;
    if (r.diff === 0) s.matched += 1;
    else {
      s.changed += 1;
      if (r.diff > 0) s.plus += r.diff; else s.minus += r.diff;
    }
  }
  return s;
}

/** 저장할 행만 — 차이가 있고 입력이 올바르고 **제품이 아직 있는** 것 (277, 리뷰 M-4) */
export function rowsToSave(rows: CountRow[]): CountRow[] {
  return rows.filter(r => !r.removed && !r.error && r.counted !== null && r.diff !== 0);
}

export function describeCountSummary(s: CountSummary): string {
  const parts = [`맞출 제품 ${s.changed}종`];
  if (s.matched > 0) parts.push(`일치 ${s.matched}종`);
  if (s.untouched > 0) parts.push(`아직 안 센 제품 ${s.untouched}종`);
  if (s.invalid > 0) parts.push(`잘못 적은 칸 ${s.invalid}개`);
  if (s.removed > 0) parts.push(`삭제된 제품 ${s.removed}종`); // 버튼 수와 같은 기준으로 센다 (277)
  const delta: string[] = [];
  if (s.plus > 0) delta.push(`+${s.plus}`);
  if (s.minus < 0) delta.push(`${s.minus}`);
  return `${parts.join(' · ')}${delta.length > 0 ? ` (합계 ${delta.join(' / ')})` : ''}`;
}

/** 0 으로 내려가는 제품 수 — 확인창이 따로 경고해야 한다 (246 리뷰 M-6) */
export function zeroingRows(rows: CountRow[]): CountRow[] {
  return rowsToSave(rows).filter(r => r.counted === 0);
}

/**
 * 세는 동안 **다른 곳에서** 재고가 바뀐 제품을 화면에 알리는 문장 (275 — 274 가 화면 안에 적어 둔 세 갈래를 규칙으로).
 * 세 갈래를 구분하는 이유가 다르다: 내가 센 제품은 반영에서 빠지니 **다시 세어야** 하고,
 * 안 센 제품은 애초에 반영 대상이 아니라 알려만 주면 되고, **삭제된** 제품은 다시 셀 곳이 없다.
 * (274 전에는 삭제된 제품에도 "다시 세어주세요" 라고 해서 직원이 없는 제품을 찾으러 갔다.)
 */
export interface StockDrift { counted: number; untouched: number; removed: number }
export function describeStockDrift(d: StockDrift): string | null {
  const parts: string[] = [];
  if (d.counted > 0) parts.push(`세는 동안 제품 ${d.counted}종의 재고가 다른 곳에서 바뀌었습니다(판매·입고). 그 제품은 반영에서 건너뛰니 다시 세어주세요.`);
  // "N종도" 는 앞 갈래가 함께 있을 때만 — 혼자 뜨면 무엇에 이어지는 말인지 알 수 없다 (274, 리뷰 L-2)
  if (d.untouched > 0) parts.push(`아직 세지 않은 제품 ${d.untouched}종${d.counted > 0 ? '도' : '은'} 그 사이 재고가 바뀌었습니다(빈칸이라 반영에는 영향이 없습니다).`);
  if (d.removed > 0) parts.push(`그 사이 삭제된 제품 ${d.removed}종은 반영되지 않습니다(다시 세지 않아도 됩니다).`);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * 반영에서 건너뛴 제품을 **이유별로** 적는다 (275 — 274 의 분기를 규칙으로).
 * 한 숫자로 뭉개면 "다시 세어주세요" 가 삭제된 제품·이미 맞던 제품에도 붙어 거짓이 된다.
 */
export interface StockSkips { changed: number; gone: number; same: number }
export function describeStockSkips(s: StockSkips): string {
  return [
    s.changed > 0 ? `${s.changed}종은 그 사이 재고가 바뀌어 건너뛰었습니다(다시 세어주세요).` : '',
    s.gone > 0 ? `${s.gone}종은 그 사이 삭제돼 건너뛰었습니다.` : '',
    s.same > 0 ? `${s.same}종은 이미 적은 수량과 같아 그대로 뒀습니다.` : '',
  ].filter(Boolean).join(' ');
}

/** 원장 행에 남길 설명 — 실사 날짜·실제 수량·메모 */
export function countNote(row: { counted: number; unit: string }, date: string, memo?: string): string {
  const base = `실사 ${row.counted}${row.unit} (${date})`;
  const m = (memo ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return m ? `${base} · ${m}` : base;
}
