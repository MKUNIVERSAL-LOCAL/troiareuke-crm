import { useMemo, useState } from 'react';
import Modal from './ui/Modal';
import { ProductStore } from '../lib/store';
import { recordStockMovement, allStockEntries } from '../lib/stockLedger';
import { persistedStockMap } from '../lib/persistedStock'; // 재고가 정말 저장됐는지 되읽어 확인 (리뷰 H-1)
import { todayISO } from '../lib/format';
import { notify } from '../lib/notify';
import { askConfirm } from '../lib/confirmDialog';
import { buildCountRows, countSummary, rowsToSave, describeCountSummary, countNote, zeroingRows, type CountItem } from '../lib/stockCountRule';
import type { Product } from '../types';

/**
 * 전 제품 재고 실사 (245, GAP P-5 후속) — 제품 하나씩 창을 열어 맞추던 실사를 한 화면에서 끝낸다.
 * 제품 30종인 매장은 창을 30번 열어야 했고, 그래서 아무도 실사를 하지 않아 재고 숫자가 현실과 멀어졌다
 * (발주·원가·재고부족 알림이 전부 그 숫자를 쓴다).
 *
 * 규칙은 순수 stockCountRule(차이 계산·입력 검증·요약). 여기서는 저장만 한다:
 *  - 빈칸은 세지 않은 제품이라 건드리지 않는다(0 으로 맞추지 않는다).
 *  - 저장 직전 스토어를 다시 읽어 그 사이 판매로 바뀐 재고를 확인하고, 바뀐 제품은 건너뛰고 그 수를 알린다.
 *  - 코어 ProductStore.update 는 한 건마다 제품 표 전부를 다시 쓴다 → 25종씩 나눠 저장해 화면이 멈추지 않게 한다(236 과 같은 방식).
 *  - 맞춘 제품마다 원장에 실사(count) 행을 남겨 "왜 바뀌었는지" 가 남는다.
 */
