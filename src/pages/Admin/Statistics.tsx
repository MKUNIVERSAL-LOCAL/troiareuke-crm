import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { isAuthApiConfigured } from '../../lib/authApi';
import { fetchAdminAnalytics, type AdminBranchAnalytics } from '../../lib/adminApi';
import DataBrowser from './DataBrowser';
import { format, subDays, parseISO } from 'date-fns';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, Users, Building2, LogIn, CalendarCheck, Sparkles, RefreshCw } from 'lucide-react';

const PLAN_COLORS: Record<string, string> = {
  trial: '#f59e0b',
  starter: '#3b82f6',
  pro: '#8b5cf6',
  enterprise: '#10b981',
};

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const wonShort = (n: number) =>
  Math.abs(n) >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만` : n.toLocaleString('ko-KR');

export default function Statistics() {
  const [searchParams] = useSearchParams();
  if (searchParams.get('view') === 'data') return <DataBrowser />;
  if (isAuthApiConfigured) return <NasAnalytics />;
  if (isSupabaseConfigured) return <SupabaseStats />;
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">통계 / 분석</h1>
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-8 text-center">
        <p className="text-amber-200 font-bold text-sm">백엔드가 연결되지 않았습니다</p>
        <p className="text-slate-400 text-sm mt-2">중앙 서버(NAS) 연결 후 지점별 통계를 확인할 수 있습니다.</p>
      </div>
    </div>
  );
}

// ── NAS 중앙서버 애널리틱스: 지점별 + 전체 ─────────────────────────────
function NasAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<AdminBranchAnalytics[]>([]);
  const [selected, setSelected] = useState<string>('all');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAdminAnalytics();
      setBranches(result.branches);
    } catch (e: any) {
      setError(e?.message || '통계를 불러오지 못했습니다.');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // 선택된 범위(전체=합산, 지점=단일)의 지표
  const view = useMemo(() => {
    const targets = selected === 'all' ? branches : branches.filter(b => b.branchId === selected);
    const sum = {
      customers: 0, new30d: 0, revenueTotal: 0, refunded: 0, paymentCount: 0,
      resTotal: 0, resCompleted: 0, resUpcoming: 0, treatments: 0,
    };
    const monthly = new Map<string, { revenue: number; refunded: number }>();
    const daily = new Map<string, number>();
    for (const b of targets) {
      sum.customers += b.customers.total;
      sum.new30d += b.customers.new30d;
      sum.revenueTotal += b.revenue.total;
      sum.refunded += b.revenue.refunded;
      sum.paymentCount += b.revenue.paymentCount;
      sum.resTotal += b.reservations.total;
      sum.resCompleted += b.reservations.completed;
      sum.resUpcoming += b.reservations.upcoming;
      sum.treatments += b.treatments;
      for (const m of b.revenueMonthly) {
        const cur = monthly.get(m.month) || { revenue: 0, refunded: 0 };
        monthly.set(m.month, { revenue: cur.revenue + m.revenue, refunded: cur.refunded + m.refunded });
      }
      for (const d of b.revenueDaily) {
        daily.set(d.day, (daily.get(d.day) || 0) + d.revenue);
      }
    }
    // 최근 6개월 / 30일 축을 빈 달·빈 날 포함해 채움 (차트 축 왜곡 방지)
    const now = new Date();
    const monthlySeries = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = format(d, 'yyyy-MM');
      const v = monthly.get(key) || { revenue: 0, refunded: 0 };
      return { month: format(d, 'M월'), 매출: v.revenue, 환불: v.refunded };
    });
    const dailySeries = Array.from({ length: 30 }, (_, i) => {
      const d = subDays(now, 29 - i);
      const key = format(d, 'yyyy-MM-dd');
      return { date: format(d, 'M/d'), 매출: daily.get(key) || 0 };
    });
    const thisMonthKey = format(now, 'yyyy-MM');
    const thisMonthRevenue = monthly.get(thisMonthKey)?.revenue || 0;
    return { sum, monthlySeries, dailySeries, thisMonthRevenue };
  }, [branches, selected]);

  const selectedName = selected === 'all'
    ? '전체 지점'
    : branches.find(b => b.branchId === selected)?.branchName || '이름 없는 지점';

  const cards = [
    { label: '고객 수', value: view.sum.customers.toLocaleString(), sub: `최근 30일 신규 +${view.sum.new30d}`, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: '누적 매출', value: won(view.sum.revenueTotal), sub: `결제 ${view.sum.paymentCount.toLocaleString()}건 · 환불 ${won(view.sum.refunded)}`, icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: '이번 달 매출', value: won(view.thisMonthRevenue), sub: format(new Date(), 'yyyy년 M월'), icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: '예약', value: `예정 ${view.sum.resUpcoming}건`, sub: `누적 ${view.sum.resTotal}건 · 완료 ${view.sum.resCompleted}건 · 시술기록 ${view.sum.treatments}건`, icon: CalendarCheck, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  const compareData = branches
    .map(b => ({
      name: b.branchName || b.branchId.slice(0, 8),
      매출: b.revenue.total,
      고객: b.customers.total,
    }))
    .sort((a, b) => b.매출 - a.매출);

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">통계 / 분석</h1>
          <p className="text-slate-400 text-sm mt-1">지점별·전체 매출과 고객 현황 (NAS 중앙서버 실데이터)</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 지점 선택 */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setSelected('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            selected === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700/50'
          }`}
        >
          전체
        </button>
        {branches.map(b => (
          <button
            key={b.branchId}
            onClick={() => setSelected(b.branchId)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              selected === b.branchId ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700/50'
            }`}
          >
            {b.branchName || b.branchId.slice(0, 8)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
          <p className="text-red-300 font-bold text-sm">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-slate-800 text-white text-sm rounded-xl">다시 시도</button>
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-10 text-center text-slate-500 text-sm">
          아직 지점 데이터가 없습니다. 지점 계정이 로그인해 데이터를 저장하면 여기에 표시됩니다.
        </div>
      ) : (
        <>
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">{selectedName}</p>

          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {cards.map(c => (
              <div key={c.label} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-4`}>
                  <c.icon size={18} className={c.color} />
                </div>
                <p className="text-xl font-bold text-white truncate" title={c.value}>{c.value}</p>
                <p className="text-xs text-slate-400 mt-1">{c.label}</p>
                <p className="text-[11px] text-slate-500 mt-1 truncate" title={c.sub}>{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* 월별 매출 */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">최근 6개월 매출</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={view.monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={wonShort} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number) => won(v)}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="환불" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 일별 매출 */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">최근 30일 일별 매출</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={view.dailySeries}>
                  <defs>
                    <linearGradient id="dailyRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tickFormatter={wonShort} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number) => won(v)}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="매출" stroke="#3b82f6" fill="url(#dailyRev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 전체 보기: 지점 간 비교 */}
          {selected === 'all' && branches.length > 0 && (
            <>
              {branches.length > 1 && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 mb-6">
                  <h2 className="text-sm font-bold text-white mb-6">지점별 누적 매출 비교</h2>
                  <ResponsiveContainer width="100%" height={Math.max(160, compareData.length * 44)}>
                    <BarChart data={compareData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                      <XAxis type="number" tickFormatter={wonShort} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => won(v)}
                        contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                      />
                      <Bar dataKey="매출" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50">
                  <h2 className="text-sm font-bold text-white">지점별 상세</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                      <th className="px-6 py-3 font-semibold">지점</th>
                      <th className="px-4 py-3 font-semibold text-right">고객</th>
                      <th className="px-4 py-3 font-semibold text-right">신규(30일)</th>
                      <th className="px-4 py-3 font-semibold text-right">누적 매출</th>
                      <th className="px-4 py-3 font-semibold text-right">예약(예정)</th>
                      <th className="px-6 py-3 font-semibold text-right">시술기록</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map(b => (
                      <tr
                        key={b.branchId}
                        onClick={() => setSelected(b.branchId)}
                        className="border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-3 text-white font-semibold">{b.branchName || b.branchId.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{b.customers.total.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-emerald-400">+{b.customers.new30d}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{won(b.revenue.total)}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{b.reservations.upcoming}</td>
                        <td className="px-6 py-3 text-right text-slate-300">{b.treatments}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── (레거시) Supabase 백엔드 서비스 지표 ───────────────────────────────
function SupabaseStats() {
  const [loading, setLoading] = useState(true);
  const [loginTrend, setLoginTrend] = useState<{ date: string; 성공: number; 실패: number }[]>([]);
  const [planDist, setPlanDist] = useState<{ name: string; value: number; color: string }[]>([]);
  const [branchGrowth, setBranchGrowth] = useState<{ date: string; 누적지점: number }[]>([]);
  const [summary, setSummary] = useState({ totalBranches: 0, totalUsers: 0, totalLogins: 0, successRate: 0 });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);

    const [branches, users, logs] = await Promise.all([
      supabase.from('branches').select('id, plan, created_at, is_active'),
      supabase.from('user_profiles').select('id'),
      supabase.from('login_logs').select('status, logged_in_at').order('logged_in_at', { ascending: true }),
    ]);

    // 요약
    const totalLogins = logs.data?.length || 0;
    const successLogins = logs.data?.filter(l => l.status === 'success').length || 0;
    setSummary({
      totalBranches: branches.data?.filter(b => b.is_active).length || 0,
      totalUsers: users.data?.length || 0,
      totalLogins,
      successRate: totalLogins > 0 ? Math.round((successLogins / totalLogins) * 100) : 0,
    });

    // 최근 14일 로그인 추이
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = subDays(new Date(), 13 - i);
      return format(d, 'MM/dd');
    });
    const trendMap: Record<string, { 성공: number; 실패: number }> = {};
    days.forEach(d => { trendMap[d] = { 성공: 0, 실패: 0 }; });
    logs.data?.forEach(l => {
      const d = format(parseISO(l.logged_in_at), 'MM/dd');
      if (trendMap[d]) {
        if (l.status === 'success') trendMap[d].성공++;
        else trendMap[d].실패++;
      }
    });
    setLoginTrend(days.map(d => ({ date: d, ...trendMap[d] })));

    // 플랜 분포
    const planCount: Record<string, number> = {};
    branches.data?.forEach(b => { planCount[b.plan] = (planCount[b.plan] || 0) + 1; });
    const planLabels: Record<string, string> = { trial: '무료체험', starter: '스타터', pro: '프로', enterprise: '엔터프라이즈' };
    setPlanDist(Object.entries(planCount).map(([k, v]) => ({
      name: planLabels[k] || k,
      value: v,
      color: PLAN_COLORS[k] || '#64748b',
    })));

    // 지점 누적 증가
    const sorted = [...(branches.data || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const growthMap: Record<string, number> = {};
    sorted.forEach(b => {
      const d = format(parseISO(b.created_at), 'MM/dd');
      growthMap[d] = (growthMap[d] || 0) + 1;
    });
    let cum = 0;
    const growthData = Object.entries(growthMap).map(([date, count]) => {
      cum += count;
      return { date, 누적지점: cum };
    });
    setBranchGrowth(growthData);

    setLoading(false);
  }

  const statCards = [
    { label: '활성 지점', value: summary.totalBranches, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: '전체 사용자', value: summary.totalUsers, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: '전체 로그인', value: summary.totalLogins.toLocaleString(), icon: LogIn, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: '로그인 성공률', value: summary.successRate + '%', icon: TrendingUp, color: 'text-amber-700', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">통계 / 분석</h1>
        <p className="text-slate-400 text-sm mt-1">전체 서비스 현황을 한눈에 파악하세요</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {statCards.map(c => (
              <div key={c.label} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-4`}>
                  <c.icon size={18} className={c.color} />
                </div>
                <p className="text-2xl font-bold text-white">{c.value}</p>
                <p className="text-xs text-slate-400 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-6 mb-6">
            {/* 로그인 추이 (2/3) */}
            <div className="col-span-2 bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">최근 14일 로그인 추이</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={loginTrend}>
                  <defs>
                    <linearGradient id="success" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fail" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Area type="monotone" dataKey="성공" stroke="#10b981" fill="url(#success)" strokeWidth={2} />
                  <Area type="monotone" dataKey="실패" stroke="#ef4444" fill="url(#fail)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 플랜 분포 (1/3) */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">플랜 분포</h2>
              {planDist.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-600 text-sm">데이터 없음</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={planDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                        {planDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {planDist.map(p => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                          <span className="text-slate-400">{p.name}</span>
                        </div>
                        <span className="text-white font-bold">{p.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 지점 누적 증가 */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-white mb-6">지점 누적 증가 추이</h2>
            {branchGrowth.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-slate-600 text-sm">지점 데이터가 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={branchGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="누적지점" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
