import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeature } from '../hooks/useFeature';
import { canDo } from '../lib/permissions';
import { buildTodayTasks, getMonthlyKpis, getMonthUtilization, type TodayTask } from '../lib/todayTasks';
import type { MonthlyKpis } from '../lib/kpiRule';
import { formatHours, type Utilization } from '../lib/utilizationRule';

/**
 * 대시보드 "오늘 할 일" + 이달 운영 지표 (138, GAP D-1 — 숫자 나열이 아니라 행동으로 연결되는 대시보드).
 * 각 줄을 누르면 그 고객 목록·화면으로 간다. 지표는 공식을 툴팁으로 보여 "왜 이 숫자인지" 알 수 있게(벤치마크 TOP 20 #15).
 */
/** 지표 공식 — 타일 title 과 "공식 보기" 패널이 같은 문장을 쓴다(모바일·키보드엔 title 툴팁이 없다) (183) */
const KPI_FORMULA = {
  revisit: '재방문율 = 이달 방문 고객 중 이달 이전에도 방문 기록이 있는 고객 비율',
  rebook: '재예약률 = 이달 방문 고객 중 다음 예약이 잡힌 고객 비율',
  ticket: '객단가(현금) = 이달 완료 결제 합 ÷ 이달 방문 고객 수 — 회차권 판매액이 포함된 현금 기준(고객 상세의 실현 매출 객단가와 다름)',
  util: '가동률 = 이달 오늘까지 확정·완료 예약 시간 ÷ 활성 직원 근무 가용 시간(근무표 또는 영업시간, 매장 휴일·휴게 제외) — 근무 외 예약도 세므로 100% 를 넘을 수 있음',
} as const;

export interface TodayTasksData { tasks: TodayTask[]; kpi: MonthlyKpis | null; util: Utilization | null; salesOn: boolean }

/** 오늘 할 일·이달 지표를 한 번 계산 — Dashboard 가 모바일·PC 카드 둘에 같은 결과를 내려 전수 스캔을 두 번 돌리지 않는다 (178 리뷰 M-2) */
export function useTodayTasks(refreshKey: number): TodayTasksData {
  const { user } = useAuth();
  const customersOn = useFeature('module.customers');
  const reservationsOn = useFeature('module.reservations');
  const productsOn = useFeature('module.products');
  const messagingOn = useFeature('module.messaging');
  const salesOn = useFeature('module.sales') && canDo(user?.role, 'sales.view');
  const tasks = useMemo(() => buildTodayTasks({ customersOn, reservationsOn, productsOn, salesOn, messagingOn }), [refreshKey, customersOn, reservationsOn, productsOn, salesOn, messagingOn]);
  const kpi = useMemo(() => (customersOn ? getMonthlyKpis() : null), [refreshKey, customersOn]);
  const util = useMemo(() => (reservationsOn ? getMonthUtilization() : null), [refreshKey, reservationsOn]); // 가동률 (180)
  return { tasks, kpi, util, salesOn };
}

