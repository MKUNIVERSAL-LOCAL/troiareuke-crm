// StockLedgerModal — 제품 하나의 재고 이동 이력 + 원장/현재 재고 대조 (비코어, 145, GAP P-5)
import { useState } from 'react';
import Modal from './ui/Modal';
import { ProductStore } from '../lib/store';
import { formatPrice } from '../lib/format';
import { notify } from '../lib/notify';
import { allStockEntries, recordStockMovement } from '../lib/stockLedger';
import { entriesOf, reconcile, summarize, STOCK_KIND_LABEL } from '../lib/stockLedgerRule';
import type { Product } from '../types';

function fmtAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function StockLedgerModal({ product, actor, onClose, onChanged }: { product: Product; actor?: string; onClose: () => void; onChanged: () => void }) {
  const [tick, setTick] = useState(0);
  const fresh = ProductStore.getById(product.id) ?? product;
  const all = allStockEntries();
  const rows = entriesOf(all, product.id);
  const rec = reconcile(all, product.id, fresh.stock);
  const sum = summarize(all, product.id);
  const unit = product.unit || '개';

  // 원장을 현재 재고에 맞춘다 — 기록 없는 이동(다른 기기의 판매·옛 데이터)을 조정 행으로 남긴다. 재고 쪽을 바꾸지 않는다(다른 기기의 판매를 되돌리게 됨)
  const alignLedger = () => {
    if (rec.diff === 0) return;
    recordStockMovement({ product: { id: product.id, stock: rec.ledger }, kind: 'adjust', qty: rec.diff, note: '현재 재고에 맞춤 — 기록 없는 이동(다른 기기·옛 데이터)', actor });
    notify.success(`원장에 ${rec.diff > 0 ? '+' : ''}${rec.diff}${unit} 조정을 기록해 현재 재고 ${fresh.stock}${unit}과 맞췄습니다.`);
    setTick(tick + 1);
    onChanged();
  };

  return (
    <Modal isOpen onClose={onClose} title="재고 이동 이력" size="md">
      <div className="space-y-4" data-testid="stock-ledger">
        <p className="text-sm text-gray-700"><b>{product.name}</b> · 현재 재고 <b>{fresh.stock}{unit}</b></p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="bg-blue-50 rounded-xl p-2"><p className="text-xs text-blue-700">입고</p><p className="text-sm font-bold text-blue-800">{sum.received}{unit}</p>{sum.receivedCost > 0 && <p className="text-2xs text-blue-700">{formatPrice(sum.receivedCost)}</p>}</div>
          <div className="bg-pink-50 rounded-xl p-2"><p className="text-xs text-pink-700">판매</p><p className="text-sm font-bold text-pink-800">{sum.sold}{unit}</p></div>
          <div className="bg-green-50 rounded-xl p-2"><p className="text-xs text-green-700">판매 취소</p><p className="text-sm font-bold text-green-800">{sum.canceled}{unit}</p></div>
          <div className="bg-amber-50 rounded-xl p-2"><p className="text-xs text-amber-700">실사·조정</p><p className="text-sm font-bold text-amber-800">{sum.adjusted > 0 ? '+' : ''}{sum.adjusted}{unit}</p></div>
        </div>
        <div className={`rounded-xl px-3 py-2 text-sm flex items-center justify-between gap-2 ${rec.diff === 0 ? 'bg-gray-50 text-gray-700' : 'bg-amber-50 text-amber-800'}`} data-testid="stock-reconcile">
          <span>원장 합계 <b>{rec.ledger}{unit}</b> · 현재 재고 <b>{rec.current}{unit}</b>{rec.diff === 0 ? ' · 일치' : ` · 차이 ${rec.diff > 0 ? '+' : ''}${rec.diff}${unit}`}</span>
          {rec.diff !== 0 && rows.length > 0 && (
            <button type="button" onClick={alignLedger} className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a3a8f] rounded-lg hover:bg-[#15306e] whitespace-nowrap" title="기록 없는 이동을 조정 행으로 남겨 원장을 현재 재고에 맞춥니다(재고 숫자는 바꾸지 않음)">차이를 조정으로 기록</button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">아직 기록된 이동이 없습니다. 입고·판매·실사 조정을 하면 여기에 한 줄씩 남습니다.</p>
        ) : (
          <div className="overflow-auto max-h-[50vh] rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-xs text-gray-500">
                  <th className="text-left px-3 py-2 font-semibold">일시</th>
                  <th className="text-left px-2 py-2 font-semibold">구분</th>
                  <th className="text-right px-2 py-2 font-semibold">수량</th>
                  <th className="text-right px-2 py-2 font-semibold">재고</th>
                  <th className="text-left px-3 py-2 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(e => (
                  <tr key={e.id} data-testid="stock-entry" className="border-t border-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{fmtAt(e.at)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{STOCK_KIND_LABEL[e.kind]}</td>
                    <td className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${e.qty < 0 ? 'text-pink-700' : e.qty > 0 ? 'text-blue-700' : 'text-gray-500'}`}>{e.qty > 0 ? '+' : ''}{e.qty}{unit}</td>
                    <td className="px-2 py-2 text-right text-gray-700 whitespace-nowrap">{e.resultStock}{unit}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{[e.unitCost ? `단가 ${formatPrice(e.unitCost)}` : '', e.note, e.actor].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-2xs text-gray-400">이 기기에서 기록한 이동입니다. 다른 기기의 판매·입고는 서버 원장(승인 대기)이 열리면 합쳐집니다 — 그 전에는 "차이를 조정으로 기록"으로 맞춥니다.</p>
      </div>
    </Modal>
  );
}
