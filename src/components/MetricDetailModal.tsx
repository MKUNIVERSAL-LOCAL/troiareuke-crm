import Modal from './ui/Modal';
import { formatPrice } from '../lib/format';
import type { DrillResult } from '../lib/revenueDrilldownRule';

/**
 * 매출 지표 근거 목록 (260, GAP P-6) — 카드의 숫자를 만든 **그 줄들**을 보여 준다.
 *
 * 147 은 지표 10개를 숫자로만 보여 줘서, 매장이 "신규 고객 매출 320만" 을 확인할 길이 없었다.
 * 합계는 규칙(revenueDrilldownRule)이 카드와 같은 정의로 계산하므로 카드 숫자와 같아야 한다 —
 * 줄을 잘랐을 때는 "합계는 전체 기준" 이라고 밝힌다(보이는 줄만 더해 보면 다르기 때문).
 */
export default function MetricDetailModal({ title, note, result, onClose }: {
  title: string;
  note: string;
  result: DrillResult;
  onClose: () => void;
}) {
  const { rows, total, truncatedFrom, caveat, empty } = result;
  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      <div className="space-y-3" data-testid="metric-detail">
        <p className="text-sm text-gray-700">{note}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-600 py-6 text-center" data-testid="metric-detail-empty">{empty}</p>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
              <ul className="divide-y divide-gray-50">
                {rows.map(r => (
                  <li key={r.key} className="py-2.5 flex items-start justify-between gap-3" data-testid="metric-detail-row">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{r.label}</span>
                      <span className="block text-xs text-gray-500 break-keep">{r.detail}</span>
                    </span>
                    <span className="text-sm font-bold text-gray-900 whitespace-nowrap tabular-nums">{formatPrice(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-600">
                합계{truncatedFrom ? ` (전체 ${truncatedFrom}줄 기준)` : ` (${rows.length}줄)`}
              </span>
              <span className="text-base font-bold text-[#1a3a8f] tabular-nums" data-testid="metric-detail-total">{formatPrice(total)}</span>
            </div>
            {truncatedFrom && (
              <p className="text-xs text-amber-800 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                줄이 많아 금액이 큰 {rows.length}줄만 보여 줍니다. 위 합계는 전체 {truncatedFrom}줄 기준입니다.
              </p>
            )}
          </>
        )}
        {caveat && <p className="text-xs text-gray-500">{caveat}</p>}
        <div className="flex lg:justify-end">
          <button type="button" onClick={onClose} className="w-full lg:w-auto min-h-[44px] px-5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">닫기</button>
        </div>
      </div>
    </Modal>
  );
}
