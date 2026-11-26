import { useMemo, useState } from 'react';
import Modal from './ui/Modal';
import { ProductSaleStore, PaymentStore } from '../lib/store';
import { canceledSaleIds } from '../lib/saleCancel';
import { copyText } from '../lib/clipboard';
import { todayISO } from '../lib/format';
import { notify } from '../lib/notify';
import { reorderSuggestions, reorderListText, DEFAULT_WINDOW_DAYS, DEFAULT_COVER_DAYS, REORDER_CAVEAT, REORDER_EMPTY } from '../lib/reorderRule';
import type { Product } from '../types';

/**
 * 발주 제안 (248, GAP P-5 계열) — "안전재고보다 적다" 에서 멈추던 재고 알림에 **며칠 남았는지·몇 개를 주문할지**를 더한다.
 * 사장이 판매 기록을 뒤져 머리로 계산하던 일이라, 늘 다 떨어진 뒤에 주문하게 됐다.
 *
 * 규칙은 순수 reorderRule(소비 속도·남은 일수·권장 수량). 여기서는 판매·취소 자료를 모아 넘기고 복사만 한다.
 * 공식과 한계를 화면에 그대로 적는다 — 숫자만 주면 매장이 근거를 확인할 수 없다.
 */
export default function ReorderModal({ products, onClose, onReceive }: {
  products: Product[];
  onClose: () => void;
  /** 그 제품의 입고·조정 창을 연다 — 할 일 이름이 "입고" 인데 이 창에서는 입고를 못 하던 것 (리뷰 L-5) */
  onReceive?: (productId: string) => void;
}) {
  const [coverDays, setCoverDays] = useState(DEFAULT_COVER_DAYS);
  const today = todayISO();
  const rows = useMemo(() => {
    const sales = ProductSaleStore.getAll();
    const canceled = canceledSaleIds(PaymentStore.getAll());
    return reorderSuggestions({
      products: products.map(p => ({ id: p.id, name: p.name, unit: p.unit, stock: p.stock, minStock: p.minStock, isActive: p.isActive })),
      sales: sales.map(s => ({ id: s.id, productId: s.productId, quantity: s.quantity, saleDate: s.saleDate })),
      canceledSaleIds: canceled,
      today,
      windowDays: DEFAULT_WINDOW_DAYS,
      coverDays,
    });
  }, [products, coverDays, today]);

  async function handleCopy() {
    const text = reorderListText(rows, today); // 버튼은 제안이 있을 때만 보이므로 빈 글이 올 일은 없다
    const ok = await copyText(text);
    if (ok) notify.success(`발주 목록 ${rows.length}종을 복사했습니다. 거래처에 붙여 보내세요.`);
    else notify('복사하지 못했습니다. 목록을 길게 눌러 직접 복사해주세요.'); // 가짜 성공 금지
  }

  return (
    <Modal isOpen onClose={onClose} title="발주 제안" size="lg">
      <div className="space-y-4" data-testid="reorder">
        <div className="flex flex-wrap items-center gap-2">
          {/* 보이는 글자와 음성 안내가 같아야 한다 — aria-label 로 다른 말을 하면 안 된다 (250 리뷰 L-7) */}
          <label className="text-sm text-gray-700">
            며칠분을 채울지
            <select value={coverDays} onChange={e => setCoverDays(Number(e.target.value))}
              className="ml-2 border border-gray-200 rounded-xl px-2 py-1.5 min-h-[40px] text-sm bg-white outline-none">
              {[14, 30, 45, 60].map(d => <option key={d} value={d}>{d}일분</option>)}
            </select>
          </label>
          <span className="text-xs text-gray-500">최근 {DEFAULT_WINDOW_DAYS}일 판매로 하루 판매량을 계산합니다</span>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-600 py-6 text-center" data-testid="reorder-empty">{REORDER_EMPTY}</p>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
              <ul className="space-y-2">
                {rows.map(r => (
                  <li key={r.id} className="p-3 bg-white border border-gray-100 rounded-xl" data-testid="reorder-row" data-product={r.name}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-gray-900">{r.name}</p>
                      <p className="text-sm font-bold text-[#1a3a8f] whitespace-nowrap">{r.suggestQty}{r.unit} 주문 권장</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{r.reason}</p>
                    {onReceive && (
                      <button type="button" onClick={() => onReceive(r.id)} data-testid="reorder-receive"
                        aria-label={`${r.name} 입고 기록`}
                        className="mt-2 px-3 min-h-[36px] rounded-lg bg-slate-100 text-gray-700 text-xs font-medium hover:bg-slate-200">
                        입고 기록
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-500">{REORDER_CAVEAT}</p>
            <div className="flex gap-2 lg:justify-end">
              <button type="button" onClick={onClose} className="flex-1 lg:flex-none min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">닫기</button>
              <button type="button" onClick={handleCopy} data-testid="reorder-copy"
                className="flex-1 lg:flex-none min-h-[44px] px-5 rounded-xl bg-[#1a3a8f] text-white text-sm font-semibold hover:bg-[#15306e]">
                발주 목록 복사
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
