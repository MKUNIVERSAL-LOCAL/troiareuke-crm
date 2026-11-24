// RevenueMetricsCard — 매출 화면 "이달 지표" (비코어, 147, GAP P-6·P-7): 전월/전년 대비·목표 달성률·신규/기존·할인·회원권 판매 vs 실현·미사용 잔액·BEP·시간당·월말 예상 + 월 목표·월 마감 잠금
import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { notify } from '../lib/notify';
import { askConfirm } from '../lib/confirmDialog';
import { formatPrice } from '../lib/format';
import { parseAmount } from '../lib/inputRules';
import { closeMonth, reopenMonth, saveMonthlyTarget } from '../lib/monthClose';
import type { MonthMetrics } from '../lib/revenueMetricsRule';

function Item({ label, value, sub, tip, testId, tone }: { label: string; value: string; sub?: string; tip: string; testId?: string; tone?: 'up' | 'down' | 'warn' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3.5" title={tip}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${tone === 'up' ? 'text-green-700' : tone === 'down' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`} data-testid={testId}>{value}</p>
      {sub && <p className="text-2xs text-gray-500 mt-0.5 break-keep">{sub}</p>}
    </div>
  );
}

const pctText = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const tone = (v: number | null): 'up' | 'down' | undefined => (v === null || v === 0 ? undefined : v > 0 ? 'up' : 'down');

