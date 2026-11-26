// RevenueMetricsCard — 매출 화면 "이달 지표" (비코어, 147, GAP P-6·P-7): 전월/전년 대비·목표 달성률·신규/기존·할인·회원권 판매 vs 실현·미사용 잔액·BEP·시간당·월말 예상 + 월 목표·월 마감 잠금
import { useState } from 'react';
import { Lock, Unlock, AlertTriangle } from 'lucide-react';
import { notify } from '../lib/notify';
import { askConfirm } from '../lib/confirmDialog';
import { formatPrice } from '../lib/format';
import { parseAmount } from '../lib/inputRules';
import { closeMonth, monthCloseSavedFor, reopenMonth, saveMonthlyTarget } from '../lib/monthClose';
import { describePrefLoss, prefLossNote } from '../lib/prefLandedRule'; // 저장이 정말 남았는지 (284·290)
import { prefSaveMode } from '../lib/prefSaveMode'; // 서버 모드에서는 "다시 열면 사라집니다" 가 거짓일 수 있다 (290)
import type { MonthMetrics } from '../lib/revenueMetricsRule';
import type { DrillResult } from '../lib/revenueDrilldownRule';
import MetricDetailModal from './MetricDetailModal';

/**
 * 지표 한 칸. 근거를 볼 수 있는 칸만 버튼이고, 그 버튼의 testid 는 **리터럴**(`openTestId`)로 받는다 —
 * 보간(`${testId}-open`)은 화면 칸 커버리지 가드가 보지 못한다(277, 리뷰 M-2).
 * 다만 리터럴을 빠뜨리면 버튼에 testid 가 아예 없어지므로(281, 리뷰 L-1) **보간을 폴백으로 남긴다** —
 * 타입으로 강제하지 못하는 이유: `openDrill` 은 줄이 없으면 `undefined` 를 돌려주므로 호출 쪽의
 * `onOpen` 은 항상 "있을 수도 없을 수도" 다(유니온으로 묶으면 정상 호출이 타입 오류가 된다).
 */
