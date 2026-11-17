import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, Copy, Check, Share2, X, ChevronRight } from 'lucide-react';
import { canShareText, shareText } from '../lib/mobileBridge';
import { getProgramAlerts, buildProgramMessage, REASON_LABEL, type ProgramAlert } from '../lib/programAlerts';
import { notify } from '../lib/notify';

/**
 * 대시보드 — 회차권 소진·만료 임박 카드 (2026-11-17)
 * 잔여 1회 이하 / 만료 14일 이내 프로그램을 모아 재구매 안내 초안을 복사·공유한다. 항목을 누르면 고객 상세로.
 */
export default function ProgramAlertCard({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const navigate = useNavigate();
  // 대시보드 포커스/가시성 복귀(refreshKey)마다 다시 계산 — 모바일·PC 블록이 함께 마운트돼도 비용은 호출 2회
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alerts = useMemo<ProgramAlert[]>(() => getProgramAlerts(), [refreshKey]);
  const [draftFor, setDraftFor] = useState<ProgramAlert | null>(null);
  const [copied, setCopied] = useState(false);
  if (alerts.length === 0) return null;
  const list = compact ? alerts.slice(0, 3) : alerts.slice(0, 8);

  const copyDraft = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('복사하지 못했습니다. 문구를 직접 선택해 복사하세요.');
    }
  };

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
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeCls[a.reason]}`}>
                  {a.reason === 'expiring' && a.daysToExpiry !== null ? `만료 D-${a.daysToExpiry}` : REASON_LABEL[a.reason]}
                </span>
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {a.program.programName}{a.remaining !== null ? ` · 잔여 ${a.remaining}회` : ''}{a.program.expiryDate ? ` · 만료 ${a.program.expiryDate}` : ''}
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setDraftFor(a); setCopied(false); }}
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
        <p className="text-[11px] text-gray-400 mt-2">외 {alerts.length - list.length}건</p>
      )}

      {draftFor && (
        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">{draftFor.customer.name}님 재구매 안내 초안</p>
            <button type="button" onClick={() => setDraftFor(null)} aria-label="닫기" className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{buildProgramMessage(draftFor)}</pre>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => copyDraft(buildProgramMessage(draftFor))}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1">
              {copied ? <><Check size={12} />복사됨</> : <><Copy size={12} />복사</>}
            </button>
            {canShareText && (
              <button type="button" onClick={() => shareText(buildProgramMessage(draftFor), '재구매 안내')}
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
