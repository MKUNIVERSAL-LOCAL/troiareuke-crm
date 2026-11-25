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
}

/** 입력 문자열 → 수량. 빈칸은 null, 숫자가 아니거나 음수·소수면 undefined(오류) */
export function parseCountedQty(raw: string): number | null | undefined {
  const s = String(raw ?? '').replace(/[,\s]/g, '');
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}

export function buildCountRows(items: CountItem[], inputs: Record<string, string>): CountRow[] {
  return items.map(it => {
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
  /** 늘어난 합 */
  plus: number;
  /** 줄어든 합(음수) */
  minus: number;
}

export function countSummary(rows: CountRow[]): CountSummary {
  const s: CountSummary = { entered: 0, matched: 0, changed: 0, untouched: 0, invalid: 0, plus: 0, minus: 0 };
  for (const r of rows) {
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

/** 저장할 행만 — 차이가 있고 입력이 올바른 것 */
export function rowsToSave(rows: CountRow[]): CountRow[] {
  return rows.filter(r => !r.error && r.counted !== null && r.diff !== 0);
}

export function describeCountSummary(s: CountSummary): string {
  const parts = [`맞출 제품 ${s.changed}종`];
  if (s.matched > 0) parts.push(`일치 ${s.matched}종`);
  if (s.untouched > 0) parts.push(`아직 안 센 제품 ${s.untouched}종`);
  if (s.invalid > 0) parts.push(`잘못 적은 칸 ${s.invalid}개`);
  const delta: string[] = [];
  if (s.plus > 0) delta.push(`+${s.plus}`);
  if (s.minus < 0) delta.push(`${s.minus}`);
  return `${parts.join(' · ')}${delta.length > 0 ? ` (합계 ${delta.join(' / ')})` : ''}`;
}

/** 0 으로 내려가는 제품 수 — 확인창이 따로 경고해야 한다 (246 리뷰 M-6) */
export function zeroingRows(rows: CountRow[]): CountRow[] {
  return rowsToSave(rows).filter(r => r.counted === 0);
}

/** 원장 행에 남길 설명 — 실사 날짜·실제 수량·메모 */
export function countNote(row: { counted: number; unit: string }, date: string, memo?: string): string {
  const base = `실사 ${row.counted}${row.unit} (${date})`;
  const m = (memo ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return m ? `${base} · ${m}` : base;
}
