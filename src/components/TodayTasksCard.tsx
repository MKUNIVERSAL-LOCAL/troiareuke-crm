import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeature } from '../hooks/useFeature';
import { canDo } from '../lib/permissions';
import { buildTodayTasks, getMonthlyKpis } from '../lib/todayTasks';

/**
 * 대시보드 "오늘 할 일" + 이달 운영 지표 (138, GAP D-1 — 숫자 나열이 아니라 행동으로 연결되는 대시보드).
 * 각 줄을 누르면 그 고객 목록·화면으로 간다. 지표는 공식을 툴팁으로 보여 "왜 이 숫자인지" 알 수 있게(벤치마크 TOP 20 #15).
 */
export default function TodayTasksCard({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const customersOn = useFeature('module.customers');
  const reservationsOn = useFeature('module.reservations');
  const productsOn = useFeature('module.products');
  const salesOn = useFeature('module.sales') && canDo(user?.role, 'sales.view');
  const tasks = useMemo(() => buildTodayTasks({ customersOn, reservationsOn, productsOn, salesOn }), [refreshKey, customersOn, reservationsOn, productsOn, salesOn]);
  const kpi = useMemo(() => (customersOn ? getMonthlyKpis() : null), [refreshKey, customersOn]);
  const showKpi = !!kpi && kpi.visitors > 0; // 이달 방문이 없으면 "- 0/0명" 칸을 띄우지 않는다 (139 #L8)
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
      {showKpi && kpi && (
        <div className={`grid grid-cols-3 gap-2 ${tasks.length > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}`} aria-label="이달 운영 지표">
          <div title="이달 방문 고객 중 이달 이전에도 방문 기록이 있는 고객 비율" className="text-center">
            <p className="text-xs text-gray-500">재방문율</p>
            <p className="text-base font-bold text-gray-900 tabular-nums" data-testid="kpi-revisit">{pct(kpi.revisitRate)}</p>
            <p className="text-xs text-gray-500">{kpi.returning}/{kpi.visitors}명</p>
          </div>
          <div title="이달 방문 고객 중 다음 예약이 잡힌 고객 비율" className="text-center">
            <p className="text-xs text-gray-500">재예약률</p>
            <p className="text-base font-bold text-gray-900 tabular-nums" data-testid="kpi-rebook">{pct(kpi.rebookRate)}</p>
            <p className="text-xs text-gray-500">{kpi.rebooked}/{kpi.visitors}명</p>
          </div>
          {salesOn && (
            <div title="이달 완료 결제 합 ÷ 이달 방문 고객 수 — 회차권 판매액이 포함된 현금 기준(고객 상세의 실현 매출 객단가와 다름)" className="text-center">
              <p className="text-xs text-gray-500">객단가 <span className="text-gray-400">(현금)</span></p>
              <p className="text-base font-bold text-gray-900 tabular-nums" data-testid="kpi-ticket">{kpi.avgTicket === null ? '-' : `${kpi.avgTicket.toLocaleString('ko-KR')}원`}</p>
              <p className="text-xs text-gray-500">방문 {kpi.visitors}명</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
