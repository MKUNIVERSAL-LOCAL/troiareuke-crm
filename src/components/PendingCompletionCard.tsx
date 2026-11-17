import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Check, UserX } from 'lucide-react';
import { getPendingCompletionReservations, settleReservations, bulkCompletableIds, hasPaymentFor, PENDING_LOOKBACK_DAYS } from '../lib/pendingCompletion';
import { formatDate } from '../lib/format';
import { notify } from '../lib/notify';
import type { Reservation } from '../types';

const PAGE_COMPACT = 4;
const PAGE = 8;

/**
 * 대시보드 — 완료 처리 누락 예약 카드 (2026-11-18)
 * 최근 90일 중 지난 날짜의 확정·대기 예약을 모아 보여 주고 건별 [완료]/[노쇼], 확정 건 [모두 완료 처리].
 * 완료 처리해야 방문 통계·재방문 리마인더·직원 실적에 반영된다. 처리 후 onSettled로 대시보드 전체(refreshKey)를 다시 계산한다.
 */
export default function PendingCompletionCard({ compact = false, refreshKey = 0, onSettled }: { compact?: boolean; refreshKey?: number; onSettled?: () => void }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => getPendingCompletionReservations(), [refreshKey]);
  if (list.length === 0) return null;
  const page = compact ? PAGE_COMPACT : PAGE;
  const shown = showAll ? list : list.slice(0, page);
  const confirmedIds = bulkCompletableIds(list);
  const pendingCount = list.length - confirmedIds.length;

  const settle = (ids: string[], status: 'completed' | 'noshow') => {
    const n = settleReservations(ids, status);
    notify(status === 'completed' ? `${n}건을 완료 처리했습니다.` : `${n}건을 노쇼로 처리했습니다.`);
    onSettled?.();
  };
  // 건별 완료 — 예약 화면의 완료 처리처럼 결제 미등록이면 매출 등록으로 바로 잇는다(예약 id를 referenceId로 연결해 중복 등록 방지)
  const settleOneAndPay = (r: Reservation) => {
    settle([r.id], 'completed');
    if (r.totalPrice > 0 && !hasPaymentFor(r.id)) {
      if (window.confirm(`완료 처리했습니다. 이 예약의 결제 ${r.totalPrice.toLocaleString()}원을 지금 매출에 등록할까요?`)) {
        navigate(`/sales?new=1&customer=${encodeURIComponent(r.customerId)}&amount=${r.totalPrice}&memo=${encodeURIComponent('예약 완료 처리(대시보드)')}&reference=${encodeURIComponent(r.id)}`);
      }
    }
  };
  const settleAll = () => {
    if (confirmedIds.length === 0) return;
    const extra = pendingCount > 0 ? `\n대기 상태 ${pendingCount}건은 왔는지 알 수 없어 그대로 둡니다 — 건별로 처리해주세요.` : '';
    if (!window.confirm(`확정 예약 ${confirmedIds.length}건을 모두 완료 처리할까요?\n오지 않은 고객이 있으면 먼저 건별로 [노쇼]를 눌러 주세요.${extra}`)) return;
    settle(confirmedIds, 'completed');
  };

  return (
    <div className={`bg-white rounded-xl border border-amber-200 ${compact ? 'p-4' : 'p-5 shadow-sm'}`} data-testid="pending-completion-card">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck size={16} className="text-amber-600 flex-shrink-0" />
          <h3 className="text-sm font-bold text-gray-900 truncate">완료 처리 안 된 지난 예약</h3>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 whitespace-nowrap" data-testid="pending-completion-count">{list.length}건</span>
        </div>
        {confirmedIds.length > 0 && (
          <button type="button" onClick={settleAll}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700">
            <Check size={12} />확정 {confirmedIds.length}건 완료 처리
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        최근 {PENDING_LOOKBACK_DAYS}일 기준. 완료 처리해야 방문 횟수·마지막 방문일·재방문 리마인더·직원 실적에 반영됩니다. 오지 않은 고객은 [노쇼]로 남겨 주세요.
        건별 [완료]는 결제가 없으면 매출 등록으로 이어지고, 일괄 완료는 상태만 바꿉니다(결제는 매출 화면에서).
      </p>
      <ul className="divide-y divide-gray-50">
        {shown.map(r => (
          <li key={r.id} className="flex items-center gap-2 py-2">
            <button type="button" onClick={() => navigate(`/reservations?open=${r.id}`)} className="flex-1 min-w-0 text-left" title="예약 상세 열기">
              <p className="text-sm font-medium text-gray-800 truncate">
                {r.customerName} <span className="text-xs text-gray-400">· {formatDate(r.date)} {r.startTime}</span>
                {r.status === 'pending' && <span className="ml-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1 py-0.5 align-middle">대기</span>}
              </p>
              <p className="text-xs text-gray-500 truncate">{r.services.map(s => s.serviceName).join(', ') || '시술 항목 미지정'}{r.staffName ? ` · ${r.staffName}` : ''}</p>
            </button>
            <button type="button" onClick={() => settleOneAndPay(r)} aria-label={`${r.customerName} ${formatDate(r.date)} 완료`}
              className="px-2 py-1 rounded-lg text-[11px] font-medium bg-green-50 text-green-700 hover:bg-green-100 whitespace-nowrap">완료</button>
            <button type="button" onClick={() => settle([r.id], 'noshow')} aria-label={`${r.customerName} ${formatDate(r.date)} 노쇼`}
              className="px-2 py-1 rounded-lg text-[11px] font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 whitespace-nowrap flex items-center gap-0.5"><UserX size={11} />노쇼</button>
          </li>
        ))}
      </ul>
      {list.length > page && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 w-full text-xs font-medium text-[#1a3a8f] py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100">
          {showAll ? '접기' : `더 보기 (${list.length - page}건 남음)`}
        </button>
      )}
    </div>
  );
}