function Item({ label, value, sub, subTestId, tip, testId, openTestId, tone, onOpen }: { label: string; value: string; sub?: string; subTestId?: string; tip: string; testId?: string; openTestId?: string; tone?: 'up' | 'down' | 'warn'; onOpen?: () => void }) {
  const valueClass = `text-lg font-bold mt-0.5 ${tone === 'up' ? 'text-green-700' : tone === 'down' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`;
  const body = (
    <>
      <span className="block text-xs text-gray-400">{label}</span>
      <span className={`block ${valueClass}`} data-testid={testId}>{value}</span>
      {/* 분모를 스펙이 함께 읽어 **그 숫자가 맞는지** 계산해 보게 한다 (278 — kpi 타일과 같은 방식) */}
      {sub && <span className="block text-2xs text-gray-500 mt-0.5 break-keep" data-testid={subTestId}>{sub}</span>}
    </>
  );
  // 근거를 볼 수 있는 칸만 버튼이다 — 눌러도 아무 일 없는 칸을 버튼으로 만들지 않는다(장식 UI 금지, 260)
  if (onOpen) { // <p> 를 버튼 안에 넣지 않는다 — 비표준 중첩 (리뷰 L-5)
    return (
      <button type="button" onClick={onOpen} title={tip} data-testid={openTestId ?? (testId ? `${testId}-open` : undefined)}
        className="text-left bg-white rounded-2xl border border-gray-100 p-3.5 hover:border-[#1a3a8f]/40 hover:bg-blue-50/30 transition-colors">
        {body}
        <span className="mt-1 block text-2xs font-medium text-[#1a3a8f]">근거 보기 →</span>
      </button>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3.5" title={tip}>
      {body}
    </div>
  );
}

const pctText = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const tone = (v: number | null): 'up' | 'down' | undefined => (v === null || v === 0 ? undefined : v > 0 ? 'up' : 'down');

type DrillKind = 'newCustomer' | 'discount' | 'unused';
const DRILL_NOTE: Record<DrillKind, string> = {
  newCustomer: '이달 등록한 고객의 결제 합입니다.',
  discount: '할인이 붙은 완료 결제입니다(금액은 할인액).',
  unused: '진행 중인 회차권별 잔액입니다(지금 시점).',
};

export default function RevenueMetricsCard({ m, closed, canLock, onChanged, drills }: {
  m: MonthMetrics;
  closed: boolean;
  canLock: boolean;
  onChanged: () => void;
  /** 숫자를 만든 줄들 — 카드와 같은 입력에서 계산된 값 (260, GAP P-6) */
  drills: { newCustomer: DrillResult; discount: DrillResult; unused: DrillResult };
}) {
  const [targetInput, setTargetInput] = useState(m.target ? String(m.target) : '');
  // 토스트는 4초면 사라진다 — 마감 저장이 이 PC 에 남지 않았다는 사실은 화면에 남겨 둔다 (290, 리뷰 M-2).
  // 294(288~292 리뷰 M-6): 판정을 state 로 들었더니 **달을 바꾸거나 화면을 다시 열면 사라졌다**
  // (이 카드는 `key={viewMonth}` 로 리마운트된다) — 그러면 거짓인 "마감됨" 배지만 남는다. 렌더마다 되읽는다.
  // 300(297~299 리뷰 M-2): **그 달** 기준으로 묻는다 — 다른 달의 실패를 이 달 카드에 적지 않는다
  const lockNote = prefLossNote(monthCloseSavedFor(m.month), prefSaveMode());
  // **종류만** 기억한다 — 값을 복사해 두면 자료가 갱신된 뒤 "합계=카드" 가 깨진다 (리뷰 M-1)
  const [drillKind, setDrillKind] = useState<DrillKind | null>(null);
  const [y, mo] = m.month.split('-');
  const label = `${y}년 ${Number(mo)}월`;
  const DRILL_TITLE: Record<DrillKind, string> = {
    newCustomer: `${label} 신규 고객 매출`,
    discount: `${label} 할인 합계`,
    unused: '미사용 회원권 잔액',
  };
  // 줄이 없으면 근거 보기를 걸지 않는다 — 눌러서 "없습니다" 만 보는 길을 만들지 않는다 (리뷰 L-2)
  const openDrill = (kind: DrillKind) => (drills[kind].rows.length > 0 ? () => setDrillKind(kind) : undefined);

  const saveTarget = () => {
    const raw = targetInput.trim();
    const n = raw === '' ? null : parseAmount(raw);
    if (raw !== '' && (n === null || n < 0)) { notify.error('목표는 0 이상 숫자로 입력해주세요.'); return; }
    const lost = describePrefLoss(saveMonthlyTarget(m.month, n), '월 매출 목표', prefSaveMode());
    if (lost) notify.error(lost); // 저장 공간이 모자라면 "저장했습니다" 가 거짓이다. 톤도 실패로 (284·285 리뷰 LOW)
    else notify.success(n ? `${label} 목표를 ${formatPrice(n)}으로 저장했습니다.` : `${label} 목표를 지웠습니다.`);
    onChanged();
  };
  const toggleLock = async () => {
    if (closed) {
      if (!(await askConfirm({ title: '월 마감 해제', confirmLabel: '마감 해제', cancelLabel: '닫기', message: `${label} 마감을 풀까요? 다시 결제·지출·판매를 바꿀 수 있게 됩니다. 신고를 마친 달이면 수정 뒤 다시 잠가주세요.` }))) return;
      const landed = reopenMonth(m.month);
      const lost = describePrefLoss(landed, `${label} 마감 해제`, prefSaveMode());
      if (lost) notify.error(lost);
      else notify.info(`${label} 마감을 풀었습니다.`);
    } else {
      if (!(await askConfirm({ title: '월 마감', confirmLabel: '마감', cancelLabel: '닫기', message: `${label}을 마감할까요? 그 달의 결제·지출·제품 판매·회차권 등록을 등록·수정·삭제할 수 없게 됩니다(모든 기기). 언제든 풀 수 있습니다.` }))) return;
      const closedNow = closeMonth(m.month);
      const lostClose = describePrefLoss(closedNow, `${label} 마감`, prefSaveMode());
      if (lostClose) notify.error(lostClose); // 마감이 저장되지 않았는데 "마감했습니다" 라고 말하면 세무 신고가 흔들린다 (284)
      else notify.success(`${label}을 마감했습니다. 이제 그 달 숫자는 바뀌지 않습니다.`);
    }
    onChanged();
  };

  return (
    <div className="bg-slate-50 rounded-2xl border border-gray-100 p-4 space-y-3" data-testid="revenue-metrics">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-gray-900">{label} 지표</h3>
        <span className="text-2xs text-gray-400">각 칸에 마우스를 올리면 계산 공식이 보입니다 · 확정값, "예상"만 예측</span>
        <div className="flex-1" />
        {closed && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800 text-white text-xs font-medium" data-testid="month-closed-badge"><Lock size={11} />마감됨</span>}
        {/* 290(리뷰 M-2)·294(리뷰 M-6): 저장이 이 PC 에 남지 않았는데 배지만 보이면 화면의 유일한 상태 표시가 거짓이 된다 */}
        {lockNote && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-medium" data-testid="month-close-unsaved">
            <AlertTriangle size={11} />{lockNote}
          </span>
        )}
        {canLock && (
          <button type="button" onClick={() => void toggleLock()} aria-pressed={closed} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${closed ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' : 'bg-gray-800 text-white border-gray-800 hover:bg-gray-700'}`}>
            {closed ? <><Unlock size={12} />마감 해제</> : <><Lock size={12} />월 마감</>}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Item label="전월 대비" value={pctText(m.momPct)} sub={`지난달 ${formatPrice(m.prevMonth)}`} tone={tone(m.momPct)} tip="(이달 − 지난달) ÷ 지난달. 지난달 0 이면 —" testId="metric-mom" subTestId="metric-mom-sub" />
        <Item label="전년 동월 대비" value={pctText(m.yoyPct)} sub={`작년 ${formatPrice(m.lastYear)}`} tone={tone(m.yoyPct)} tip="(이달 − 작년 같은 달) ÷ 작년 같은 달. 작년 0 이면 —" testId="metric-yoy" subTestId="metric-yoy-sub" />
        <Item label="목표 달성률" value={m.achievementPct === null ? '—' : `${m.achievementPct}%`} sub={m.target ? `목표 ${formatPrice(m.target)}` : '목표를 아래에 적으세요'} tone={m.achievementPct !== null && m.achievementPct >= 100 ? 'up' : undefined} tip="매출 ÷ 월 목표" testId="metric-achievement" subTestId="metric-achievement-sub" />
        <Item label="신규 고객 매출" value={m.newSharePct === null ? '—' : `${m.newSharePct}%`} sub={`신규 ${formatPrice(m.newCustomerRevenue)} · 기존 ${formatPrice(m.existingCustomerRevenue)}`} tip="이달 등록한 고객의 결제 비중" testId="metric-new-share" subTestId="metric-new-share-sub" openTestId="metric-new-share-open"
          onOpen={openDrill('newCustomer')} />
        <Item label="할인 합계" value={formatPrice(m.discount)} tip="완료 결제의 할인 금액 합" testId="metric-discount" openTestId="metric-discount-open"
          onOpen={openDrill('discount')} />
        <Item label="회원권 판매" value={formatPrice(m.programSold)} sub={`실현 ${formatPrice(m.programRealized)} (이달 시술로 소진된 회차 × 회당 가격)`} tip="판매 = 회차권 결제(현금 유입), 실현 = 이달 차감 회차 × (결제액 ÷ 총 회차)" testId="metric-program" subTestId="metric-program-sub" />
        <Item label="미사용 회원권 잔액" value={formatPrice(m.unusedBalance)} sub="진행 중 회차권의 잔여 회차 × 회당 가격" tip="고객이 이미 낸 돈 중 아직 서비스하지 않은 몫(시점값)" tone={m.unusedBalance > 0 ? 'warn' : undefined} testId="metric-unused" openTestId="metric-unused-open"
          onOpen={openDrill('unused')} />
        <Item label="손익분기 매출" value={m.breakEven === null || m.sga === 0 ? '—' : formatPrice(m.breakEven)} sub={m.sga === 0 ? '판관비(임대료·인건비 등) 지출이 없으면 계산하지 않습니다' : `원가 ${formatPrice(m.cogs)} · 판관비 ${formatPrice(m.sga)}`} tip="판관비 ÷ (1 − 매출원가율). 판관비 0 또는 원가가 매출 이상이면 —" testId="metric-bep" subTestId="metric-bep-sub" />
        <Item label="시간당 매출" value={m.perHour === null ? '—' : formatPrice(m.perHour)} testId="metric-per-hour" subTestId="metric-per-hour-sub" sub={m.openHours === null ? '영업시간 설정 필요' : `영업 ${m.openHours}시간`} tip="매출 ÷ 영업시간(설정 > 영업시간, 휴무·지정 휴일 제외, 이달은 오늘까지)" />
        <Item label={m.isCurrentMonth ? '월말 예상(예측)' : '월 매출'} value={m.isCurrentMonth ? (m.projected === null ? '—' : formatPrice(m.projected)) : formatPrice(m.total)} sub={m.isCurrentMonth ? `${m.daysElapsed}/${m.daysInMonth}일 경과 · 일평균 × 일수` : undefined} tip="이달에만: 지금까지 매출 ÷ 지난 일수 × 그 달 일수 — 예측값" testId="metric-projected" subTestId="metric-projected-sub" />
      </div>
      {canLock && (
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-gray-600" htmlFor="monthly-target">{label} 매출 목표</label>
        <input id="monthly-target" inputMode="numeric" value={targetInput} onChange={e => setTargetInput(e.target.value)} placeholder="예: 10,000,000" className="w-40 px-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
        <button type="button" onClick={saveTarget} className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a3a8f] rounded-lg hover:bg-[#15306e]">목표 저장</button>
        <span className="text-2xs text-gray-400">목표는 지점 설정에 저장돼 모든 기기에서 같습니다</span>
      </div>
      )}
      {/* 열려 있는 동안에도 **지금** 자료를 읽는다 — 카드가 갱신되면 목록도 같이 갱신된다 (리뷰 M-1) */}
      {drillKind && <MetricDetailModal title={DRILL_TITLE[drillKind]} note={DRILL_NOTE[drillKind]} result={drills[drillKind]} onClose={() => setDrillKind(null)} />}
    </div>
  );
}
