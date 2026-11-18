import { useMemo, useState } from 'react';
import { ClipboardCheck, Copy, Check, Share2 } from 'lucide-react';
import { canShareText, shareText } from '../lib/mobileBridge';
import { getDailyClose, buildDailyCloseMessage } from '../lib/dailyClose';
import { notify } from '../lib/notify';
import { useFeature } from '../hooks/useFeature';

/**
 * 대시보드 — 오늘 마감 요약 카드 (2026-11-17)
 * 매출(결제수단별)·환불·지출·시술·신규·예약 결과를 한눈에, [복사]/[보내기]로 마감 보고 문구를 바로 보낸다.
 * 매출 모듈이 꺼진 지점(본사 기능관리)에서는 숨긴다.
 */
export default function DailyCloseCard({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const salesOn = useFeature('module.sales');
  const close = useMemo(() => getDailyClose(), [refreshKey]);
  const [copied, setCopied] = useState(false);
  if (!salesOn) return null;
  const text = buildDailyCloseMessage(close);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('복사하지 못했습니다. 문구를 직접 선택해 복사하세요.');
    }
  };

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-slate-50 rounded-lg px-3 py-2 min-w-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
    </div>
  );

  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${compact ? 'p-4' : 'p-5 shadow-sm'}`} data-testid="daily-close-card">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck size={compact ? 16 : 18} className="text-[#1a3a8f]" />
          <p className="text-sm font-bold text-gray-900 truncate">오늘 마감 요약</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" onClick={copy} className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1">
            {copied ? <><Check size={12} />복사됨</> : <><Copy size={12} />복사</>}
          </button>
          {canShareText && (
            <button type="button" onClick={() => shareText(text, '마감 보고')} className="px-2.5 py-1.5 rounded-lg bg-[#1a3a8f] text-white text-xs font-medium flex items-center gap-1">
              <Share2 size={12} />보내기
            </button>
          )}
        </div>
      </div>
      {/* PC 우측 알림 열(약 300px)에서는 4열이 잘려 2열 고정 — 모바일도 2열 (시각 QA 2026-11-17) */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="오늘 매출" value={`${close.revenue.toLocaleString()}원`} />
        <Stat label="결제" value={`${close.paymentCount}건`} />
        <Stat label="시술 · 신규" value={`${close.treatments}건 · ${close.newCustomers}명`} />
        <Stat label="예약 완료/노쇼" value={`${close.reservations.completed} / ${close.reservations.noshow}`} />
      </div>
      {(close.byMethod.length > 0 || close.refunds > 0 || close.expenses > 0) && (
        <p className="text-xs text-gray-500 mt-2 truncate">
          {[
            ...close.byMethod.map(m => `${m.method} ${m.amount.toLocaleString()}원`),
            close.refunds ? `환불(오늘 결제분) ${close.refunds.toLocaleString()}원` : '',
            close.expenses ? `지출 ${close.expenses.toLocaleString()}원` : '',
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}
