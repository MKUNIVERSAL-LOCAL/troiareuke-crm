import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Scissors, Sparkles, Package, CreditCard, History } from 'lucide-react';
import { buildCustomerTimeline, TIMELINE_KIND_LABEL, type TimelineKind } from '../lib/customerTimeline';
import { formatPrice, formatDate } from '../lib/format';

const PAGE = 12;

const KIND_STYLE: Record<TimelineKind, { icon: typeof CalendarDays; dot: string }> = {
  reservation: { icon: CalendarDays, dot: 'bg-sky-500' },
  treatment: { icon: Scissors, dot: 'bg-green-500' },
  consult: { icon: Sparkles, dot: 'bg-indigo-500' },
  program: { icon: Package, dot: 'bg-[#1a3a8f]' },
  payment: { icon: CreditCard, dot: 'bg-amber-500' },
};

/**
 * 고객 활동 타임라인 (2026-11-18) — 예약·시술·상담·프로그램·결제를 최신순 한 줄기로. PC·모바일 공용(compact는 모바일).
 * 종류 칩으로 걸러 볼 수 있고, 12건씩 더 보기. tick이 바뀌면 다시 계산(상세에서 기록 추가·수정 후).
 */
export default function CustomerTimeline({ customerId, compact = false, tick = 0 }: { customerId: string; compact?: boolean; tick?: number }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TimelineKind | 'all'>('all');
  const [limit, setLimit] = useState(PAGE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => buildCustomerTimeline(customerId), [customerId, tick]);
  const items = filter === 'all' ? all : all.filter(i => i.kind === filter);
  const shown = items.slice(0, limit);
  const kindsPresent = (Object.keys(TIMELINE_KIND_LABEL) as TimelineKind[]).filter(k => all.some(i => i.kind === k));

  return (
    <div className={compact ? 'bg-white rounded-xl border border-gray-100 p-4' : 'bg-white rounded-2xl border border-gray-100 p-6'} data-testid="customer-timeline">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className={`font-bold text-gray-900 flex items-center gap-1.5 ${compact ? 'text-xs font-semibold text-gray-500 uppercase' : ''}`}>
          <History size={compact ? 12 : 16} className="text-gray-400" />활동 타임라인
          <span className="text-xs font-normal text-gray-400">{all.length}건</span>
        </h3>
      </div>
      {kindsPresent.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 mb-1" role="tablist" aria-label="타임라인 종류">
          {(['all', ...kindsPresent] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={filter === k}
              onClick={() => { setFilter(k); setLimit(PAGE); }}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border ${filter === k ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {k === 'all' ? '전체' : TIMELINE_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <p className={`text-gray-400 text-center py-4 ${compact ? 'text-xs' : 'text-sm'}`}>아직 활동 기록이 없어요</p>
      ) : (
        <ol className="relative ml-2 border-l border-gray-200">
          {shown.map(item => {
            const { icon: Icon, dot } = KIND_STYLE[item.kind];
            const inner = (
              <>
                <span className={`absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full ring-2 ring-white ${dot}`} aria-hidden="true" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Icon size={11} aria-hidden="true" />{TIMELINE_KIND_LABEL[item.kind]} · {formatDate(item.date)}
                    </p>
                    <p className={`text-sm font-medium truncate ${item.tone === 'bad' ? 'text-rose-600' : item.tone === 'muted' ? 'text-gray-500' : 'text-gray-800'}`}>{item.title}</p>
                    {item.detail && <p className="text-xs text-gray-500 line-clamp-2">{item.detail}</p>}
                  </div>
                  {item.amount !== undefined && (
                    <p className={`text-sm font-semibold whitespace-nowrap ${item.amount < 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                      {item.amount < 0 ? `-${formatPrice(-item.amount)}` : formatPrice(item.amount)}
                    </p>
                  )}
                </div>
              </>
            );
            const cls = 'relative pl-4 py-2';
            return (
              <li key={item.id} className={cls}>
                {item.href ? (
                  <button type="button" onClick={() => navigate(item.href!)} className="w-full text-left rounded-lg hover:bg-gray-50 -mx-1 px-1" title="기록 열기">
                    {inner}
                  </button>
                ) : inner}
              </li>
            );
          })}
        </ol>
      )}
      {items.length > shown.length && (
        <button type="button" onClick={() => setLimit(l => l + PAGE)} className="mt-2 w-full py-2 text-xs font-medium text-[#1a3a8f] bg-slate-50 rounded-lg hover:bg-slate-100">
          더 보기 ({items.length - shown.length}건 남음)
        </button>
      )}
    </div>
  );
}
