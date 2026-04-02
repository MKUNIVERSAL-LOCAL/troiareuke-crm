import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, TrendingUp, Star, Clock, ChevronRight, CheckCircle2, AlertCircle, Package, ShoppingBag } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { format, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import Header from '../components/layout/Header';
import StatCard from '../components/ui/StatCard';
import { StatusBadge, SourceBadge } from '../components/ui/Badge';
import { PaymentStore, CustomerStore, ProductStore, ReservationStore } from '../lib/store';

const todayStr = format(new Date(), 'yyyy-MM-dd');
const thisMonthStr = format(new Date(), 'yyyy-MM');

function getDashboardData() {
  const customers = CustomerStore.getAll();
  const products = ProductStore.getAll();

  // This month summary
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const thisMonth = PaymentStore.summarize(monthStart, todayStr);

  // Last month summary
  const lastMonthDate = subMonths(new Date(), 1);
  const lastMonthStart = format(startOfMonth(lastMonthDate), 'yyyy-MM-dd');
  const lastMonthEnd = format(endOfMonth(lastMonthDate), 'yyyy-MM-dd');
  const lastMonth = PaymentStore.summarize(lastMonthStart, lastMonthEnd);

  const revenueGrowth = lastMonth.totalRevenue > 0
    ? Math.round(((thisMonth.totalRevenue - lastMonth.totalRevenue) / lastMonth.totalRevenue) * 100)
    : 0;

  // Weekly chart data (last 7 days)
  const weeklyRaw = PaymentStore.getDailyData(7);
  const weeklyData = weeklyRaw.map(d => ({
    date: format(new Date(d.date + 'T12:00:00'), 'M/d', { locale: ko }),
    시술: Math.round(d.treatment / 10000),
    제품: Math.round(d.product / 10000),
  }));

  // Customers
  const totalCustomers = customers.length;
  const newThisMonth = customers.filter(c => c.registeredAt.startsWith(thisMonthStr)).length;
  const vipCount = customers.filter(c => c.grade === 'VIP').length;
  const totalPercent = totalCustomers > 0 ? Math.round((vipCount / totalCustomers) * 100) : 0;

  // Low stock
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);

  // Today's reservations
  const todayReservations = ReservationStore.getByDate(todayStr);

  // Recent payments (last 5)
  const recentPayments = PaymentStore.getByDateRange(
    format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
    todayStr
  )
    .filter(p => p.status === 'completed')
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
    .slice(0, 5);

  return {
    thisMonth, lastMonth, revenueGrowth,
    weeklyData,
    totalCustomers, newThisMonth, vipCount, totalPercent,
    lowStockProducts,
    todayReservations,
    recentPayments,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data] = useState(() => getDashboardData());

  const {
    thisMonth, revenueGrowth,
    weeklyData,
    totalCustomers, newThisMonth, vipCount, totalPercent,
    lowStockProducts,
    todayReservations,
    recentPayments,
  } = data;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="대시보드" subtitle="오늘의 현황을 확인하세요" />

      <div className="p-8 space-y-6 flex-1">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="cursor-pointer" onClick={() => navigate('/sales')}>
            <StatCard
              title="이번 달 총 매출"
              value={`${Math.round(thisMonth.totalRevenue / 10000)}만원`}
              subtitle={`전월 대비 ${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}%`}
              icon={<TrendingUp size={20} />}
              trend={{ value: revenueGrowth, label: '전월 대비' }}
              accent="purple"
            />
          </div>
          <div className="cursor-pointer" onClick={() => navigate('/reservations')}>
            <StatCard
              title="오늘 예약"
              value={`${todayReservations.length}건`}
              subtitle={`완료 ${todayReservations.filter(r => r.status === 'completed').length}건 · 대기 ${todayReservations.filter(r => r.status === 'pending').length}건`}
              icon={<Calendar size={20} />}
              accent="pink"
            />
          </div>
          <div className="cursor-pointer" onClick={() => navigate('/customers')}>
            <StatCard
              title="전체 고객"
              value={`${totalCustomers}명`}
              subtitle={`이번 달 신규 ${newThisMonth}명`}
              icon={<Users size={20} />}
              trend={{ value: newThisMonth, label: '이번 달 신규' }}
              accent="blue"
            />
          </div>
          <div className="cursor-pointer" onClick={() => navigate('/customers')}>
            <StatCard
              title="VIP 고객"
              value={`${vipCount}명`}
              subtitle={`전체의 ${totalPercent}%`}
              icon={<Star size={20} />}
              accent="orange"
            />
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/sales')}>
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={22} className="text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">시술 매출 (이번 달)</p>
              <p className="text-xl font-black text-gray-900">{Math.round(thisMonth.treatmentRevenue / 10000)}만원</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/products')}>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package size={22} className="text-[#1a3a8f]" />
            </div>
            <div>
              <p className="text-xs text-gray-500">홈케어 판매 (이번 달)</p>
              <p className="text-xl font-black text-gray-900">{Math.round(thisMonth.productRevenue / 10000)}만원</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/sales')}>
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingUp size={22} className="text-green-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">결제 건수 (이번 달)</p>
              <p className="text-xl font-black text-gray-900">{thisMonth.paymentCount}건</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-gray-900">주간 매출 현황</h3>
                <p className="text-xs text-gray-400 mt-0.5">최근 7일 · 시술 + 홈케어 (만원)</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="만" />
                <Tooltip
                  formatter={(v, name) => [`${v}만원`, name === '시술' ? '시술 매출' : '홈케어 판매']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: '12px' }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="시술" stackId="a" fill="#1a3a8f" radius={[0, 0, 0, 0]} />
                <Bar dataKey="제품" stackId="a" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
              <div className="py-8 text-center text-gray-400 text-xs">결제 기록이 없습니다</div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map(p => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">{(p.customerName || '?')[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.customerName || '고객'}</p>
                      <p className="text-[10px] text-gray-400">{p.paymentDate} · {p.typeLabel}</p>
                    </div>
                    <span className="text-xs font-bold text-gray-800 flex-shrink-0">{p.amount.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Reservations */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
              <h3 className="text-sm font-bold text-gray-900">오늘 예약 현황</h3>
              <button onClick={() => navigate('/reservations')} className="flex items-center gap-1 text-xs text-[#1a3a8f] hover:text-[#152d6e] font-medium">
                전체보기 <ChevronRight size={13} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {todayReservations.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">오늘 예약이 없습니다</div>
              ) : (
                todayReservations.map(r => (
                  <div key={r.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition-colors">
                    <div className="text-center w-14 flex-shrink-0">
                      <p className="text-sm font-bold text-[#1a3a8f]">{r.startTime}</p>
                      <p className="text-[10px] text-gray-400">{r.endTime}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-400 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">{r.customerName[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{r.customerName}</p>
                        <SourceBadge source={r.source} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{r.services.map(s => s.serviceName).join(', ')} · {r.staffName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-800">{r.totalPrice.toLocaleString()}원</p>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Alerts */}
          <div className="space-y-4">
            {/* Low Stock Alert */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
                <AlertCircle size={15} className="text-orange-500" />
                <h3 className="text-sm font-bold text-gray-900">재고 부족 알림</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {lowStockProducts.length === 0 ? (
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 size={14} />
                      <span className="text-xs font-medium">재고 정상</span>
                    </div>
                  </div>
                ) : (
                  lowStockProducts.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{p.name}</p>
                        <p className="text-[11px] text-gray-400">{p.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-red-500">{p.stock}{p.unit}</p>
                        <p className="text-[10px] text-gray-400">최소 {p.minStock}{p.unit}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Today's Timeline */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
                <Clock size={15} className="text-[#1a3a8f]" />
                <h3 className="text-sm font-bold text-gray-900">오늘 타임라인</h3>
              </div>
              <div className="px-5 py-3 space-y-2">
                {todayReservations.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">오늘 예약이 없습니다</p>
                ) : (
                  todayReservations.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-[#1a3a8f] w-10 flex-shrink-0">{r.startTime}</span>
                      <div className="flex-1 bg-blue-50 rounded-lg px-3 py-1.5">
                        <p className="text-[11px] font-semibold text-gray-800">{r.customerName}</p>
                        <p className="text-[10px] text-gray-400">{r.staffName}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
