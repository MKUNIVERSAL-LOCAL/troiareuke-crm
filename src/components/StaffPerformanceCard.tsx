import { useMemo, useState } from 'react';
import { BarChart3, ClipboardList } from 'lucide-react';
import { getStaffMonthReport, recentMonths, buildStaffReportMessage } from '../lib/staffPerformance';
import { formatPrice } from '../lib/format';
import MessageDraftPanel from './ui/MessageDraftPanel';

/**
 * 직원별 월 실적 표 (2026-11-18) — 직원 화면. 달 선택(이달~6개월 전), 완료 예약·예약액·시술·제품 판매·응대 고객,
 * 오너 보고용 문구 복사/공유. tick이 바뀌면 다시 집계(직원 추가·수정 후).
 */
export default function StaffPerformanceCard({ tick = 0 }: { tick?: number }) {
  const months = useMemo(() => recentMonths(6), []);
  const [yearMonth, setYearMonth] = useState(months[0]);
  const [draft, setDraft] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const report = useMemo(() => getStaffMonthReport(yearMonth), [yearMonth, tick]);
  const u = report.unassigned;
  const hasUnassigned = u.reservations + u.treatments + u.productSales > 0;
  const label = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;

  return (
    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" data-testid="staff-performance">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><BarChart3 size={15} className="text-[#1a3a8f]" />직원별 월 실적</h3>
        <div className="flex items-center gap-2">
          <select value={yearMonth} onChange={e => { setYearMonth(e.target.value); setDraft(null); }} aria-label="실적 월"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            {months.map(m => <option key={m} value={m}>{label(m)}</option>)}
          </select>
          <button type="button" onClick={() => setDraft(d => d ? null : buildStaffReportMessage(report))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-gray-700 hover:bg-slate-200">
            <ClipboardList size={12} />보고 문구
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 border-b border-gray-50">
              <th className="text-left font-medium px-4 sm:px-6 py-2">직원</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">완료 예약</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">예약액</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">시술</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">제품 판매</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">응대 고객</th>
              <th className="text-right font-medium px-4 sm:px-6 py-2 whitespace-nowrap">예정</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-6 text-center text-xs text-gray-400">직원이 없어요</td></tr>
            )}
            {report.rows.map(r => (
              <tr key={r.staffId} className="border-b border-gray-50 last:border-0">
                <td className="px-4 sm:px-6 py-2.5">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} aria-hidden="true" />
                    <span className={`font-medium ${r.isActive ? 'text-gray-800' : 'text-gray-400'}`}>{r.name}{!r.isActive && ' (퇴사)'}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.completedReservations}건</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{formatPrice(r.reservationAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.treatments}건</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPrice(r.productAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.customers}명</td>
                <td className="px-4 sm:px-6 py-2.5 text-right tabular-nums text-gray-500">{r.upcomingReservations}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 sm:px-6 py-3 border-t border-gray-50 space-y-2">
        <p className="text-[11px] text-gray-400">
          완료 예약의 예약액과 담당 직원이 기록된 제품 판매액 기준 — 실제 입금액(결제 화면)과 다를 수 있습니다. 취소·노쇼 제외.
          {hasUnassigned && ` 담당 미지정·퇴사 직원 기록 ${u.reservations + u.treatments + u.productSales}건은 표에 포함되지 않았습니다.`}
        </p>
        {draft && (
          <MessageDraftPanel title={`${label(yearMonth)} 직원별 실적 보고`} text={draft} shareTitle="직원별 실적" onClose={() => setDraft(null)} />
        )}
      </div>
    </div>
  );
}
