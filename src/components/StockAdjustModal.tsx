import { useState } from 'react';
import Modal from './ui/Modal';
import { ProductStore } from '../lib/store';
import { ExpenseStore } from '../lib/expenseStore';
import { todayISO } from '../lib/format';
import { getAllPaymentMethods } from '../lib/paymentMethods';
import { notify } from '../lib/notify';
import type { Product, PaymentMethod } from '../types';

type Mode = 'in' | 'set';

/**
 * 재고 입고·조정 모달 (2026-11-18) — 제품 화면 PC·모바일 공용(공용 Modal: Escape·스크롤 잠금).
 * 입고: 수량을 더하고, 매입 단가를 넣으면 지출 원장에 '제품 매입'으로 같이 기록한다(손익계산서 원가 반영). 원가 갱신은 지출을 기록할 때만.
 * 조정: 실사 결과로 재고 수를 맞춘다(폐기·분실·오기록). 이유를 메모로 남긴다.
 * 재고 이동 원장은 아직 없어(코어 스토어 미지원) 결과 수량만 저장된다 — 입고는 지출 원장으로 추적 가능.
 * 저장 시점에 스토어를 다시 읽어 그 사이 판매로 바뀐 재고 위에 더한다(다른 기기와는 last-writer-wins — 서버 델타 API 없음).
 */
export default function StockAdjustModal({ product, onClose, onDone }: { product: Product; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('in');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState(product.cost ? String(product.cost) : '');
  const [vendor, setVendor] = useState(product.brand || '');
  const [logExpense, setLogExpense] = useState(true);
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('계좌이체');
  const [memo, setMemo] = useState('');
  const methods = getAllPaymentMethods().filter(m => m !== '혼합');

  const digits = (raw: string): number | null => {
    const s = raw.replace(/[,\s]/g, '');
    return /^\d+$/.test(s) ? Number(s) : null;
  };
  const n = digits(qty);
  const cost = logExpense ? digits(unitCost) : null;
  const previewStock = n === null ? null : mode === 'in' ? product.stock + n : n;
  const total = n !== null && cost !== null ? n * cost : 0;

  function handleSave() {
    if (n === null) { notify('수량은 숫자만 입력해주세요.'); return; }
    if (mode === 'in' && n <= 0) { notify('입고 수량은 1 이상이어야 합니다.'); return; }
    if (mode === 'in' && logExpense && cost === null) { notify('매입 단가는 숫자만 입력해주세요(없으면 지출 기록을 끄세요).'); return; }
    if (mode === 'in' && logExpense && !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) { notify('매입일을 선택해주세요.'); return; }
    const fresh = ProductStore.getAll().find(p => p.id === product.id);
    if (!fresh) { notify('제품을 찾을 수 없습니다.'); return; }
    if (fresh.stock !== product.stock) notify(`그 사이 재고가 ${product.stock}→${fresh.stock}${product.unit}로 바뀌어 최신 재고 기준으로 반영합니다.`);
    const nextStock = mode === 'in' ? fresh.stock + n : n;
    if (mode === 'set' && nextStock === fresh.stock) { notify('현재 재고와 같습니다.'); return; }
    if (mode === 'set' && nextStock === 0 && !window.confirm(`${product.name} 재고를 0${product.unit}으로 맞출까요?`)) return;
    const updateCost = mode === 'in' && logExpense && cost !== null && cost > 0 && cost !== fresh.cost;
    const updated = ProductStore.update(product.id, { stock: nextStock, ...(updateCost ? { cost: cost! } : {}) });
    if (!updated) { notify('제품을 찾을 수 없습니다.'); return; }
    if (mode === 'in' && logExpense && total > 0) {
      ExpenseStore.save({
        expenseDate,
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
      : `${product.name} 재고를 ${fresh.stock}${product.unit} → ${nextStock}${product.unit}로 조정했습니다.`);
    onDone();
  }

  return (
    <Modal isOpen onClose={onClose} title="재고 입고·조정" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700"><b>{product.name}</b> · 현재 재고 <b>{product.stock}{product.unit}</b>{product.minStock ? ` (안전재고 ${product.minStock}${product.unit})` : ''}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="작업 종류">
          <button type="button" aria-pressed={mode === 'in'} onClick={() => setMode('in')}
            className={`py-2 rounded-xl text-sm font-medium border leading-tight ${mode === 'in' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200'}`}>
            입고<span className="block text-xs font-normal">수량 더하기</span>
          </button>
          <button type="button" aria-pressed={mode === 'set'} onClick={() => setMode('set')}
            className={`py-2 rounded-xl text-sm font-medium border leading-tight ${mode === 'set' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200'}`}>
            실사 조정<span className="block text-xs font-normal">재고 맞추기</span>
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{mode === 'in' ? '입고 수량' : '실제 재고 수량'}</label>
          <input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" aria-label={mode === 'in' ? '입고 수량' : '실제 재고 수량'} autoFocus
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30" />
          <p className="text-xs text-gray-400 mt-1">
            {qty && n === null ? <span className="text-rose-600">숫자만 입력하세요</span> : <>저장 후 재고: <b className={previewStock !== null && previewStock <= product.minStock ? 'text-red-600' : 'text-gray-700'}>{previewStock ?? product.stock}{product.unit}</b></>}
          </p>
        </div>
        {mode === 'in' && (
          <div className="space-y-3 p-3 bg-slate-50 rounded-xl">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={logExpense} onChange={e => setLogExpense(e.target.checked)} />
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">매입일</label>
                    <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} aria-label="매입일" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">지불 수단</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} aria-label="지불 수단" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
                      {methods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">거래처</label>
                    <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="예: OO코스메틱" aria-label="거래처" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  매입 합계 <b className="text-gray-800">{total.toLocaleString()}원</b>
                  {cost !== null && cost > 0 && cost !== product.cost ? ' · 제품 원가도 이 단가로 갱신(기존 재고 마진율도 바뀜)' : ''}
                </p>
              </>
            )}
          </div>
        )}
        {/* 메모는 지출 기록(ExpenseStore)에만 저장된다 — 저장되지 않는 상황(조정·지출 기록 OFF)에서는 입력란 대신 그 사실을 알린다 (UX 점검 2026-11-19) */}
        {mode === 'in' && logExpense ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">메모 (지출 기록에 남음)</label>
            <input value={memo} onChange={e => setMemo(e.target.value)} aria-label="메모" placeholder="예: 11월 정기 발주"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
          </div>
        ) : (
          <p className="text-xs text-gray-500">{mode === 'set' ? '조정 이유는 따로 저장되지 않습니다 — 폐기·분실로 비용이 생기면 매출·손익 > [지출 등록]에 남겨주세요.' : '지출 기록을 끄면 메모도 남지 않습니다.'}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
          <button type="button" onClick={handleSave} className="flex-1 py-2.5 bg-[#1a3a8f] hover:bg-[#15306e] text-white rounded-xl text-sm font-semibold">
            {mode === 'in' ? '입고 저장' : '조정 저장'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
