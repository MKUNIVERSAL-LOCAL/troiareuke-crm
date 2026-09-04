import { useState, useEffect } from 'react';
import { Users, Building2, Search, UserPlus } from 'lucide-react';
import { supabase, isSupabaseConfigured, type Branch } from '../../lib/supabase';
import { isAuthApiConfigured, adminListUsers, adminUpdateUser, adminCreateUser } from '../../lib/authApi';
import { fetchLatestChannelVersion, isOutdated, appModeLabel } from '../../lib/updateChannel';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
// 로컬(KST) 기준 오늘 — toISOString().slice(0,10)은 UTC라 새벽에 전날로 어긋난다
import { todayISO } from '../../lib/format';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  branch_name: string | null;
  is_onboarded: boolean;
  is_active: boolean;
  service_ends_at: string | null; // 사용기간 만료일 (null = 무제한)
  created_at: string;
  // 프로그램 버전 텔레메트리 (NAS 모드) — 구버전으로 남은 계정을 본사가 먼저 발견
  last_app_version?: string | null;
  last_app_mode?: string | null;
  last_seen_at?: string | null;
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
  const [loadError, setLoadError] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setLoadError('');
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
          service_ends_at: u.serviceEndsAt || null,
          created_at: u.createdAt,
          last_app_version: u.lastAppVersion || null,
          last_app_mode: u.lastAppMode || null,
          last_seen_at: u.lastSeenAt || null,
        })));
        fetchLatestChannelVersion().then(m => setLatestVersion(m?.version || null));
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
          service_ends_at: null,
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
          service_ends_at: null,
          created_at: u.user.createdAt,
        })));
        setBranches(localBranches);
      }
    } catch (e: any) {
      setLoadError(`사용자 목록을 불러오지 못했습니다: ${e?.message || '서버 오류'}`);
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

  // 재설정된 임시 비밀번호 표시 (alert는 텍스트 복사가 안 되는 함정 — 복사 버튼 모달로 대체)
  const [tempPwResult, setTempPwResult] = useState<{ email: string; password: string; invited?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyTempPassword() {
    if (!tempPwResult) return;
    try {
      await navigator.clipboard.writeText(tempPwResult.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 API 실패 시 — 입력칸을 선택 상태로 두어 수동 복사 유도
      const el = document.getElementById('temp-pw-input') as HTMLInputElement | null;
      el?.select();
    }
  }

  async function handleResetPassword(user: UserRow) {
    if (!confirm(`${user.email}의 비밀번호를 재설정할까요? 기존 세션은 모두 로그아웃됩니다.`)) return;
    setActionBusy(user.id);
    try {
      const temp = generateTempPassword();
      await adminUpdateUser(user.id, { password: temp });
      setCopied(false);
      setTempPwResult({ email: user.email, password: temp });
    } catch (e: any) {
      alert(e?.message || '비밀번호 재설정에 실패했습니다.');
    } finally {
      setActionBusy(null);
    }
  }

  // ── 관리자(슈퍼어드민) 초대 ─────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) { alert('초대할 이메일을 입력해주세요.'); return; }
    if (!confirm(`${email} 을(를) 슈퍼어드민(관리자 콘솔 전체 권한)으로 초대할까요?`)) return;
    setInviteBusy(true);
    try {
      const result = await adminCreateUser({ email, name: inviteName.trim() || undefined, role: 'superadmin' });
      setInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setCopied(false);
      if (result.temporaryPassword) {
        setTempPwResult({ email, password: result.temporaryPassword, invited: true });
      }
      await loadData();
    } catch (e: any) {
      alert(e?.message || '관리자 초대에 실패했습니다.');
    } finally {
      setInviteBusy(false);
    }
  }

  // ── 사용기간 수정 모달 ──────────────────────────────────────
  const [periodTarget, setPeriodTarget] = useState<UserRow | null>(null);
  const [periodDate, setPeriodDate] = useState('');
  const [periodBusy, setPeriodBusy] = useState(false);

  function openPeriodModal(user: UserRow) {
    setPeriodTarget(user);
    setPeriodDate(user.service_ends_at ? user.service_ends_at.slice(0, 10) : '');
  }

  async function savePeriod(unlimited: boolean) {
    if (!periodTarget) return;
    if (!unlimited && !periodDate) {
      alert('만료일을 선택하거나 [무제한으로 설정]을 눌러주세요.');
      return;
    }
    const value = unlimited ? null : periodDate;
    if (value && value < todayISO()) {
      if (!confirm('과거 날짜입니다. 저장 즉시 해당 계정이 로그아웃되고 로그인할 수 없게 됩니다. 계속할까요?')) return;
    }
    setPeriodBusy(true);
    try {
      await adminUpdateUser(periodTarget.id, { serviceEndsAt: value });
      setPeriodTarget(null);
      await loadData();
    } catch (e: any) {
      alert(e?.message || '사용기간 변경에 실패했습니다.');
    } finally {
      setPeriodBusy(false);
    }
  }

  function periodStatus(u: UserRow): { label: string; className: string } {
    if (!u.service_ends_at) return { label: '무제한', className: 'text-slate-500' };
    const endDate = u.service_ends_at.slice(0, 10);
    const today = todayISO();
    if (endDate < today) return { label: `${endDate.replace(/-/g, '.')} 만료됨`, className: 'text-red-400 font-semibold' };
    const daysLeft = Math.ceil((new Date(u.service_ends_at).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 14) return { label: `~${endDate.replace(/-/g, '.')} (D-${daysLeft})`, className: 'text-amber-400' };
    return { label: `~${endDate.replace(/-/g, '.')}`, className: 'text-slate-300' };
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
      {/* 임시 비밀번호 결과 모달 — 복사 버튼 포함 */}
      {tempPwResult && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-700">
              <h2 className="text-base font-bold text-white">임시 비밀번호 발급됨</h2>
              <p className="text-xs text-slate-400 mt-1">{tempPwResult.email}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex gap-2">
                <input
                  id="temp-pw-input"
                  readOnly
                  value={tempPwResult.password}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-600 rounded-xl text-base font-mono text-emerald-300 tracking-wider outline-none"
                />
                <button
                  onClick={copyTempPassword}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                >
                  {copied ? '복사됨 ✓' : '복사'}
                </button>
              </div>
              <p className="text-[11px] text-amber-400/90 leading-relaxed">
                {tempPwResult.invited
                  ? '이 창을 닫으면 다시 확인할 수 없습니다. 지금 복사해서 초대한 관리자에게 전달하세요. 첫 로그인 시 비밀번호 변경이 자동으로 강제됩니다.'
                  : '이 창을 닫으면 다시 확인할 수 없습니다. 지금 복사해서 해당 지점에 전달하세요. (첫 로그인 후 비밀번호 변경을 안내해주세요)'}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end">
              <button
                onClick={() => setTempPwResult(null)}
                className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-xl"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사용기간 수정 모달 */}
      {periodTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-700">
              <h2 className="text-base font-bold text-white">사용기간 설정</h2>
              <p className="text-xs text-slate-400 mt-1">{periodTarget.name || ''} · {periodTarget.email}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs font-medium text-slate-400">만료일 (그날 자정까지 사용 가능)</label>
              <input
                type="date"
                value={periodDate}
                onChange={e => setPeriodDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-600 rounded-xl text-sm text-white outline-none focus:border-blue-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {[1, 3, 6, 12].map(months => (
                  <button
                    key={months}
                    onClick={() => {
                      const base = periodDate && periodDate >= todayISO()
                        ? new Date(periodDate) : new Date();
                      base.setMonth(base.getMonth() + months);
                      setPeriodDate(base.toISOString().slice(0, 10));
                    }}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    +{months}개월
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                만료일이 지나면 해당 계정은 로그인할 수 없습니다 (저장된 데이터는 유지).
                무제한으로 설정하면 기간 제한이 해제됩니다.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-2">
              <button
                onClick={() => savePeriod(true)}
                disabled={periodBusy}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                무제한으로 설정
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setPeriodTarget(null)}
                  disabled={periodBusy}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={() => savePeriod(false)}
                  disabled={periodBusy}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                >
                  {periodBusy ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">사용자 관리</h1>
          <p className="text-slate-400 text-sm mt-1">전체 지점의 계정 현황을 확인하세요</p>
        </div>
        {isAuthApiConfigured && (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <UserPlus size={16} />
            관리자 초대
          </button>
        )}
      </div>

      {/* 관리자 초대 모달 */}
      {inviteOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-700">
              <h2 className="text-base font-bold text-white">관리자 초대</h2>
              <p className="text-xs text-slate-400 mt-1">관리자 콘솔 전체 권한(슈퍼어드민) 계정을 발급합니다</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">이메일 *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="invite@example.com"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-600 rounded-xl text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">이름 (선택)</label>
                <input
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-600 rounded-xl text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                발급 즉시 임시 비밀번호가 1회 표시됩니다. 초대받은 관리자는 첫 로그인 시
                비밀번호 변경이 강제되며, 지점 데이터·기능 관리 등 콘솔 전체에 접근할 수 있습니다.
                초대한 기록은 서버 감사 로그에 남습니다.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => setInviteOpen(false)}
                disabled={inviteBusy}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleInvite}
                disabled={inviteBusy}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
              >
                {inviteBusy ? '발급 중…' : '초대 (임시 비밀번호 발급)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loadError && !loading && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-sm text-red-300">
          {loadError}
          <button onClick={loadData} className="ml-3 text-xs underline text-red-200 hover:text-white">다시 시도</button>
        </div>
      )}

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
                {isAuthApiConfigured && (
                  <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">사용기간</th>
                )}
                {isAuthApiConfigured && (
                  <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    프로그램 버전{latestVersion && <span className="ml-1 normal-case text-slate-600">(최신 v{latestVersion})</span>}
                  </th>
                )}
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
                    {isAuthApiConfigured && (
                      <td className="px-6 py-4">
                        {u.role === 'superadmin' ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : (
                          <span className={`text-xs ${periodStatus(u).className}`}>{periodStatus(u).label}</span>
                        )}
                      </td>
                    )}
                    {isAuthApiConfigured && (
                      <td className="px-6 py-4">
                        {!u.last_app_version ? (
                          <span className="text-xs text-slate-600" title="이 계정으로 v1.0.48 이상 프로그램이 서버에 접속한 기록이 없습니다">기록 없음</span>
                        ) : (
                          <div className="text-xs">
                            <span className={isOutdated(u.last_app_version, latestVersion) ? 'font-bold text-red-400' : 'text-emerald-400'}>
                              v{u.last_app_version}
                            </span>
                            {isOutdated(u.last_app_version, latestVersion) && (
                              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">구버전</span>
                            )}
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {appModeLabel[u.last_app_mode || ''] || u.last_app_mode || ''}
                              {u.last_seen_at && ` · ${format(parseISO(u.last_seen_at), 'MM/dd HH:mm', { locale: ko })}`}
                            </p>
                          </div>
                        )}
                      </td>
                    )}
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
                            <button
                              onClick={() => openPeriodModal(u)}
                              disabled={actionBusy === u.id}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                            >
                              사용기간
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
