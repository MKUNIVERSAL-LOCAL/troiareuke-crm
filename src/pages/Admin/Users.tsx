import { useState, useEffect } from 'react';
import { Users, Building2 } from 'lucide-react';
import { supabase, isSupabaseConfigured, type Branch } from '../../lib/supabase';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  branch_name: string | null;
  is_onboarded: boolean;
  created_at: string;
}

const roleLabels: Record<string, { label: string; color: string }> = {
  superadmin: { label: '슈퍼어드민', color: 'bg-blue-500/10 text-blue-400' },
  admin: { label: '지점 관리자', color: 'bg-purple-500/10 text-purple-400' },
  staff: { label: '스태프', color: 'bg-slate-500/10 text-slate-400' },
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        // auth.admin.listUsers() 는 service_role 전용 — 프론트에서 직접 호출 금지.
        // 이메일은 user_profiles에 email 컬럼이 있으면 함께 select, 없으면 '—' 처리.
        const [usersRes, branchesRes] = await Promise.all([
          supabase.from('user_profiles')
            .select('id, email, name, role, branch_id, is_onboarded, created_at, branches(name)')
            .order('created_at', { ascending: false }),
          supabase.from('branches').select('*').order('name'),
        ]);

        setUsers((usersRes.data || []).map((u: any) => ({
          id: u.id,
          email: u.email || '—',
          name: u.name,
          role: u.role,
          branch_name: u.branches?.name || null,
          is_onboarded: u.is_onboarded,
          created_at: u.created_at,
        })));
        setBranches(branchesRes.data || []);
      } else {
        // 로컬 폴백
        const localUsers = JSON.parse(localStorage.getItem('troiareuke_local_users') || '[]');
        const localBranches = JSON.parse(localStorage.getItem('troiareuke_branches') || '[]');

        setUsers(localUsers.map((u: any) => ({
          id: u.user.id,
          email: u.email,
          name: u.user.name,
          role: u.user.role,
          branch_name: u.user.branchName || null,
          is_onboarded: u.user.isOnboarded,
          created_at: u.user.createdAt,
        })));
        setBranches(localBranches);
      }
    } finally {
      setLoading(false);
    }
  }

  const filtered = branchFilter === 'all'
    ? users
    : users.filter(u => u.branch_name === branchFilter);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">사용자 관리</h1>
          <p className="text-slate-400 text-sm mt-1">전체 지점의 계정 현황을 확인하세요</p>
        </div>
      </div>

      {/* Branch Filter */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Building2 size={14} className="text-slate-500" />
        <button
          onClick={() => setBranchFilter('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${branchFilter === 'all' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          전체
        </button>
        {branches.map(b => (
          <button
            key={b.id}
            onClick={() => setBranchFilter(b.name)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${branchFilter === b.name ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Users size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">등록된 사용자가 없습니다</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/30">
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">이름 / 이메일</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">역할</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">소속 지점</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">온보딩</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">가입일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const role = roleLabels[u.role] || roleLabels.staff;
                return (
                  <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-white">{u.name || '(이름 없음)'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${role.color}`}>
                        {role.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{u.branch_name || '—'}</td>
                    <td className="px-6 py-4">
                      {u.is_onboarded ? (
                        <span className="text-xs text-emerald-400">완료</span>
                      ) : (
                        <span className="text-xs text-amber-700">미완료</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {format(parseISO(u.created_at), 'yyyy.MM.dd', { locale: ko })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
