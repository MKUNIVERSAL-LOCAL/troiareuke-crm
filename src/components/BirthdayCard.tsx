import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cake, Copy, Check, Share2, X, ChevronRight } from 'lucide-react';
import { canShareText, shareText } from '../lib/mobileBridge';
import { getUpcomingBirthdays, buildBirthdayMessage, BIRTHDAY_WINDOW_DAYS, type BirthdayAlert } from '../lib/birthdayAlerts';
import { notify } from '../lib/notify';

/**
 * 대시보드 — 생일 임박 고객 카드 (2026-11-17)
 * 7일 안에 생일인 고객을 모아 축하/혜택 안내 초안을 복사·공유한다. 항목을 누르면 고객 상세로.
 */
export default function BirthdayCard({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const navigate = useNavigate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo<BirthdayAlert[]>(() => getUpcomingBirthdays(), [refreshKey]);
  const [draftFor, setDraftFor] = useState<BirthdayAlert | null>(null);
  const [copied, setCopied] = useState(false);
  if (list.length === 0) return null;
  const shown = compact ? list.slice(0, 3) : list.slice(0, 8);

  const copyDraft = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('복사하지 못했습니다. 문구를 직접 선택해 복사하세요.');
    }
  };

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
              onClick={() => { setDraftFor(a); setCopied(false); }}
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
        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">{draftFor.customer.name}님 생일 안내 초안</p>
            <button type="button" onClick={() => setDraftFor(null)} aria-label="닫기" className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{buildBirthdayMessage(draftFor)}</pre>
          <p className="text-[10px] text-gray-400 mt-1">(혜택 내용) 자리는 지점 혜택으로 바꿔 보내세요.</p>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => copyDraft(buildBirthdayMessage(draftFor))}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1">
              {copied ? <><Check size={12} />복사됨</> : <><Copy size={12} />복사</>}
            </button>
            {canShareText && (
              <button type="button" onClick={() => shareText(buildBirthdayMessage(draftFor), '생일 축하')}
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