export default function RevenueMetricsCard({ m, closed, canLock, onChanged }: { m: MonthMetrics; closed: boolean; canLock: boolean; onChanged: () => void }) {
  const [targetInput, setTargetInput] = useState(m.target ? String(m.target) : '');
  const [y, mo] = m.month.split('-');
  const label = `${y}년 ${Number(mo)}월`;

  const saveTarget = () => {
    const raw = targetInput.trim();
    const n = raw === '' ? null : parseAmount(raw);
    if (raw !== '' && (n === null || n < 0)) { notify.error('목표는 0 이상 숫자로 입력해주세요.'); return; }
    saveMonthlyTarget(m.month, n);
    notify.success(n ? `${label} 목표를 ${formatPrice(n)}으로 저장했습니다.` : `${label} 목표를 지웠습니다.`);
    onChanged();
  };
  const toggleLock = async () => {
    if (closed) {
      if (!(await askConfirm({ title: '월 마감 해제', confirmLabel: '마감 해제', cancelLabel: '닫기', message: `${label} 마감을 풀까요? 다시 결제·지출·판매를 바꿀 수 있게 됩니다. 신고를 마친 달이면 수정 뒤 다시 잠가주세요.` }))) return;
      reopenMonth(m.month);
      notify.info(`${label} 마감을 풀었습니다.`);
    } else {
      if (!(await askConfirm({ title: '월 마감', confirmLabel: '마감', cancelLabel: '닫기', message: `${label}을 마감할까요? 그 달의 결제·지출·제품 판매·회차권 등록을 등록·수정·삭제할 수 없게 됩니다(모든 기기). 언제든 풀 수 있습니다.` }))) return;
      closeMonth(m.month);
      notify.success(`${label}을 마감했습니다. 이제 그 달 숫자는 바뀌지 않습니다.`);
    }
    onChanged();
  };

  return (
    <div className="bg-slate-50 rounded-2xl border border-gray-100 p-4 space-y-3" data-testid="revenue-metrics">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-gray-900">{label} 지표</h3>
        <span className="text-2xs text-gray-400">정의: docs/ANALYTICS-DEFINITIONS.md · 확정값, "예상"만 예측</span>
        <div className="flex-1" />
        {closed && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800 text-white text-xs font-medium" data-testid="month-closed-badge"><Lock size={11} />마감됨</span>}
        {canLock && (
          <button type="button" onClick={() => void toggleLock()} aria-pressed={closed} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${closed ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' : 'bg-gray-800 text-white border-gray-800 hover:bg-gray-700'}`}>
            {closed ? <><Unlock size={12} />마감 해제</> : <><Lock size={12} />월 마감</>}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Item label="전월 대비" value={pctText(m.momPct)} sub={`지난달 ${formatPrice(m.prevMonth)}`} tone={tone(m.momPct)} tip="(이달 − 지난달) ÷ 지난달. 지난달 0 이면 —" testId="metric-mom" />
        <Item label="전년 동월 대비" value={pctText(m.yoyPct)} sub={`작년 ${formatPrice(m.lastYear)}`} tone={tone(m.yoyPct)} tip="(이달 − 작년 같은 달) ÷ 작년 같은 달. 작년 0 이면 —" testId="metric-yoy" />
        <Item label="목표 달성률" value={m.achievementPct === null ? '—' : `${m.achievementPct}%`} sub={m.target ? `목표 ${formatPrice(m.target)}` : '목표를 아래에 적으세요'} tone={m.achievementPct !== null && m.achievementPct >= 100 ? 'up' : undefined} tip="매출 ÷ 월 목표" testId="metric-achievement" />
        <Item label="신규 고객 매출" value={m.newSharePct === null ? '—' : `${m.newSharePct}%`} sub={`신규 ${formatPrice(m.newCustomerRevenue)} · 기존 ${formatPrice(m.existingCustomerRevenue)}`} tip="이달 등록한 고객의 결제 비중" testId="metric-new-share" />
        <Item label="할인 합계" value={formatPrice(m.discount)} tip="완료 결제의 할인 금액 합" />
        <Item label="회원권 판매" value={formatPrice(m.programSold)} sub={`실현 ${formatPrice(m.programRealized)} (이달 시술로 소진된 회차 × 회당 가격)`} tip="판매 = 회차권 결제(현금 유입), 실현 = 이달 차감 회차 × (결제액 ÷ 총 회차)" testId="metric-program" />
        <Item label="미사용 회원권 잔액" value={formatPrice(m.unusedBalance)} sub="진행 중 회차권의 잔여 회차 × 회당 가격" tip="고객이 이미 낸 돈 중 아직 서비스하지 않은 몫(시점값)" tone={m.unusedBalance > 0 ? 'warn' : undefined} />
        <Item label="손익분기 매출" value={m.breakEven === null ? '—' : formatPrice(m.breakEven)} sub={`원가 ${formatPrice(m.cogs)} · 판관비 ${formatPrice(m.sga)}`} tip="판관비 ÷ (1 − 매출원가율). 원가가 매출 이상이면 —" testId="metric-bep" />
        <Item label="시간당 매출" value={m.perHour === null ? '—' : formatPrice(m.perHour)} sub={m.openHours === null ? '영업시간 설정 필요' : `영업 ${m.openHours}시간`} tip="매출 ÷ 영업시간(설정 > 영업시간, 휴무·지정 휴일 제외, 이달은 오늘까지)" />
        <Item label={m.isCurrentMonth ? '월말 예상(예측)' : '월 매출'} value={m.isCurrentMonth ? (m.projected === null ? '—' : formatPrice(m.projected)) : formatPrice(m.total)} sub={m.isCurrentMonth ? `${m.daysElapsed}/${m.daysInMonth}일 경과 · 일평균 × 일수` : undefined} tip="이달에만: 지금까지 매출 ÷ 지난 일수 × 그 달 일수 — 예측값" testId="metric-projected" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-gray-600" htmlFor="monthly-target">{label} 매출 목표</label>
        <input id="monthly-target" inputMode="numeric" value={targetInput} onChange={e => setTargetInput(e.target.value)} placeholder="예: 10,000,000" className="w-40 px-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
        <button type="button" onClick={saveTarget} className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a3a8f] rounded-lg hover:bg-[#15306e]">목표 저장</button>
        <span className="text-2xs text-gray-400">목표는 지점 설정에 저장돼 모든 기기에서 같습니다</span>
      </div>
    </div>
  );
}
