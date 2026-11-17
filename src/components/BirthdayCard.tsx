import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cake, ChevronRight } from 'lucide-react';
import { getUpcomingBirthdays, buildBirthdayMessage, BIRTHDAY_WINDOW_DAYS, type BirthdayAlert } from '../lib/birthdayAlerts';
import MessageDraftPanel from './ui/MessageDraftPanel';

/**
 * 대시보드 — 생일 임박 고객 카드 (2026-11-17)
 * 7일 안에 생일인 고객을 모아 축하/혜택 안내 초안을 복사·공유한다. 항목을 누르면 고객 상세로.
 */
export default function BirthdayCard({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const navigate = useNavigate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo<BirthdayAlert[]>(() => getUpcomingBirthdays(), [refreshKey]);
  const [draftFor, setDraftFor] = useState<BirthdayAlert | null>(null);
  if (list.length === 0) return null;
  const shown = compact ? list.slice(0, 3) : list.slice(0, 8);

  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${compact ? 'p-4' : 'p-5 shadow-sm'}`} data-testid="birthday-card">
      <div className="flex items-center gap-2 mb-3">
        <Cake size={compact ? 16 : 18} className="text-pink-500" />
        <p className="text-sm font-bold text-gray-900">생일 고객</p>
        <span className="text-xs text-gray-400">{BIRTHDAY_WINDOW_DAYS}일 이내 {list.length}명</span>
      </div>
      <ul className="divide-y divide-gray-50">
        {shown.map(a => (
          <li key={a.customer.id} className="py-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/customers?open=${a.customer.id}`)}
              className="flex-1 min-w-0 text-left"
              aria-label={`${a.customer.name} 고객 보기`}
            >
              <p className="text-sm font-medium text-gray-800 truncate">
                {a.customer.name}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${a.daysUntil === 0 ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-600'}`}>
                  {a.daysUntil === 0 ? '오늘' : `D-${a.daysUntil}`}
                </span>
              </p>
              <p className="text-[11px] text-gray-400 truncate">생일 {a.dateLabel}{a.customer.grade ? ` · ${a.customer.grade}` : ''}</p>
            </button>
            <button
              type="button"
              onClick={() => setDraftFor(a)}
              aria-label={`${a.customer.name} 생일 안내`}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-pink-50 text-pink-700 text-xs font-medium hover:bg-pink-100"
            >
              축하 안내
            </button>
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </li>
        ))}
      </ul>
      {list.length > shown.length && <p className="text-[11px] text-gray-400 mt-2">외 {list.length - shown.length}명 — 문자/카카오 발송의 생일 고객 대상에서 전체 확인</p>}

      {draftFor && (
        <MessageDraftPanel
          key={draftFor.customer.id}
          title={`${draftFor.customer.name}님 생일 안내 초안`}
          text={buildBirthdayMessage(draftFor)}
          shareTitle="생일 축하"
          hint="(혜택 내용) 자리는 지점 혜택으로 바꿔 보내세요."
          onClose={() => setDraftFor(null)}
        />
      )}
    </div>
  );
}