export default function StockCountModal({ products, actor, onClose, onDone }: {
  products: Product[];
  actor?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  // 샘플 제품은 코어 adjustStock 이 no-op — 실사 대상에서 뺀다 (149 리뷰 L-7 과 같은 이유)
  const snapshot = (list: Product[]): CountItem[] =>
    list.filter(p => !p.id.startsWith('sample_')).map(p => ({ id: p.id, name: p.name, unit: p.unit, stock: p.stock }));
  // 기준 재고는 **창을 열 때 한 번** 동결한다 (246 리뷰 H-2).
  // 전에는 60초마다 오는 데이터 갱신으로 기준이 따라 올라가, 세는 동안 다른 PC 에서 판매된 제품을
  // "건너뛴다" 던 가드가 항상 통과하고 판매분이 실사로 지워졌다.
  const [items] = useState<CountItem[]>(() => snapshot(products));
  // 그 사이 재고가 바뀐 제품 수 — 숫자를 조용히 바꾸지 않고 "다시 세어 달라" 고 알린다
  const changedSince = useMemo(() => {
    const now = new Map(snapshot(products).map(p => [p.id, p.stock] as const));
    return items.filter(it => now.has(it.id) && now.get(it.id) !== it.stock).length;
  }, [products, items]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const rows = buildCountRows(items, inputs);
  const summary = countSummary(rows);
  const toSave = rowsToSave(rows);

  async function handleSave() {
    if (saving) return;
    if (summary.invalid > 0) { notify('숫자가 아닌 칸이 있습니다. 0 이상 숫자만 적어주세요.'); return; }
    if (toSave.length === 0) {
      notify(summary.entered === 0 ? '실제 수량을 적은 제품이 없습니다.' : '적은 수량이 모두 현재 재고와 같습니다. 바꿀 것이 없습니다.');
      return;
    }
    const sample = toSave.slice(0, 3).map(r => `${r.name} ${r.stock}→${r.counted}${r.unit}`).join(', ');
    const zeros = zeroingRows(rows);
    const delta = [summary.plus > 0 ? `+${summary.plus}` : '', summary.minus < 0 ? `${summary.minus}` : ''].filter(Boolean).join(' / ');
    const lines = [
      `제품 ${toSave.length}종의 재고를 실사 수량으로 맞출까요?`,
      `${sample}${toSave.length > 3 ? ` 외 ${toSave.length - 3}종` : ''}`,
      delta ? `전체 증감 합계 ${delta}` : '',
      // 0 으로 내려가는 제품은 따로 경고한다 — 단건 조정에는 있던 안전장치가 일괄 실사에 없었다 (246 리뷰 M-6)
      zeros.length > 0 ? `이 중 ${zeros.length}종은 재고가 0 이 됩니다(${zeros.slice(0, 3).map(z => z.name).join(', ')}${zeros.length > 3 ? ' 외' : ''})` : '',
      summary.untouched > 0 ? `적지 않은 제품 ${summary.untouched}종은 그대로 둡니다.` : '',
      '되돌리려면 제품마다 다시 실사 조정을 해야 합니다.',
    ].filter(Boolean);
    if (!(await askConfirm({
      title: '재고 실사 반영',
      message: lines.join('\n'),
      confirmLabel: '실사 반영',
      cancelLabel: '닫기',
      danger: zeros.length >= 2, // 여러 제품을 0 으로 내리는 것은 되돌리기 어렵다
    }))) return;

    setSaving(true);
    const date = todayISO();
    let done = 0;
    let applied = 0;
    let skipped = 0;
    // 맞춘 제품 한 줄씩 — 끝에 **재고와 원장 둘 다** 정말 저장됐는지 되읽어 확인한다 (250 리뷰 L-9, 255~257 리뷰 H-1)
    const appliedRows: { id: string; counted: number; entryId: string | null; threw: boolean }[] = [];
    const step = () => {
      try {
        for (const r of toSave.slice(done, done + 25)) {
          const fresh = ProductStore.getAll().find(p => p.id === r.id);
          if (!fresh) { skipped += 1; continue; }            // 그 사이 삭제됐다
          if (fresh.stock !== r.stock) { skipped += 1; continue; } // 그 사이 판매·입고로 바뀌었다 — 옛 숫자로 덮지 않는다
          if (fresh.stock === r.counted) { skipped += 1; continue; }
          const updated = ProductStore.update(r.id, { stock: r.counted as number });
          if (!updated) { skipped += 1; continue; }
          let entryId: string | null = null;
          let threw = false;
          try {
            // 원장 저장만 실패해도 재고는 이미 맞췄으니 되돌리지 않고, 끝에 사실대로 알린다
            const entry = recordStockMovement({ product: fresh, kind: 'count', qty: (r.counted as number) - fresh.stock, date, note: countNote({ counted: r.counted as number, unit: r.unit }, date, memo), actor });
            entryId = entry ? entry.id : null; // 샘플 제품은 원장을 남기지 않는다(실패가 아니다)
          } catch {
            threw = true;
          }
          appliedRows.push({ id: r.id, counted: r.counted as number, entryId, threw });
          applied += 1;
        }
      } catch (e) {
        setSaving(false);
        console.error('[stock-count] 실사 반영 실패:', e);
        notify(`제품 ${applied}종까지 맞추고 저장이 실패했습니다. 저장 공간을 확인한 뒤 남은 제품을 다시 시도해주세요.`);
        onDone();
        return;
      }
      done += 25;
      if (done < toSave.length) { setTimeout(step, 0); return; }
      setSaving(false);
      // 되읽어 확인 — safeSetItem 은 저장 공간 초과를 조용히 삼키므로(토스트만 뜬다) 반환값·예외로는 못 잡는다
      const persistedStock = persistedStockMap();
      const savedEntries = appliedRows.some(a => a.entryId) ? new Set(allStockEntries().map(e => e.id)) : null;
      let stockFailed = 0;
      let ledgerFailed = 0;
      for (const a of appliedRows) {
        if (persistedStock && persistedStock.get(a.id) !== a.counted) { stockFailed += 1; continue; } // 재고부터 안 남았으면 원장 얘기는 하지 않는다
        if (a.threw || (a.entryId && savedEntries && !savedEntries.has(a.entryId))) ledgerFailed += 1;
      }
      const saved = applied - stockFailed;
      if (saved > 0) {
        notify.success(`제품 ${saved}종의 재고를 실사 수량으로 맞췄습니다.${skipped > 0 ? ` ${skipped}종은 그 사이 재고가 바뀌어 건너뛰었습니다(다시 세어주세요).` : ''}`);
      } else if (skipped > 0) {
        notify(`맞출 제품이 없었습니다. ${skipped}종은 그 사이 재고가 바뀌어 건너뛰었습니다(다시 세어주세요).`);
      }
      // 저장 공간이 꽉 찬 PC — "맞췄습니다" 가 거짓이 되지 않게 몇 종이 안 남았는지 말한다 (리뷰 H-1)
      if (stockFailed > 0) notify(`${stockFailed}종은 이 PC 저장 공간이 모자라 재고가 저장되지 않았습니다(프로그램을 다시 열면 옛 수량이 보입니다). 저장 공간을 비운 뒤 다시 세어주세요.`);
      // 원장 기록만 실패하면 그 제품은 "원장 합 ≠ 재고" 가 된다 — 숨기지 않고 알린다 (250 리뷰 L-9)
      if (ledgerFailed > 0) notify(`${ledgerFailed}종은 재고는 맞췄지만 이력(원장)에 남기지 못했습니다. 제품 [이력]에서 "차이를 조정으로 기록" 으로 맞춰주세요.`);
      onDone();
    };
    step();
  }

  return (
    <Modal isOpen onClose={() => { if (!saving) onClose(); }} title="재고 실사" size="lg">
      <div className="space-y-4" data-testid="stock-count">
        <p className="text-sm text-gray-700">
          제품을 직접 세어 실제 수량을 적어주세요. <b>빈칸은 세지 않은 제품</b>으로 두고 건드리지 않습니다.
        </p>
        {changedSince > 0 && (
          <p className="text-sm text-amber-800 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl" role="status" aria-live="polite" data-testid="stock-count-changed">
            세는 동안 제품 {changedSince}종의 재고가 다른 곳에서 바뀌었습니다(판매·입고). 그 제품은 반영에서 건너뛰니 다시 세어주세요.
          </p>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">실사할 제품이 없습니다.</p>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
              <table className="w-full text-sm">
                <caption className="sr-only">제품별 현재 재고와 실제 수량 입력</caption>
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th scope="col" className="text-left py-2 font-medium">제품</th>
                    <th scope="col" className="text-right py-2 font-medium w-20">현재고</th>
                    <th scope="col" className="text-right py-2 font-medium w-28">실제 수량</th>
                    <th scope="col" className="text-right py-2 font-medium w-20">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50" data-testid="stock-count-row" data-product={r.name}>
                      <td className="py-2 pr-2 text-gray-900">{r.name}</td>
                      <td className="py-2 text-right text-gray-500 whitespace-nowrap">{r.stock}{r.unit}</td>
                      <td className="py-2 text-right">
                        <input
                          inputMode="numeric"
                          value={inputs[r.id] ?? ''}
                          onChange={e => setInputs(prev => ({ ...prev, [r.id]: e.target.value }))}
                          aria-label={`${r.name} 실제 수량`}
                          aria-invalid={r.error ? true : undefined}
                          placeholder="-"
                          className={`w-24 px-2 py-2 min-h-[44px] text-sm text-right border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30 ${r.error ? 'border-rose-400' : 'border-gray-200'}`}
                        />
                      </td>
                      <td className={`py-2 text-right whitespace-nowrap font-medium ${r.error ? 'text-rose-600' : r.diff > 0 ? 'text-emerald-700' : r.diff < 0 ? 'text-rose-700' : 'text-gray-400'}`}>
                        {r.error ? '입력 오류' : r.counted === null ? '-' : r.diff === 0 ? '일치' : `${r.diff > 0 ? '+' : ''}${r.diff}${r.unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">실사 메모 (선택 — 원장에 함께 남습니다)</span>
              <input type="text" value={memo} onChange={e => setMemo(e.target.value)} maxLength={40} placeholder="예: 11월 말 월말 실사"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30" />
            </label>
            <p className="text-sm text-gray-700 px-3 py-2 bg-slate-50 rounded-xl" data-testid="stock-count-summary" role="status" aria-live="polite">
              {describeCountSummary(summary)}
            </p>
            <div className="flex gap-2 lg:justify-end">
              <button type="button" onClick={onClose} disabled={saving} className="flex-1 lg:flex-none min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60">닫기</button>
              <button type="button" onClick={handleSave} disabled={saving || toSave.length === 0}
                className="flex-1 lg:flex-none min-h-[44px] px-5 rounded-xl bg-[#1a3a8f] text-white text-sm font-semibold hover:bg-[#15306e] disabled:opacity-60">
                {saving ? '반영 중...' : `${toSave.length}종 실사 반영`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