export default function TodayTasksCard({ compact = false, data }: { compact?: boolean; data: TodayTasksData }) {
  const navigate = useNavigate();
  const { tasks, kpi, util, salesOn } = data;
  const [showFormula, setShowFormula] = useState(false);
  const showVisitKpi = !!kpi && kpi.visitors > 0; // 이달 방문이 없으면 "- 0/0명" 칸을 띄우지 않는다 (139 #L8)
  const showUtil = !!util && util.rate !== null && util.bookedMin > 0; // 예약이 하나도 없는 달 초엔 0% 칸을 띄우지 않는다 (180)
  const showKpi = showVisitKpi || showUtil;
  if (tasks.length === 0 && !showKpi) return null;
  const pct = (v: number | null) => (v === null ? '-' : `${v}%`);
  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${compact ? 'p-4' : 'p-5 shadow-sm'}`} data-testid="today-tasks-card">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={compact ? 16 : 18} className="text-[#1a3a8f]" />
        <h3 className="text-sm font-bold text-gray-900">오늘 할 일</h3>
        <span className="text-xs text-gray-500">{tasks.length === 0 ? '밀린 일이 없습니다' : `${tasks.length}가지`}</span>
      </div>
      {tasks.length > 0 && (
        <ul className="divide-y divide-gray-50" aria-label="오늘 할 일">
          {tasks.map(t => (
            <li key={t.key}>
              <button type="button" onClick={() => navigate(t.href)} className="w-full flex items-center gap-3 py-2.5 text-left min-h-[44px] hover:bg-gray-50 rounded-lg px-1">
                <span className={`text-sm font-bold tabular-nums w-10 flex-shrink-0 ${t.tone === 'urgent' ? 'text-rose-700' : 'text-[#1a3a8f]'}`}>{t.count}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-800">{t.label}</span>
                  {t.detail && <span className="block text-xs text-gray-500">{t.detail}</span>}
                </span>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {showKpi && ( /* 고객 모듈이 꺼져 kpi 가 없어도 가동률 타일은 보인다 (182 리뷰 M-1) */
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${tasks.length > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}`} aria-label="이달 운영 지표">
          {showVisitKpi && kpi && (<>
          <div title={KPI_FORMULA.revisit} className="text-center">
            <p className="text-xs text-gray-500">재방문율</p>
            <p className="text-base font-bold text-gray-900 tabular-nums" data-testid="kpi-revisit">{pct(kpi.revisitRate)}</p>
            <p className="text-xs text-gray-500">{kpi.returning}/{kpi.visitors}명</p>
          </div>
          <button type="button" onClick={() => navigate('/customers?norebook=1')} title={`${KPI_FORMULA.rebook} — 누르면 다음 예약이 없는 이달 방문 고객 목록`} aria-label="재예약률 — 다음 예약이 없는 이달 방문 고객 목록 열기" className="text-center rounded-lg hover:bg-gray-50 min-h-[44px] px-1" data-testid="kpi-rebook-link">{/* 숫자에서 바로 "빠진 사람"에게 (184, GAP D-1) */}
            <p className="text-xs text-gray-500">재예약률 <span aria-hidden="true" className="text-gray-400">›</span></p>
            <p className="text-base font-bold text-gray-900 tabular-nums" data-testid="kpi-rebook">{pct(kpi.rebookRate)}</p>
            <p className="text-xs text-gray-500">{kpi.rebooked}/{kpi.visitors}명</p>
          </button>
          {salesOn && (
            <div title={KPI_FORMULA.ticket} className="text-center">
              <p className="text-xs text-gray-500">객단가 <span className="text-gray-400">(현금)</span></p>
              <p className="text-base font-bold text-gray-900 tabular-nums" data-testid="kpi-ticket">{kpi.avgTicket === null ? '-' : `${kpi.avgTicket.toLocaleString('ko-KR')}원`}</p>
              <p className="text-xs text-gray-500">방문 {kpi.visitors}명</p>
            </div>
          )}
          </>)}
          {showUtil && util && (
            <button type="button" onClick={() => navigate('/reservations')} title={`${KPI_FORMULA.util} — 누르면 예약 화면`} aria-label="가동률 — 예약 화면 열기" className="text-center rounded-lg hover:bg-gray-50 min-h-[44px] px-1" data-testid="kpi-util-link">
              <p className="text-xs text-gray-500">가동률 <span aria-hidden="true" className="text-gray-400">›</span></p>
              <p className="text-base font-bold text-gray-900 tabular-nums" data-testid="kpi-util">{util.rate}%</p>
              <p className="text-xs text-gray-500">{formatHours(util.bookedMin)}/{formatHours(util.availableMin)}시간</p>
            </button>
          )}
        </div>
      )}
      {showKpi && (
        <div className="mt-2 text-right">
          <button type="button" onClick={() => setShowFormula(v => !v)} aria-expanded={showFormula} aria-controls="kpi-formulas" className="text-xs text-gray-500 underline decoration-dotted hover:text-gray-700 min-h-[32px] px-1" data-testid="kpi-formula-toggle">
            {showFormula ? '공식 닫기' : '공식 보기'}
          </button>
          {showFormula && (
            <ul id="kpi-formulas" className="mt-1 text-left text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-1" data-testid="kpi-formulas">
              {showVisitKpi && <li>{KPI_FORMULA.revisit}</li>}
              {showVisitKpi && <li>{KPI_FORMULA.rebook}</li>}
              {showVisitKpi && salesOn && <li>{KPI_FORMULA.ticket}</li>}
              {showUtil && <li>{KPI_FORMULA.util}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
