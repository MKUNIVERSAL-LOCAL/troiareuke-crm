import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { format, subDays, parseISO, startOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, Users, Building2, LogIn, AlertCircle, RefreshCw } from 'lucide-react';

const PLAN_COLORS: Record<string, string> = {
  trial: '#f59e0b',
  starter: '#3b82f6',
  pro: '#8b5cf6',
  enterprise: '#10b981',
};

export default function Statistics() {
  const [loading, setLoading] = useState(true);
  const [loginTrend, setLoginTrend] = useState<{ date: string; 성공: number; 실패: number }[]>([]);
  const [planDist, setPlanDist] = useState<{ name: string; value: number; color: string }[]>([]);
  const [branchGrowth, setBranchGrowth] = useState<{ date: string; 누적지점: number }[]>([]);
  const [summary, setSummary] = useState({ totalBranches: 0, totalUsers: 0, totalLogins: 0, successRate: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    if (!isSupabaseConfigured) {
      setError('통계 서버가 설정되지 않았습니다. 연동 설정을 확인해 주세요.');
      setLoading(false);
      return;
    }

    const [branches, users, logs] = await Promise.all([
      supabase.from('branches').select('id, plan, created_at, is_active'),
      supabase.from('user_profiles').select('id'),
      supabase.from('login_logs').select('status, logged_in_at').order('logged_in_at', { ascending: true }),
    ]);

    if (branches.error || users.error || logs.error) {
      setError('통계 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setLoading(false);
      return;
    }

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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">통계 / 분석</h1>
        <p className="text-slate-400 text-sm mt-1">전체 서비스 현황을 한눈에 파악하세요</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-slate-900 border border-red-500/20 rounded-2xl p-10 text-center">
          <AlertCircle size={34} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-slate-300">{error}</p>
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-xl"
          >
            <RefreshCw size={14} /> 다시 불러오기
          </button>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* 로그인 추이 (2/3) */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-700/50 rounded-2xl p-4 sm:p-6">
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
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 sm:p-6">
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
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 sm:p-6">
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
