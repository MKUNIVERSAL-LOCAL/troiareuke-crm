import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PackagePlus, X } from 'lucide-react';
import { ProductStore } from '../lib/store';
import { ExpenseStore } from '../lib/expenseStore';
import { todayISO } from '../lib/format';
import { notify } from '../lib/notify';
import type { Product, PaymentMethod } from '../types';

type Mode = 'in' | 'set';

/**
 * 재고 입고·조정 모달 (2026-11-18) — 제품 화면 PC·모바일 공용(body 포털).
 * 입고: 수량을 더하고, 매입 단가를 넣으면 지출 원장에 '제품 매입'으로 같이 기록한다(손익계산서 원가 반영).
 * 조정: 실사 결과로 재고 수를 맞춘다(폐기·분실·오기록). 이유를 메모로 남긴다.
 * 재고 이동 원장은 아직 없어(코어 스토어 미지원) 결과 수량만 저장된다 — 입고는 지출 원장으로 추적 가능.
 */
export default function StockAdjustModal({ product, onClose, onDone }: { product: Product; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('in');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState(product.cost ? String(product.cost) : '');
  const [vendor, setVendor] = useState(product.brand || '');
  const [logExpense, setLogExpense] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('계좌이체');
  const [memo, setMemo] = useState('');
  const n = Math.max(0, parseInt(qty.replace(/\D/g, ''), 10) || 0);
  const cost = Math.max(0, parseInt(unitCost.replace(/\D/g, ''), 10) || 0);
  const nextStock = mode === 'in' ? product.stock + n : n;
  const total = n * cost;

  function handleSave() {
    if (!qty.trim()) { notify('수량을 입력해주세요.'); return; }
    if (mode === 'in' && n <= 0) { notify('입고 수량은 1 이상이어야 합니다.'); return; }
    if (mode === 'set' && nextStock === product.stock) { notify('현재 재고와 같습니다.'); return; }
    const updated = ProductStore.update(product.id, { stock: nextStock, ...(mode === 'in' && cost > 0 && cost !== product.cost ? { cost } : {}) });
    if (!updated) { notify('제품을 찾을 수 없습니다.'); return; }
    if (mode === 'in' && logExpense && total > 0) {
      ExpenseStore.save({
        expenseDate: todayISO(),
        category: '제품 매입',
        vendor: vendor.trim() || undefined,
        description: `${product.name} ${n}${product.unit} 입고`,
        amount: total,
        paymentMethod,
        memo: memo.trim() || undefined,
      });
    }
    notify(mode === 'in'
      ? `${product.name} ${n}${product.unit} 입고 → 재고 ${nextStock}${product.unit}${logExpense && total > 0 ? ` · 지출 ${total.toLocaleString()}원 기록` : ''}`
      : `${product.name} 재고를 ${product.stock}${product.unit} → ${nextStock}${product.unit}로 조정했습니다.`);
    onDone();
  }

  return createPortal(
    <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="재고 입고·조정" onClick={e => e.stopPropagation()} className="modal-card my-auto bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-1.5"><PackagePlus size={16} className="text-[#1a3a8f]" />재고 입고·조정</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700"><b>{product.name}</b> · 현재 재고 <b>{product.stock}{product.unit}</b>{product.minStock ? ` (안전재고 ${product.minStock}${product.unit})` : ''}</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="작업 종류">
            <button type="button" aria-pressed={mode === 'in'} onClick={() => setMode('in')}
              className={`py-2 rounded-xl text-sm font-medium border ${mode === 'in' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200'}`}>입고 (수량 더하기)</button>
            <button type="button" aria-pressed={mode === 'set'} onClick={() => setMode('set')}
              className={`py-2 rounded-xl text-sm font-medium border ${mode === 'set' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200'}`}>실사 조정 (재고 맞추기)</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{mode === 'in' ? '입고 수량' : '실제 재고 수량'}</label>
            <input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" aria-label={mode === 'in' ? '입고 수량' : '실제 재고 수량'} autoFocus
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30" />
            <p className="text-xs text-gray-400 mt-1">저장 후 재고: <b className={nextStock <= product.minStock ? 'text-red-500' : 'text-gray-700'}>{nextStock}{product.unit}</b></p>
          </div>
          {mode === 'in' && (
            <div className="space-y-3 p-3 bg-slate-50 rounded-xl">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={logExpense} onChange={e => setLogExpense(e.target.checked)} className="accent-[#1a3a8f]" />
                매입 비용을 지출 원장에 기록 (손익계산서 원가)
              </label>
              {logExpense && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">매입 단가(원)</label>
                      <input inputMode="numeric" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0" aria-label="매입 단가"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">지불 수단</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} aria-label="지불 수단" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
                        {(['계좌이체', '카드', '현금'] as PaymentMethod[]).map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">거래처</label>
                    <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="예: OO코스메틱" aria-label="거래처" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
                  </div>
                  <p className="text-xs text-gray-500">매입 합계 <b className="text-gray-800">{total.toLocaleString()}원</b>{cost > 0 && cost !== product.cost ? ' · 제품 원가도 이 단가로 갱신' : ''}</p>
                </>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">메모{mode === 'set' ? ' (조정 이유: 폐기·분실·오기록 등)' : ''}</label>
            <input value={memo} onChange={e => setMemo(e.target.value)} aria-label="메모" placeholder={mode === 'set' ? '예: 유통기한 경과 폐기 2개' : '예: 11월 정기 발주'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
            <button type="button" onClick={handleSave} className="flex-1 py-2.5 bg-[#1a3a8f] hover:bg-[#15306e] text-white rounded-xl text-sm font-semibold">
              {mode === 'in' ? '입고 저장' : '조정 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
