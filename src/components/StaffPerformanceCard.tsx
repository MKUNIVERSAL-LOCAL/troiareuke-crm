import { useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Percent } from 'lucide-react';
import { getStaffMonthReport, recentMonths, buildStaffReportMessage, staffReportCaveats } from '../lib/staffPerformance';
import { formatPrice } from '../lib/format';
import MessageDraftPanel from './ui/MessageDraftPanel';
// 인센티브(수당) — 규칙은 순수 모듈, 비율은 설정 행(NAS 동기) (233, GAP S-1)
import { computeCommission, ratesFor, commissionConfigured, parseRate, isBlankRate, hasOwnRates, describeCommissionBasis, COMMISSION_CAVEATS, MAX_COMMISSION_RATE, type CommissionConfig } from '../lib/commissionRule';
import { describePrefLoss } from '../lib/prefLandedRule'; // 저장이 정말 남았는지 (284)
import { getCommissionConfig, saveCommissionConfig } from '../lib/staffCommission';
import { notify } from '../lib/notify';

/**
 * 직원별 월 실적 표 (2026-11-18) — 직원 화면. 달 선택(이달~6개월 전), 완료 건수·완료 예약액·시술·제품 판매·응대 고객·남은 일정,
 * 오너 보고용 문구 복사/공유. tick이 바뀌면 다시 집계(직원 추가·수정 후). 직원 카드의 "월 예약액(예정 포함)"과 달리 완료 처리분만.
 */
