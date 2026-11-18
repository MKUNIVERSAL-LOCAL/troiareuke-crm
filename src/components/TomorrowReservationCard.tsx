import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Copy, Check, ChevronRight } from 'lucide-react';
import MessageDraftPanel from './ui/MessageDraftPanel';
import { getTomorrowReservations, buildReservationMessage, tomorrowISO } from '../lib/reservationReminder';
import { maskPhone } from '../lib/masking';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notify';
import type { Reservation } from '../types';

/**
 * 대시보드 — 내일 예약 안내 카드 (노쇼 방지, 2026-11-17)
 * 내일 예약을 모아 고객별 안내 문구 초안을 복사·공유한다(발송사 연동 전 수동 경로). 항목을 누르면 예약 상세로.
 */
export default function TomorrowReservationCard({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const list = useMemo<Reservation[]>(() => getTomorrowReservations(), [refreshKey]);
  const [draftFor, setDraftFor] = useState<Reservation | null>(null);
  const [copiedAll, setCopiedAll] = useState(false); // 헤더 [전체 복사] 피드백 (개별 초안은 MessageDraftPanel이 담당)
  if (list.length === 0) return null;
  const shown = compact ? list.slice(0, 4) : list.slice(0, 10);

  const allText = list.map(buildReservationMessage).join('\n\n— — —\n\n');
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(allText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      notify('복사하지 못했습니다. 문구를 직접 선택해 복사하세요.');
    }
  };


  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${compact ? 'p-4' : 'p-5 shadow-sm'}`} data-testid="tomorrow-reservation-card">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock size={compact ? 16 : 18} className="text-[#1a3a8f]" />
          <p className="text-sm font-bold text-gray-900 truncate">내일 예약 안내</p>
          <span className="text-xs text-gray-400 flex-shrink-0">{tomorrowISO().slice(5).replace('-', '/')} · {list.length}건</span>
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="flex-shrink-0 text-xs font-medium text-[#1a3a8f] flex items-center gap-1"
          title="내일 예약 안내 문구를 한 번에 복사"
        >
          {copiedAll ? <><Check size={12} />복사됨</> : <><Copy size={12} />전체 복사</>}
        </button>
      </div>
      <ul className="divide-y divide-gray-50">
        {shown.map(r => (
          <li key={r.id} className="py-2 flex items-center gap-3">
            <span className="text-sm font-bold text-[#1a3a8f] w-12 flex-shrink-0">{r.startTime}</span>
            <button
              type="button"
              onClick={() => navigate(`/reservations?open=${r.id}`)}
              className="flex-1 min-w-0 text-left"
              aria-label={`${r.customerName} 예약 보기`}
            >
              <p className="text-sm font-medium text-gray-800 truncate">{r.customerName}</p>
              <p className="text-xs text-gray-400 truncate">
                {r.services.map(s => s.serviceName).join(', ') || '시술 미지정'}{r.staffName ? ` · ${r.staffName}` : ''} · {maskPhone(r.customerPhone, user?.role ?? 'staff')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDraftFor(r)}
              aria-label={`${r.customerName} 예약 안내`}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-[#1a3a8f]/10 text-[#1a3a8f] text-xs font-medium hover:bg-[#1a3a8f]/20"
            >
              안내
            </button>
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </li>
        ))}
      </ul>
      {list.length > shown.length && <p className="text-xs text-gray-400 mt-2">외 {list.length - shown.length}건 — 예약 관리에서 확인</p>}

      {draftFor && (
        <MessageDraftPanel
          key={draftFor.id}
          title={`${draftFor.customerName}님 예약 안내 초안`}
          text={buildReservationMessage(draftFor)}
          shareTitle="예약 안내"
          onClose={() => setDraftFor(null)}
        />
      )}
    </div>
  );
}
