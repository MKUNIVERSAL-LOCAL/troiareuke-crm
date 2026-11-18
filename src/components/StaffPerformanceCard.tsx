import { useMemo, useState } from 'react';
import { BarChart3, ClipboardList } from 'lucide-react';
import { getStaffMonthReport, recentMonths, buildStaffReportMessage, staffReportCaveats } from '../lib/staffPerformance';
import { formatPrice } from '../lib/format';
import MessageDraftPanel from './ui/MessageDraftPanel';

/**
 * 직원별 월 실적 표 (2026-11-18) — 직원 화면. 달 선택(이달~6개월 전), 완료 건수·완료 예약액·시술·제품 판매·응대 고객·남은 일정,
 * 오너 보고용 문구 복사/공유. tick이 바뀌면 다시 집계(직원 추가·수정 후). 직원 카드의 "월 예약액(예정 포함)"과 달리 완료 처리분만.
 */
export default function StaffPerformanceCard({ tick = 0 }: { tick?: number }) {
  const months = useMemo(() => recentMonths(6), []);
  const [yearMonth, setYearMonth] = useState(months[0]);
  const [draftOpen, setDraftOpen] = useState(false);
  const report = useMemo(() => getStaffMonthReport(yearMonth), [yearMonth, tick]);
  const draft = useMemo(() => (draftOpen ? buildStaffReportMessage(report) : null), [draftOpen, report]);
  const caveats = staffReportCaveats(report);
  const label = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
  const th = 'text-right font-medium px-3 py-2 whitespace-nowrap';
  const td = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap';

  return (
    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" data-testid="staff-performance">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <h3 id="staff-perf-title" className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><BarChart3 size={15} className="text-[#1a3a8f]" />직원별 월 실적</h3>
        <div className="flex items-center gap-2">
          <select value={yearMonth} onChange={e => { setYearMonth(e.target.value); setDraftOpen(false); }} aria-label="실적 월"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            {months.map(m => <option key={m} value={m}>{label(m)}</option>)}
          </select>
          <button type="button" onClick={() => setDraftOpen(o => !o)} aria-expanded={draftOpen}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-gray-700 hover:bg-slate-200">
            <ClipboardList size={12} />보고 문구
          </button>
        </div>
      </div>
      <p id="staff-perf-scroll-hint" className="sm:hidden px-4 pt-2 text-xs text-gray-400">표를 옆으로 밀면 응대 고객·남은 일정까지 보입니다.</p>
      <div className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600" role="region" aria-labelledby="staff-perf-title" aria-describedby="staff-perf-scroll-hint" tabIndex={0}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-50">
              <th scope="col" className="sticky left-0 bg-white text-left font-medium px-4 sm:px-6 py-2">직원</th>
              <th scope="col" className={th}>완료 건수</th>
              <th scope="col" className={th}>완료 예약액</th>
              <th scope="col" className={th}>시술</th>
              <th scope="col" className={th}>제품 판매</th>
              <th scope="col" className={th}>응대 고객</th>
              <th scope="col" className={`${th} pr-4 sm:pr-6`}>남은 일정</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-6 text-center text-xs text-gray-400">직원이 없어요</td></tr>
            )}
            {report.rows.map(r => (
              <tr key={r.staffId} className="border-b border-gray-50 last:border-0">
                <td className="sticky left-0 bg-white px-4 sm:px-6 py-2.5">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} aria-hidden="true" />
                    <span className={`font-medium ${r.isActive ? 'text-gray-800' : 'text-gray-400'}`}>{r.name}{!r.isActive && ' (퇴사)'}</span>
                  </span>
                </td>
                <td className={td}>{r.completedReservations}건</td>
                <td className={`${td} font-semibold text-gray-900`}>{formatPrice(r.reservationAmount)}</td>
                <td className={td}>{r.treatments}건</td>
                <td className={td}>{formatPrice(r.productAmount)}</td>
                <td className={td}>{r.customers}명</td>
                <td className={`${td} pr-4 sm:pr-6 text-gray-500`} title={r.pendingCompletion > 0 ? `완료 처리 안 된 지난 예약 ${r.pendingCompletion}건` : undefined}>
                  {r.upcomingReservations}건{r.pendingCompletion > 0 && <span className="text-amber-600"> · 미완료 {r.pendingCompletion}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 sm:px-6 py-3 border-t border-gray-50 space-y-2">
        <p className="text-xs text-gray-400">
          완료 처리된 예약의 예약액과 담당 직원이 기록된 제품 판매액 기준입니다. 실제 입금액(결제 화면)·할인·회차권 차감은 반영되지 않으며, 취소·노쇼는 제외합니다.
        </p>
        {caveats.map(c => <p key={c} className="text-xs text-amber-700">{c}</p>)}
        {draft && (
          <MessageDraftPanel title={`${label(yearMonth)} 직원별 실적 보고`} text={draft} shareTitle={`${label(yearMonth)} 직원별 실적`} onClose={() => setDraftOpen(false)} />
        )}
      </div>
    </div>
  );
}
