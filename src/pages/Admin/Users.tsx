import { useState, useEffect } from 'react';
import { Users, Building2, Search } from 'lucide-react';
import { supabase, isSupabaseConfigured, type Branch } from '../../lib/supabase';
import { isAuthApiConfigured, adminListUsers, adminUpdateUser } from '../../lib/authApi';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  branch_name: string | null;
  is_onboarded: boolean;
  is_active: boolean;
  created_at: string;
}

// 어드민이 계정 관리 시 발급하는 임시 비밀번호 (표시는 1회)
function generateTempPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 12);
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
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      if (isAuthApiConfigured) {
        // NAS 중앙 서버: 전체 계정 목록 (슈퍼어드민 전용 API)
        const list = await adminListUsers();
        setUsers(list.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          branch_name: u.branchName || null,
          is_onboarded: u.isOnboarded,
          is_active: u.isActive !== false,
          created_at: u.createdAt,
        })));
        // 지점 필터는 계정에 등록된 지점명으로 구성
        const branchNames = [...new Set(list.map(u => u.branchName).filter(Boolean))] as string[];
        setBranches(branchNames.map(name => ({ id: name, name } as Branch)));
      } else if (isSupabaseConfigured) {
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
          is_active: true,
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
          is_active: true,
          created_at: u.user.createdAt,
        })));
        setBranches(localBranches);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── NAS 계정 관리 액션 (활성/비활성 · 비밀번호 재설정) ─────────
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function handleToggleActive(user: UserRow) {
    const next = !user.is_active;
    if (!confirm(`${user.email} 계정을 ${next ? '활성화' : '비활성화'}할까요?${next ? '' : ' 비활성화하면 즉시 로그아웃되고 로그인할 수 없습니다.'}`)) return;
    setActionBusy(user.id);
    try {
      await adminUpdateUser(user.id, { isActive: next });
      await loadData();
    } catch (e: any) {
      alert(e?.message || '계정 상태 변경에 실패했습니다.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleResetPassword(user: UserRow) {
    if (!confirm(`${user.email}의 비밀번호를 재설정할까요? 기존 세션은 모두 로그아웃됩니다.`)) return;
    setActionBusy(user.id);
    try {
      const temp = generateTempPassword();
      await adminUpdateUser(user.id, { password: temp });
      alert(`새 임시 비밀번호: ${temp}\n\n지금 복사해서 전달하세요. 이 창을 닫으면 다시 확인할 수 없습니다.`);
    } catch (e: any) {
      alert(e?.message || '비밀번호 재설정에 실패했습니다.');
    } finally {
      setActionBusy(null);
    }
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = users.filter(user => {
    const branchMatches = branchFilter === 'all' || user.branch_name === branchFilter;
    const searchMatches = !normalizedSearch || [
      user.name || '',
      user.email,
      user.branch_name || '',
      roleLabels[user.role]?.label || user.role,
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return branchMatches && searchMatches;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">사용자 관리</h1>
          <p className="text-slate-400 text-sm mt-1">전체 지점의 계정 현황을 확인하세요</p>
        </div>
      </div>

      <div className="relative mb-4 max-w-xl">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="이름, 이메일, 역할, 지점 검색"
          className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
          aria-label="관리자 사용자 검색"
        />
      </div>

      {/* Branch Filter */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 no-scrollbar">
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
          <div className="overflow-auto max-h-[70vh]">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-700/30 bg-slate-900">
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">이름 / 이메일</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">역할</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">소속 지점</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">온보딩</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">가입일</th>
                {isAuthApiConfigured && (
                  <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">관리</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const role = roleLabels[u.role] || roleLabels.staff;
                return (
                  <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-white">
                        {u.name || '(이름 없음)'}
                        {!u.is_active && (
                          <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">비활성</span>
                        )}
                      </p>
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
                    {isAuthApiConfigured && (
                      <td className="px-6 py-4">
                        {u.role === 'superadmin' ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={actionBusy === u.id}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                                u.is_active
                                  ? 'text-red-400 border-red-500/20 hover:bg-red-500/10'
                                  : 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10'
                              }`}
                            >
                              {u.is_active ? '비활성화' : '활성화'}
                            </button>
                            <button
                              onClick={() => handleResetPassword(u)}
                              disabled={actionBusy === u.id}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              비밀번호 재설정
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
