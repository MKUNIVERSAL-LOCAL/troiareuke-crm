import { useState, useEffect } from 'react';
import { Building2, Users, LogIn, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getLocalLogs } from '../../lib/loginLog';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Stats {
  totalBranches: number;
  activeBranches: number;
  totalUsers: number;
  todayLogins: number;
  recentLogs: RecentLog[];
}

interface RecentLog {
  id: string;
  email: string;
  branch_name: string | null;
  status: 'success' | 'failed';
  logged_in_at: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalBranches: 0,
    activeBranches: 0,
    totalUsers: 0,
    todayLogins: 0,
    recentLogs: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const today = new Date().toISOString().split('T')[0];

        const [branches, users, allLogs, todayLogs] = await Promise.all([
          supabase.from('branches').select('id, is_active'),
          supabase.from('user_profiles').select('id'),
          supabase.from('login_logs').select('id, email, branch_name, status, logged_in_at').order('logged_in_at', { ascending: false }).limit(20),
          supabase.from('login_logs').select('id', { count: 'exact' }).gte('logged_in_at', today),
        ]);

        setStats({
          totalBranches: branches.data?.length || 0,
          activeBranches: branches.data?.filter(b => b.is_active).length || 0,
          totalUsers: users.data?.length || 0,
          todayLogins: todayLogs.count || 0,
          recentLogs: allLogs.data || [],
        });
      } else {
        // 로컬 데이터 폴백
        const logs = getLocalLogs();
        const today = new Date().toISOString().split('T')[0];
        const todayCount = logs.filter(l => l.logged_in_at.startsWith(today)).length;

        setStats({
          totalBranches: 0,
          activeBranches: 0,
          totalUsers: 0,
          todayLogins: todayCount,
          recentLogs: logs.slice(0, 20).map(l => ({ ...l, branch_name: l.branch_name })),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { label: '전체 지점', value: stats.totalBranches, sub: `운영 중 ${stats.activeBranches}개`, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: '등록 사용자', value: stats.totalUsers, sub: '전체 지점 합계', icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: '오늘 로그인', value: stats.todayLogins, sub: '성공 기준', icon: LogIn, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: '성공률', value: stats.recentLogs.length > 0 ? Math.round((stats.recentLogs.filter(l => l.status === 'success').length / stats.recentLogs.length) * 100) + '%' : '-', sub: '최근 20건 기준', icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">관리자 대시보드</h1>
        <p className="text-slate-400 text-sm mt-1">전체 지점 현황을 한눈에 확인하세요</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {statCards.map(card => (
              <div key={card.label} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                    <card.icon size={18} className={card.color} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{card.value}</p>
                <p className="text-xs font-medium text-slate-300 mt-1">{card.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Recent Login Logs */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">최근 로그인 기록</h2>
              <a href="/admin/login-logs" className="text-xs text-blue-400 hover:text-blue-300">전체 보기 →</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/30">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">이메일</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">지점</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500 text-sm">
                        아직 로그인 기록이 없습니다
                      </td>
                    </tr>
                  ) : (
                    stats.recentLogs.map(log => (
                      <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 text-sm text-slate-300">{log.email}</td>
                        <td className="px-6 py-3 text-sm text-slate-400">{log.branch_name || '—'}</td>
                        <td className="px-6 py-3">
                          {log.status === 'success' ? (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                              <CheckCircle size={12} /> 성공
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                              <XCircle size={12} /> 실패
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-500">
                          {format(parseISO(log.logged_in_at), 'MM/dd HH:mm', { locale: ko })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
