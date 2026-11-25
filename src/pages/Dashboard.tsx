import { HIDE_ON_MOBILE } from '../lib/platform';
import { useAuth } from '../contexts/AuthContext';
import { canDo } from '../lib/permissions';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, CalendarPlus, ClipboardPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Users, Calendar, TrendingUp, Star, Clock, ChevronRight, CheckCircle2, AlertCircle, Package, ShoppingBag, Store, Globe, Apple, Play } from 'lucide-react';
import ChartFallback from '../components/charts/ChartFallback';
const WeeklySalesChart = lazy(() => import('../components/charts/WeeklySalesChart')); // recharts는 첫 화면 번들에서 분리 (2026-11-18)
import { format, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import Header from '../components/layout/Header';
import TodayTasksCard, { useTodayTasks } from '../components/TodayTasksCard';
import { useDataRefreshed } from '../hooks/useDataRefreshed';
import StatCard from '../components/ui/StatCard';
import { formatDate, formatWon, formatPrice, toManwon, todayISO } from '../lib/format';
import { countPaymentUnits } from '../lib/paymentCount';
import { growthPct } from '../lib/growth';
import { isCountableCustomer } from '../lib/customerScope';
import { isLowStock } from '../lib/stockRule';
import RevisitReminderCard from '../components/RevisitReminderCard';
import RetentionNoticeCard from '../components/RetentionNoticeCard';
import ProgramAlertCard from '../components/ProgramAlertCard';
import TomorrowReservationCard from '../components/TomorrowReservationCard';
import DailyCloseCard from '../components/DailyCloseCard';
import BirthdayCard from '../components/BirthdayCard';
import PendingCompletionCard from '../components/PendingCompletionCard';
import SetupChecklistCard from '../components/SetupChecklistCard';
import { StatusBadge, SourceBadge } from '../components/ui/Badge';
import { PaymentStore, CustomerStore, ProductStore, ReservationStore } from '../lib/store';
import { useFeature } from '../hooks/useFeature';
import { useScreenPinLocked } from '../hooks/useScreenPin';

// 코어 PaymentStore.getDailyData()는 toISOString() 기반 UTC 날짜 키라
// KST 0~9시에 당일 매출이 빠짐 — 코어 수정 금지이므로 페이지에서
// 로컬 날짜 기준으로 동일 로직(완료 결제만, 시술/제품/합계) 재집계
function getLocalDailyData(days: number) {
  const all = PaymentStore.getAll();
  const result: { date: string; treatment: number; product: number; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = format(d, 'yyyy-MM-dd'); // date-fns format은 로컬 기준
    const dayPayments = all.filter(p => p.paymentDate === dateStr && p.status === 'completed');
    result.push({
      date: dateStr,
      treatment: dayPayments.filter(p => p.type === 'program' || p.type === 'single_treatment').reduce((s, p) => s + p.amount, 0),
      product: dayPayments.filter(p => p.type === 'product').reduce((s, p) => s + p.amount, 0),
      total: dayPayments.reduce((s, p) => s + p.amount, 0),
    });
  }
  return result;
}

function getDashboardData() {
  // 자정을 넘겨도 정확하도록 매 호출마다 오늘 날짜 계산
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const thisMonthStr = format(new Date(), 'yyyy-MM');
  const customers = CustomerStore.getAll();
  const products = ProductStore.getAll();

  // This month summary
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd'); // 매출 화면과 같은 '이달 전체' — 미리 입력한 결제도 같은 숫자로 (금액 감사 2026-11-20)
  const thisMonth = PaymentStore.summarize(monthStart, monthEnd);
  const thisMonthCount = countPaymentUnits(PaymentStore.getByDateRange(monthStart, monthEnd).filter(p => p.status === 'completed')); // 분할 결제 2행 = 1건

  // Last month summary
  const lastMonthDate = subMonths(new Date(), 1);
  const lastMonthStart = format(startOfMonth(lastMonthDate), 'yyyy-MM-dd');
  const lastMonthEnd = format(endOfMonth(lastMonthDate), 'yyyy-MM-dd');
  const lastMonth = PaymentStore.summarize(lastMonthStart, lastMonthEnd);

  // 지난달 매출 0이면 성장률 계산 불가 — null로 두고 배지 숨김 (0% 오표시 방지)
  const revenueGrowth = growthPct(thisMonth.totalRevenue, lastMonth.totalRevenue); // 매출 화면과 같은 규칙 (10차 #M9)

  // Weekly chart data (last 7 days) — 로컬 날짜 기준 자체 집계 (UTC 함정 우회)
  const weeklyRaw = getLocalDailyData(7);
  const weeklyData = weeklyRaw.map(d => ({
    date: format(new Date(d.date + 'T12:00:00'), 'M/d', { locale: ko }),
    시술: toManwon(d.treatment), // 소수 1자리 — 하루 1건(4만 8천)이 0 또는 5 로 보이지 않게 (10차 #L2)
    제품: toManwon(d.product),
  }));

  // Customers
  const countable = customers.filter(isCountableCustomer); // 샘플·익명화 고객 제외 — 생일·리마인더·마감과 같은 기준 (10차 #M7)
  const totalCustomers = countable.length;
  // registeredAt는 UTC ISO — 자정~오전 9시(KST) 등록이 전달로 새지 않게 로컬 월로 비교 (정합성 감사 2026-11-19)
  const newThisMonth = countable.filter(c => { const d = new Date(c.registeredAt); return !Number.isNaN(d.getTime()) && format(d, 'yyyy-MM') === thisMonthStr; }).length;
  const vipCount = countable.filter(c => c.grade === 'VIP').length;
  const totalPercent = totalCustomers > 0 ? Math.round((vipCount / totalCustomers) * 100) : 0;

  // Low stock
  const lowStockProducts = products.filter(isLowStock); // 제품 화면 헤더·필터와 같은 규칙 (10차 #M6)

  // Today's reservations (목록엔 전부 표시, 건수 집계는 취소/노쇼 제외)
  const todayReservations = ReservationStore.getByDate(todayStr);
  const todayActiveReservations = todayReservations.filter(r => r.status !== 'cancelled' && r.status !== 'noshow');
  // 부제: 완료 · 남은(활성 중 미완료) · 노쇼 — 새 예약은 '예약확정'이라 '대기'만 세던 부제는 늘 0건이었다 (리뷰 2026-11-19)
  const todayDone = todayReservations.filter(r => r.status === 'completed').length;
  const todayNoShow = todayReservations.filter(r => r.status === 'noshow').length;
  const todaySummary = `완료 ${todayDone}건 · 남은 ${todayActiveReservations.length - todayDone}건 · 노쇼 ${todayNoShow}건`;

  // Recent payments (last 5)
  const recentPayments = PaymentStore.getByDateRange(
    format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
    todayStr
  )
    .filter(p => p.status === 'completed')
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || (b.createdAt || '').localeCompare(a.createdAt || '')) // 같은 날은 최근 등록 순 (UX 점검 2026-11-19)
    .slice(0, 5);

  return {
    thisMonth, thisMonthCount, lastMonth, revenueGrowth,
    weeklyData,
    totalCustomers, newThisMonth, vipCount, totalPercent,
    lowStockProducts,
    todayReservations,
    todayActiveReservations,
    todaySummary,
    recentPayments,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(() => getDashboardData());

  // 어드민이 끈 모듈의 데이터·링크는 대시보드에서도 숨긴다 (게이트 화면 dead-end 방지)
  const { user } = useAuth();
  const moneyPinLocked = useScreenPinLocked('/sales'); // 매출 화면을 PIN 으로 잠갔으면 금액 카드도 가린다 — 게이트 우회 차단 (224, 218 리뷰 H-3)
  const salesOn = useFeature('module.sales') && canDo(user?.role, 'sales.view') && !moneyPinLocked; // 직원 계정은 매출 화면과 함께 금액 카드도 보지 않는다 (13차 #M14)
  const reservationsOn = useFeature('module.reservations');
  const customersOn = useFeature('module.customers');
  const productsOn = useFeature('module.products');
  const treatmentsOn = useFeature('module.treatments');
  // 빠른 작업 — 매장에서 가장 잦은 세 동작을 홈에서 한 번에 (대상 화면이 ?new=1 로 등록 모달을 연다, 2026-11-17)
  const quickActions = [
    customersOn && { label: '고객 추가', icon: <UserPlus size={18} />, to: '/customers?new=1', cls: 'bg-[#1a3a8f] text-white' },
    reservationsOn && { label: '예약 추가', icon: <CalendarPlus size={18} />, to: '/reservations?new=1', cls: 'bg-white border border-gray-200 text-gray-800 hover:bg-gray-50' },
    treatmentsOn && { label: '시술 기록', icon: <ClipboardPlus size={18} />, to: '/treatments?new=1', cls: 'bg-white border border-gray-200 text-gray-800 hover:bg-gray-50' },
  ].filter(Boolean) as { label: string; icon: ReactNode; to: string; cls: string }[];

  // 다른 페이지에서 CRUD 후 돌아오거나 창에 포커스가 돌아오면 최신 데이터로 재계산 (stale 방지)
  const [refreshKey, setRefreshKey] = useState(0); // 포커스/가시성 복귀 때 알림 카드(회차권·내일 예약)도 다시 계산
  const todayTasks = useTodayTasks(refreshKey); // 모바일·PC 카드가 한 결과를 나눠 쓴다 (178 리뷰 M-2)
  const refresh = () => { setData(getDashboardData()); setRefreshKey(k => k + 1); };
  useEffect(() => {
    refresh(); // 마운트 시 최신화
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  useDataRefreshed(refresh); // 다른 기기의 변경이 서버에서 다시 읽혔을 때 (16차 #H3)
  useEffect(() => { // 포커스를 잃지 않는 PC 가 자정을 넘기면 "오늘 예약"·마감 요약·완료 누락이 어제 기준으로 남았다 (16차 #L1)
    let day = todayISO();
    const timer = window.setInterval(() => { if (todayISO() !== day) { day = todayISO(); refresh(); } }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const {
    thisMonth, revenueGrowth,
    weeklyData,
    totalCustomers, newThisMonth, vipCount, totalPercent,
    lowStockProducts,
    todayReservations,
    todayActiveReservations,
    todaySummary,
    recentPayments, thisMonthCount,
  } = data;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="대시보드" subtitle="오늘의 현황을 확인하세요" />

      {/* ── 모바일 뷰 (< lg) ─────────────────────────────────── */}
      <div className="block lg:hidden px-4 py-3 space-y-4">
        {quickActions.length > 0 && (
          <div className="grid grid-cols-3 gap-2" aria-label="빠른 작업">
            {quickActions.map(a => (
              <button key={a.to} onClick={() => navigate(a.to)} className={`${a.cls} rounded-xl py-3 flex flex-col items-center gap-1 text-xs font-semibold active:scale-95 transition`}>
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        )}
        {/* 첫 설정 체크리스트 — 할 일이 남은 새 매장에만 보인다 */}
        <SetupChecklistCard refreshKey={refreshKey} />
        {/* 오늘 할 일 + 이달 운영 지표 — 알림 카드들을 행동 목록으로 (138) */}
        <TodayTasksCard compact data={todayTasks} />
        {/* StatCards 2열 */}
        <div className="grid grid-cols-2 gap-3 [&>:last-child:nth-child(odd)]:col-span-2"> {/* 직원은 카드 3장 — 마지막 반 칸 공백 대신 전폭 (15차 #M12) */}
          {salesOn && (
            <button type="button" onClick={() => navigate('/sales')} data-testid="stat-card" className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-left active:bg-slate-50">
              <p className="text-xs text-gray-500">이번 달 총 매출</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{formatWon(thisMonth.totalRevenue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{revenueGrowth === null ? '전월 매출 없음' : `전월 대비 ${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}%`}</p>
            </button>
          )}
          {reservationsOn && (
            <button type="button" onClick={() => navigate('/reservations')} data-testid="stat-card" className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-left active:bg-slate-50">
              <p className="text-xs text-gray-500">오늘 예약</p>
              <p className="text-lg font-bold text-gray-900 mt-1" data-testid="stat-value">{todayActiveReservations.length}건</p>
              <p className="text-xs text-gray-400 mt-0.5" data-testid="stat-subtitle">{todaySummary}</p>
            </button>
          )}
          {customersOn && (
            <button type="button" onClick={() => navigate('/customers')} data-testid="stat-card" className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-left active:bg-slate-50">
              <p className="text-xs text-gray-500">전체 고객</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{totalCustomers}명</p>
              <p className="text-xs text-gray-400 mt-0.5">이번 달 신규 {newThisMonth}명</p>
            </button>
          )}
          {customersOn && (
            <button type="button" onClick={() => navigate('/customers?grade=VIP')} data-testid="stat-card" className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-left active:bg-slate-50">
              <p className="text-xs text-gray-500">VIP 고객</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{vipCount}명</p>
              <p className="text-xs text-gray-400 mt-0.5">전체의 {totalPercent}%</p>
            </button>
          )}
        </div>

        {/* 오늘 예약 현황 */}
        {reservationsOn && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-gray-900">오늘 예약 현황</p>
            <button
              onClick={() => navigate('/reservations')}
              className="text-xs text-[#1a3a8f] font-medium min-h-[44px] -my-2 px-2 -mx-2 flex items-center"
            >
              전체보기 &rsaquo;
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-gray-50">
            {todayReservations.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                <Calendar size={24} className="mx-auto mb-2 text-slate-300" />
                오늘 예약이 없습니다
                <button onClick={() => navigate('/reservations?new=1')} className="inline-flex items-center mt-1 px-3 min-h-[44px] text-xs font-medium text-[#1a3a8f]">예약 추가하기</button>
              </div>
            ) : (
              <>{todayReservations.slice(0, 5).map(r => (
                <button key={r.id} onClick={() => navigate(`/reservations?open=${r.id}`)} className="w-full text-left flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-sm font-bold text-[#1a3a8f]">{r.startTime}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.customerName}</p>
                    <p className="text-xs text-slate-600 truncate">{r.services.map(s => s.serviceName).join(', ')} · {r.staffName}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </button>
              ))}
              {/* 바쁜 날 오후 예약이 조용히 잘리지 않게 — 5건 넘으면 남은 수와 전체보기 (3차 UX 점검 2026-11-19) */}
              {todayReservations.length > 5 && (
                <button type="button" onClick={() => navigate('/reservations')} className="w-full px-4 py-2.5 text-xs font-medium text-[#1a3a8f] text-center hover:bg-blue-50">
                  외 {todayReservations.length - 5}건 · 전체보기
                </button>
              )}</>
            )}
          </div>
        </div>
        )}

        {/* 행동이 필요한 카드 — 회차권 임박·보존기간 경과·재방문 리마인더. 차트보다 위(첫 화면 안)에 둔다 (2026-11-17 시각 QA) */}
        <DailyCloseCard compact refreshKey={refreshKey} />
        <PendingCompletionCard compact refreshKey={refreshKey} onSettled={refresh} />
        <TomorrowReservationCard compact refreshKey={refreshKey} />
        <ProgramAlertCard compact refreshKey={refreshKey} />
        <BirthdayCard compact refreshKey={refreshKey} />
        <RetentionNoticeCard compact />
        <RevisitReminderCard compact refreshKey={refreshKey} />

        {/* 주간 매출 차트 */}
        {salesOn && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-sm font-bold text-gray-900 mb-3">주간 매출 현황</p>
          <Suspense fallback={<ChartFallback height={180} />}><WeeklySalesChart data={weeklyData} compact /></Suspense>
        </div>
        )}

        {/* 재고 부족 알림 */}
        {productsOn && lowStockProducts.length > 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-amber-800">재고 부족 알림</p>
              {lowStockProducts.length > 3 && (
                <button type="button" onClick={() => navigate('/products')} className="text-xs font-medium text-amber-700">외 {lowStockProducts.length - 3}개 전체 보기 →</button>
              )}
            </div>
            <div className="space-y-1.5">
              {lowStockProducts.slice(0, 3).map(p => (
                <button key={p.id} type="button" onClick={() => navigate(`/products?stock=${encodeURIComponent(p.id)}`)} aria-label={`${p.name} 재고 ${p.stock}${p.unit} 입고`}
                  className="w-full flex items-center justify-between rounded-lg px-1 py-0.5 hover:bg-amber-100 active:bg-amber-100 text-left">
                  <span className="block text-xs text-amber-900">{p.name}</span>
                  <span className="block text-xs font-bold text-red-600">{p.stock}{p.unit} <span className="font-medium text-amber-700">입고 →</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── 데스크톱 뷰 (lg+) ────────────────────────────────── */}
      <div className="hidden lg:block p-8 space-y-6 flex-1">
        {quickActions.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="빠른 작업">
            {quickActions.map(a => (
              <button key={a.to} onClick={() => navigate(a.to)} className={`${a.cls} rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-sm`}>
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        )}
        {/* 첫 설정 체크리스트 — 할 일이 남은 새 매장에만 보인다 */}
        <SetupChecklistCard refreshKey={refreshKey} />
        {/* 오늘 할 일 + 이달 운영 지표 — 알림 카드들을 행동 목록으로 (138) */}
        <TodayTasksCard data={todayTasks} />
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 [&:has(>:last-child:nth-child(3))]:lg:grid-cols-3 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1">
          {salesOn && (
          <button type="button" className="text-left w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" onClick={() => navigate('/sales')}>
            <StatCard
              title="이번 달 총 매출"
              value={formatWon(thisMonth.totalRevenue)}
              subtitle={revenueGrowth === null ? '전월 매출 없음' : `전월 대비 ${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}%`}
              icon={<TrendingUp size={20} />}
              trend={revenueGrowth === null ? undefined : { value: revenueGrowth, label: '전월 대비' }}
              accent="primary"
            />
          </button>
          )}
          {reservationsOn && (
          <button type="button" className="text-left w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" onClick={() => navigate('/reservations')}>
            <StatCard
              title="오늘 예약"
              value={`${todayActiveReservations.length}건`}
              subtitle={todaySummary}
              icon={<Calendar size={20} />}
              accent="pink"
            />
          </button>
          )}
          {customersOn && (
          <button type="button" className="text-left w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" onClick={() => navigate('/customers')}>
            <StatCard
              title="전체 고객"
              value={`${totalCustomers}명`}
              subtitle={`이번 달 신규 ${newThisMonth}명`}
              icon={<Users size={20} />}
              accent="blue"
            />
          </button>
          )}
          {customersOn && (
          <button type="button" className="text-left w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" onClick={() => navigate('/customers?grade=VIP')}>
            <StatCard
              title="VIP 고객"
              value={`${vipCount}명`}
              subtitle={`전체의 ${totalPercent}%`}
              icon={<Star size={20} />}
              accent="orange"
            />
          </button>
          )}
        </div>

        {/* Revenue Breakdown — 매출 데이터라 module.sales 게이트 */}
        {salesOn && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <button type="button" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 text-left w-full cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" onClick={() => navigate('/sales')}>
            <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={22} className="text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">시술 매출 (이번 달)</p>
              <p className="text-xl font-bold text-gray-900">{formatWon(thisMonth.treatmentRevenue)}</p>
            </div>
          </button>
          <button type="button" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 text-left w-full cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" onClick={() => navigate(productsOn ? '/products' : '/sales')}>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package size={22} className="text-[#1a3a8f]" />
            </div>
            <div>
              <p className="text-xs text-gray-500">홈케어 판매 (이번 달)</p>
              <p className="text-xl font-bold text-gray-900">{formatWon(thisMonth.productRevenue)}</p>
            </div>
          </button>
          <button type="button" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 text-left w-full cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" onClick={() => navigate('/sales')}>
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingUp size={22} className="text-green-700" />
            </div>
            <div>
              <p className="text-xs text-gray-500">결제 건수 (이번 달)</p>
              <p className="text-xl font-bold text-gray-900">{thisMonthCount}건</p>
            </div>
          </button>
        </div>
        )}

        {/* 트로이몰 바로가기 — 링크는 Electron setWindowOpenHandler가 외부 브라우저로 위임 */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
              <Store size={22} className="text-[#1a3a8f]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">트로이몰에서 제품 구매</p>
              <p className="text-xs text-gray-600 mt-0.5">홈케어·시술 제품을 온라인몰과 앱에서 바로 주문하세요</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://www.troimall.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a3a8f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#15306e] transition-colors"
            >
              <Globe size={14} /> 트로이몰 웹사이트
            </a>
            {!HIDE_ON_MOBILE.storeLinks && (<>
            <a
              href="https://play.google.com/store/apps/details?id=com.troimall"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-blue-200 px-3.5 py-2 text-xs font-semibold text-[#1a3a8f] hover:bg-blue-100 transition-colors"
            >
              <Play size={14} /> Google Play
            </a>
            <a
              href="https://apps.apple.com/kr/app/%ED%8A%B8%EB%A1%9C%EC%9D%B4%EB%AA%B0/id1488430207"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-blue-200 px-3.5 py-2 text-xs font-semibold text-[#1a3a8f] hover:bg-blue-100 transition-colors"
            >
              <Apple size={14} /> App Store
            </a>
            </>)}
          </div>
        </div>

        {salesOn && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-gray-900">주간 매출 현황</h3>
                <p className="text-xs text-gray-400 mt-0.5">최근 7일 · 시술 + 홈케어 (만원)</p>
              </div>
            </div>
            <Suspense fallback={<ChartFallback height={200} />}><WeeklySalesChart data={weeklyData} /></Suspense>
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">최근 결제</h3>
              <button onClick={() => navigate('/sales')} className="flex items-center gap-1 text-xs text-[#1a3a8f] hover:text-[#152d6e] font-medium">
                전체보기 <ChevronRight size={13} />
              </button>
            </div>
            {recentPayments.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                결제 기록이 없습니다
                <button type="button" onClick={() => navigate('/sales?new=1')} className="block mx-auto mt-2 text-xs font-medium text-[#1a3a8f] hover:underline">결제 등록하기 →</button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map(p => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">{(p.customerName || '?')[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.customerName || '고객'}</p>
                      <p className="text-xs text-gray-400">{formatDate(p.paymentDate)} · {p.typeLabel}</p>
                    </div>
                    <span className="text-xs font-bold text-gray-800 flex-shrink-0">{formatPrice(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Today's Reservations — items-start: 예약 1건일 때 오른쪽 열 높이만큼 카드가 늘어나 빈 공간이 생기지 않게 (2026-11-18 시각 QA) */}
          {reservationsOn && (
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
              <h3 className="text-sm font-bold text-gray-900">오늘 예약 현황</h3>
              <button onClick={() => navigate('/reservations')} className="flex items-center gap-1 text-xs text-[#1a3a8f] hover:text-[#152d6e] font-medium">
                전체보기 <ChevronRight size={13} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {todayReservations.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  오늘 예약이 없습니다
                  <button type="button" onClick={() => navigate('/reservations?new=1')} className="block mx-auto mt-2 text-xs font-medium text-[#1a3a8f] hover:underline">예약 추가하기 →</button>
                </div>
              ) : (
                todayReservations.map(r => (
                  <button type="button" key={r.id} onClick={() => navigate(`/reservations?open=${r.id}`)} className="w-full text-left flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition-colors cursor-pointer">
                    <div className="text-center w-14 flex-shrink-0">
                      <p className="text-sm font-bold text-[#1a3a8f]">{r.startTime}</p>
                      <p className="text-xs text-gray-400">{r.endTime}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">{(r.customerName || '?')[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{r.customerName}</p>
                        <SourceBadge source={r.source} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{r.services.map(s => s.serviceName).join(', ')} · {r.staffName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-800">{formatPrice(r.totalPrice)}</p>
                      <StatusBadge status={r.status} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          )}

          {/* Alerts — 오늘 타임라인(reservationsOn)·재고 카드(productsOn)가 늘 있어 이 열은 비지 않는다 (123~126 리뷰 #M1: 15차 #M11 의 "빈 열" 전제는 틀렸다) */}
          <div className="space-y-4">
            {/* 오늘 마감 요약 — 복사/공유 (2026-11-17) */}
            <DailyCloseCard refreshKey={refreshKey} />
            {/* 완료 처리 누락 예약 — 방문 통계·실적 누수 방지 (2026-11-18) */}
            <PendingCompletionCard refreshKey={refreshKey} onSettled={refresh} />
            {/* 내일 예약 안내 — 노쇼 방지 (2026-11-17) */}
            <TomorrowReservationCard refreshKey={refreshKey} />
            {/* 회차권 소진·만료 임박 — 재구매 안내 (2026-11-17) */}
            <ProgramAlertCard refreshKey={refreshKey} />
            {/* 생일 임박 고객 — 축하 안내 (2026-11-17) */}
            <BirthdayCard refreshKey={refreshKey} />
            {/* 개인정보 보존기간 경과 (P4) */}
            <RetentionNoticeCard />
            {/* 재방문 리마인더 (킬러③) */}
            <RevisitReminderCard refreshKey={refreshKey} />

            {/* Low Stock Alert */}
            {productsOn && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
                <AlertCircle size={15} className="text-orange-700" />
                <h3 className="text-sm font-bold text-gray-900">재고 부족 알림</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {lowStockProducts.length === 0 ? (
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 size={14} />
                      <span className="text-xs font-medium">재고 정상</span>
                    </div>
                  </div>
                ) : (
                  lowStockProducts.map(p => (
                    <button key={p.id} type="button" onClick={() => navigate(`/products?stock=${encodeURIComponent(p.id)}`)} aria-label={`${p.name} 재고 ${p.stock}${p.unit} 입고`}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-50/60 text-left" title="입고 창 열기">
                      <span className="block">
                        <span className="block text-xs font-semibold text-gray-800">{p.name}</span>
                        <span className="block text-xs text-gray-400">{p.category}</span>
                      </span>
                      <span className="block text-right">
                        <span className="block text-xs font-bold text-red-600">{p.stock}{p.unit}</span>
                        <span className="block text-xs text-gray-400">최소 {p.minStock}{p.unit} · <span className="text-[#1a3a8f] font-medium">입고</span></span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
            )}

            {/* Today's Timeline */}
            {reservationsOn && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
                <Clock size={15} className="text-[#1a3a8f]" />
                <h3 className="text-sm font-bold text-gray-900">오늘 타임라인</h3>
              </div>
              <div className="px-5 py-3 space-y-2">
                {todayReservations.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">오늘 예약이 없습니다 — <button type="button" onClick={() => navigate('/reservations?new=1')} className="font-medium text-[#1a3a8f] hover:underline">예약 추가</button></p>
                ) : (
                  todayReservations.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-[#1a3a8f] w-10 flex-shrink-0">{r.startTime}</span>
                      <div className="flex-1 bg-blue-50 rounded-lg px-3 py-1.5">
                        <p className="text-xs font-semibold text-gray-800">{r.customerName}</p>
                        <p className="text-xs text-gray-400">{r.staffName}</p>
                      </div>
                    </div>
                  ))
                )}
                {todayReservations.length > 4 && (
                  <button type="button" onClick={() => navigate('/reservations')} className="text-xs font-medium text-[#1a3a8f] hover:underline pt-1">
                    외 {todayReservations.length - 4}건 — 예약표에서 전체 보기
                  </button>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