export default function StaffPerformanceCard({ tick = 0 }: { tick?: number }) {
  const months = useMemo(() => recentMonths(6), []);
  const [yearMonth, setYearMonth] = useState(months[0]);
  const [draftOpen, setDraftOpen] = useState(false);
  const report = useMemo(() => getStaffMonthReport(yearMonth), [yearMonth, tick]);
  // 인센티브 비율 — 저장하면 바로 표에 반영 (233)
  const [commission, setCommission] = useState<CommissionConfig>(() => getCommissionConfig());
  const [ratePanel, setRatePanel] = useState(false);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const showCommission = commissionConfigured(commission);
  const commissionTotal = report.rows.reduce((sum, r) => sum + computeCommission(r, ratesFor(r.staffId, commission)).total, 0);
  const draftKey = (staffId: string, field: 'serviceRate' | 'productRate') => `${staffId}:${field}`;
  /** 입력칸에 보일 값 — 직원 줄은 '예외가 걸린 값' 만 적고, 상속 중이면 비운다(placeholder 로 기본값 안내) */
  const rateValue = (staffId: string, field: 'serviceRate' | 'productRate'): string => {
    const key = draftKey(staffId, field);
    if (key in rateDraft) return rateDraft[key];
    if (staffId === 'default') return String(commission[field] ?? 0);
    const own = commission.perStaff?.[staffId]?.[field];
    return typeof own === 'number' ? String(own) : '';
  };
  const inheritedRate = (field: 'serviceRate' | 'productRate'): string => `기본 ${commission[field] ?? 0}`;
  /** 직원별 예외 요약 — 표의 금액과 근거가 맞는지 화면에서 확인할 수 있게 (리뷰 H-3) */
  const exceptionLines = report.rows
    .filter(r => hasOwnRates(r.staffId, commission))
    .map(r => `${r.name}${r.isActive ? '' : '(퇴사)'} ${describeCommissionBasis(ratesFor(r.staffId, commission))}`);
  function saveRates() {
    const next: CommissionConfig = { serviceRate: commission.serviceRate, productRate: commission.productRate, perStaff: { ...(commission.perStaff ?? {}) } };
    for (const [key, raw] of Object.entries(rateDraft)) {
      const [staffId, field] = key.split(':') as [string, 'serviceRate' | 'productRate'];
      // 직원 줄을 비우면 "예외 해제 → 매장 기본값 상속". 전에는 빈 칸이 0% 예외로 저장돼 그 직원 수당이 영구 0원이 됐다 (234, 리뷰 M-3)
      if (isBlankRate(raw)) {
        if (staffId === 'default') { next[field] = 0; continue; }
        const own = { ...next.perStaff?.[staffId] };
        delete own[field];
        next.perStaff = { ...next.perStaff, [staffId]: own };
        continue;
      }
      const value = parseRate(raw);
      if (value === null) { notify(`비율은 0~${MAX_COMMISSION_RATE} 사이 숫자로 입력해주세요(소수점 한 자리까지).`); return; } // 잘못된 값은 하나도 저장하지 않는다
      if (staffId === 'default') next[field] = value;
      else next.perStaff = { ...next.perStaff, [staffId]: { ...next.perStaff?.[staffId], [field]: value } };
    }
    const lostRates = describePrefLoss(saveCommissionConfig(next), '인센티브 비율');
    setCommission(getCommissionConfig());
    setRateDraft({});
    // 급여 근거라 "저장했습니다" 가 거짓이면 그대로 임금 분쟁이 된다 (284)
    notify(lostRates ?? '인센티브 비율을 저장했습니다.');
  }
  const draft = useMemo(() => {
    if (!draftOpen) return null;
    if (!commissionConfigured(commission)) return buildStaffReportMessage(report);
    return buildStaffReportMessage(report, {
      amountOf: staffId => computeCommission(report.rows.find(r => r.staffId === staffId) ?? {}, ratesFor(staffId, commission)).total,
      describeOf: staffId => describeCommissionBasis(ratesFor(staffId, commission)),
      total: report.rows.reduce((sum, r) => sum + computeCommission(r, ratesFor(r.staffId, commission)).total, 0),
      caveats: COMMISSION_CAVEATS,
    });
  }, [draftOpen, report, commission]);
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
          <button type="button" onClick={() => setRatePanel(o => !o)} aria-expanded={ratePanel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-gray-700 hover:bg-slate-200">
            <Percent size={12} />인센티브 비율
          </button>
          <button type="button" onClick={() => setDraftOpen(o => !o)} aria-expanded={draftOpen}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-gray-700 hover:bg-slate-200">
            <ClipboardList size={12} />보고 문구
          </button>
        </div>
      </div>
      <p id="staff-perf-scroll-hint" className="sm:hidden px-4 pt-2 text-xs text-gray-400">표를 옆으로 밀면 응대 고객{showCommission ? '·수당' : ''}·남은 일정까지 보입니다.</p>
      <div className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600" role="region" aria-labelledby="staff-perf-title" aria-describedby="staff-perf-scroll-hint" tabIndex={0}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-50">
              <th scope="col" className="sticky left-0 bg-white text-left font-medium px-4 sm:px-6 py-2">직원</th>
              <th scope="col" className={th}>완료 건수</th>
              <th scope="col" className={th}>완료 예약액</th>
              <th scope="col" className={th} title="그 예약에 연결된 완료 결제의 합 — 회차권 차감·할인·환불이 반영된 실제 입금">실결제액</th>
              <th scope="col" className={th}>시술</th>
              <th scope="col" className={th}>제품 판매</th>
              <th scope="col" className={th}>응대 고객</th>
              {showCommission && <th scope="col" className={th} title="참고 계산 — 시술 비율 × 실결제액 + 제품 비율 × 제품 판매액">수당(참고)</th>}
              <th scope="col" className={`${th} pr-4 sm:pr-6`}>남은 일정</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr><td colSpan={showCommission ? 9 : 8} className="px-6 py-6 text-center text-xs text-gray-400">직원이 없어요 — 직원 관리에서 등록하면 실적이 여기에 모입니다</td></tr>
            )}
            {report.rows.map(r => (
              <tr key={r.staffId} className="border-b border-gray-50 last:border-0">
                <td className="sticky left-0 bg-white px-4 sm:px-6 py-2.5">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} aria-hidden="true" />
                    <span className={`font-medium ${r.isActive ? 'text-gray-800' : 'text-gray-400'}`}>{r.name}{!r.isActive && ' (퇴사)'}</span>
                  </span>
                </td>
                <td className={td} data-testid="perf-completed">{r.completedReservations}건</td>
                <td className={`${td} font-semibold text-gray-900`} data-testid="perf-amount">{formatPrice(r.reservationAmount)}</td>
                <td className={td} data-testid="perf-paid">{formatPrice(r.paidAmount)}</td>
                <td className={td}>{r.treatments}건</td>
                <td className={td}>{formatPrice(r.productAmount)}</td>
                <td className={td}>{r.customers}명</td>
                {showCommission && (
                  <td className={`${td} font-semibold text-emerald-700`} data-testid="perf-commission">
                    {formatPrice(computeCommission(r, ratesFor(r.staffId, commission)).total)}
                    <span className="block text-[11px] font-normal text-gray-400" data-testid="perf-commission-rate">
                      시술 {ratesFor(r.staffId, commission).serviceRate}% · 제품 {ratesFor(r.staffId, commission).productRate}%
                      {hasOwnRates(r.staffId, commission) ? ' (예외)' : ''}
                    </span>
                  </td>
                )}
                <td className={`${td} pr-4 sm:pr-6 text-gray-500`} title={r.pendingCompletion > 0 ? `완료 처리 안 된 지난 예약 ${r.pendingCompletion}건` : undefined}>
                  {r.upcomingReservations}건{r.pendingCompletion > 0 && <span className="text-amber-700"> · 미완료 {r.pendingCompletion}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 sm:px-6 py-3 border-t border-gray-50 space-y-2">
        <p className="text-xs text-gray-400">
          완료 처리된 예약의 예약액과 담당 직원이 기록된 제품 판매액 기준입니다. 실결제액 열은 결제 화면의 완료 결제 합(분할 결제 포함)이고, 예약액에는 할인·회차권 차감이 반영되지 않으며, 취소·노쇼는 제외합니다.
        </p>
        {caveats.map(c => <p key={c} className="text-xs text-amber-700">{c}</p>)}
        {showCommission && (
          <>
            <p className="text-xs text-gray-500" data-testid="commission-total">수당 합계(참고) {formatPrice(commissionTotal)} — 매장 기본 {describeCommissionBasis(commission)}</p>
            {exceptionLines.length > 0 && (
              <p className="text-xs text-gray-500" data-testid="commission-exceptions">직원별 예외 — {exceptionLines.join(' / ')}</p>
            )}
            {COMMISSION_CAVEATS.map(c => <p key={c} className="text-xs text-gray-400">{c}</p>)}
          </>
        )}
        {ratePanel && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3" data-testid="commission-panel">
            <p className="text-sm font-semibold text-gray-800">인센티브 비율 (0~{MAX_COMMISSION_RATE}%, 소수점 한 자리)</p>
            <p className="text-xs text-gray-500">매장 기본값을 정하고, 다르게 주는 직원만 그 줄에 적으면 됩니다. 직원 줄을 <b>비우면 매장 기본값을 따릅니다</b>(0을 적으면 그 직원만 0%). 비율을 전부 0으로 두면 수당 열이 표시되지 않습니다. 퇴사 직원도 그 달 기록이 있으면 함께 조정할 수 있습니다.</p>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-xs text-gray-400">
                    <th scope="col" className="text-left font-medium py-1 pr-4">대상</th>
                    <th scope="col" className="text-right font-medium py-1 px-2">시술 %</th>
                    <th scope="col" className="text-right font-medium py-1 px-2">제품 %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1 pr-4 font-medium text-gray-700">매장 기본</td>
                    {(['serviceRate', 'productRate'] as const).map(field => (
                      <td key={field} className="py-1 px-2">
                        <input value={rateValue('default', field)} onChange={e => setRateDraft(d => ({ ...d, [draftKey('default', field)]: e.target.value }))}
                          inputMode="decimal" aria-label={`매장 기본 ${field === 'serviceRate' ? '시술' : '제품'} 비율`}
                          className="w-20 px-2 py-1.5 text-right text-sm border border-gray-200 rounded-lg" />
                      </td>
                    ))}
                  </tr>
                  {report.rows.map(r => (
                    <tr key={r.staffId}>
                      <td className="py-1 pr-4 text-gray-700">{r.name}{!r.isActive && ' (퇴사)'}</td>
                      {(['serviceRate', 'productRate'] as const).map(field => (
                        <td key={field} className="py-1 px-2">
                          <input value={rateValue(r.staffId, field)} onChange={e => setRateDraft(d => ({ ...d, [draftKey(r.staffId, field)]: e.target.value }))}
                            inputMode="decimal" placeholder={inheritedRate(field)} aria-label={`${r.name} ${field === 'serviceRate' ? '시술' : '제품'} 비율`}
                            className="w-20 px-2 py-1.5 text-right text-sm border border-gray-200 rounded-lg" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={saveRates} className="px-4 py-2 min-h-[40px] bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e]">비율 저장</button>
              <button type="button" onClick={() => { setRateDraft({}); setRatePanel(false); }} className="px-4 py-2 min-h-[40px] bg-white border border-gray-200 text-gray-600 text-sm rounded-xl">닫기</button>
            </div>
          </div>
        )}
        {draft && (
          <MessageDraftPanel title={`${label(yearMonth)} 직원별 실적 보고`} text={draft} shareTitle={`${label(yearMonth)} 직원별 실적`} onClose={() => setDraftOpen(false)} />
        )}
      </div>
    </div>
  );
}
