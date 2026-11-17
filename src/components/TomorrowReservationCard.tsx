import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Copy, Check, Share2, X, ChevronRight } from 'lucide-react';
import { canShareText, shareText } from '../lib/mobileBridge';
import { getTomorrowReservations, buildReservationMessage, tomorrowISO } from '../lib/reservationReminder';
import { maskPhone } from '../lib/masking';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notify';
import type { Reservation } from '../types';

/**
 * 대시보드 — 내일 예약 안내 카드 (노쇼 방지, 2026-11-17)
 * 내일 예약을 모아 고객별 안내 문구 초안을 복사·공유한다(발송사 연동 전 수동 경로). 항목을 누르면 예약 상세로.
 */
export default function TomorrowReservationCard({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list] = useState<Reservation[]>(() => getTomorrowReservations());
  const [draftFor, setDraftFor] = useState<Reservation | null>(null);
  const [copied, setCopied] = useState(false);
  if (list.length === 0) return null;
  const shown = compact ? list.slice(0, 4) : list.slice(0, 10);

  const copyDraft = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('복사하지 못했습니다. 문구를 직접 선택해 복사하세요.');
    }
  };

  const allText = list.map(buildReservationMessage).join('\n\n— — —\n\n');

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
          onClick={() => copyDraft(allText)}
          className="flex-shrink-0 text-xs font-medium text-[#1a3a8f] flex items-center gap-1"
          title="내일 예약 안내 문구를 한 번에 복사"
        >
          {copied && !draftFor ? <><Check size={12} />복사됨</> : <><Copy size={12} />전체 복사</>}
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
              <p className="text-[11px] text-gray-400 truncate">
                {r.services.map(s => s.serviceName).join(', ') || '시술 미지정'}{r.staffName ? ` · ${r.staffName}` : ''} · {maskPhone(r.customerPhone, user?.role ?? 'staff')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setDraftFor(r); setCopied(false); }}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-[#1a3a8f]/10 text-[#1a3a8f] text-xs font-medium hover:bg-[#1a3a8f]/20"
            >
              안내
            </button>
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </li>
        ))}
      </ul>
      {list.length > shown.length && <p className="text-[11px] text-gray-400 mt-2">외 {list.length - shown.length}건 — 예약 관리에서 확인</p>}

      {draftFor && (
        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">{draftFor.customerName}님 예약 안내 초안</p>
            <button type="button" onClick={() => setDraftFor(null)} aria-label="닫기" className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{buildReservationMessage(draftFor)}</pre>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => copyDraft(buildReservationMessage(draftFor))}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1">
              {copied ? <><Check size={12} />복사됨</> : <><Copy size={12} />복사</>}
            </button>
            {canShareText && (
              <button type="button" onClick={() => shareText(buildReservationMessage(draftFor), '예약 안내')}
                className="px-3 py-1.5 rounded-lg bg-[#1a3a8f] text-white text-xs font-medium flex items-center gap-1">
                <Share2 size={12} />보내기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
