import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, ChevronRight } from 'lucide-react';
import { getProgramAlerts, buildProgramMessage, REASON_LABEL, type ProgramAlert } from '../lib/programAlerts';
import MessageDraftPanel from './ui/MessageDraftPanel';

/**
 * 대시보드 — 회차권 소진·만료 임박 카드 (2026-11-17)
 * 잔여 1회 이하 / 만료 14일 이내 프로그램을 모아 재구매 안내 초안을 복사·공유한다. 항목을 누르면 고객 상세로.
 */
export default function ProgramAlertCard({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const navigate = useNavigate();
  // 대시보드 포커스/가시성 복귀(refreshKey)마다 다시 계산 — 모바일·PC 블록이 함께 마운트돼도 비용은 호출 2회
  const alerts = useMemo<ProgramAlert[]>(() => getProgramAlerts(), [refreshKey]);
  const [draftFor, setDraftFor] = useState<ProgramAlert | null>(null);
  if (alerts.length === 0) return null;
  const list = compact ? alerts.slice(0, 3) : alerts.slice(0, 8);

  const badgeCls: Record<ProgramAlert['reason'], string> = {
    exhausted: 'bg-rose-100 text-rose-700',
    expired: 'bg-rose-100 text-rose-700',
    low: 'bg-amber-100 text-amber-700',
    expiring: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${compact ? 'p-4' : 'p-5 shadow-sm'}`} data-testid="program-alert-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Ticket size={compact ? 16 : 18} className="text-[#1a3a8f]" />
          <p className="text-sm font-bold text-gray-900">회차권 소진·만료 임박</p>
          <span className="text-xs text-gray-400">{alerts.length}건</span>
        </div>
      </div>
      <ul className="divide-y divide-gray-50">
        {list.map(a => (
          <li key={a.program.id} className="py-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/customers?open=${a.customer.id}`)}
              className="flex-1 min-w-0 text-left"
              aria-label={`${a.customer.name} 고객 보기`}
            >
              <p className="text-sm font-medium text-gray-800 truncate">
                {a.customer.name}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-2xs font-semibold ${badgeCls[a.reason]}`}>
                  {a.reason === 'expiring' && a.daysToExpiry !== null ? `만료 D-${a.daysToExpiry}` : REASON_LABEL[a.reason]}
                </span>
              </p>
              <p className="text-xs text-slate-600 truncate">
                {a.program.programName}{a.remaining !== null ? ` · 잔여 ${a.remaining}회` : ''}{a.program.expiryDate ? ` · 만료 ${a.program.expiryDate}` : ''}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDraftFor(a)}
              aria-label={`${a.customer.name} 재구매 안내`}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-[#1a3a8f]/10 text-[#1a3a8f] text-xs font-medium hover:bg-[#1a3a8f]/20"
            >
              재구매 안내
            </button>
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </li>
        ))}
      </ul>
      {alerts.length > list.length && (
        <p className="text-xs text-gray-400 mt-2">외 {alerts.length - list.length}건</p>
      )}

      {draftFor && (
        <MessageDraftPanel
          key={draftFor.program.id}
          title={`${draftFor.customer.name}님 재구매 안내 초안`}
          text={buildProgramMessage(draftFor)}
          shareTitle="재구매 안내"
          onClose={() => setDraftFor(null)}
        />
      )}
    </div>
  );
}
