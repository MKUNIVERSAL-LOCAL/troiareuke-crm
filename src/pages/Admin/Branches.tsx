import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Building2, Info, Search } from 'lucide-react';
import { supabase, isSupabaseConfigured, type Branch } from '../../lib/supabase';
import { createBranchAdmin, type AdminApiResult } from '../../lib/adminApi';
import { isAuthApiConfigured, adminListUsers, adminUpdateUser, type AuthApiUser } from '../../lib/authApi';

// NAS 모드에서는 지점의 진실이 서버 계정(auth_users)의 branch_id/branch_name이다.
// 기존처럼 localStorage를 읽으면 기기마다 목록이 달라지는 문제가 있어 서버에서 파생한다.
const NAS_MODE = isAuthApiConfigured;
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

const planLabels: Record<string, { label: string; color: string }> = {
  trial: { label: '무료체험', color: 'bg-amber-500/10 text-amber-700' },
  starter: { label: '스타터', color: 'bg-blue-500/10 text-blue-400' },
  pro: { label: '프로', color: 'bg-purple-500/10 text-purple-400' },
  enterprise: { label: '엔터프라이즈', color: 'bg-emerald-500/10 text-emerald-400' },
};

const shopTypes = ['피부관리실', '에스테틱샵', '메디컬 에스테틱', '홈케어 에스테틱', '스파 에스테틱', '기타'];

interface BranchForm {
  name: string;
  address: string;
  phone: string;
  shop_type: string;
  plan: string;
  admin_email: string;
}

const emptyForm: BranchForm = {
  name: '', address: '', phone: '', shop_type: '피부관리실',
  plan: 'trial', admin_email: '',
};

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [adminPending, setAdminPending] = useState(false);
  const [adminNotice, setAdminNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => { loadBranches(); }, []);

  const [nasUsersByBranch, setNasUsersByBranch] = useState<Record<string, AuthApiUser[]>>({});

  async function loadBranches() {
    setLoading(true);
    if (NAS_MODE) {
      // 서버 계정 목록에서 지점 파생 (Users 화면과 같은 소스 → 두 화면 목록 일치)
      try {
        const users = await adminListUsers();
        const map: Record<string, AuthApiUser[]> = {};
        for (const u of users.filter(u => u.role !== 'superadmin')) {
          const bid = u.branchId || u.id;
          (map[bid] ||= []).push(u);
        }
        setNasUsersByBranch(map);
        setBranches(Object.entries(map).map(([bid, us]) => {
          const primary = us.find(u => u.role === 'admin') || us[0];
          return {
            id: bid,
            name: primary.branchName || primary.shopName || primary.email,
            address: primary.shopAddress || '',
            phone: primary.shopPhone || '',
            shop_type: primary.shopType || '',
            plan: primary.plan,
            trial_ends_at: primary.trialEndsAt,
            is_active: us.some(u => u.isActive !== false),
            created_at: primary.createdAt,
          } as Branch;
        }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
      } catch (e: any) {
        console.warn('[Branches] NAS 계정 목록 로드 실패:', e?.message);
        setBranches([]);
      }
    } else if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('branches').select('*').order('created_at', { ascending: false });
      if (error) console.warn('[Branches] 로드 실패:', error.message);
      setBranches(data || []);
    } else {
      // 로컬 폴백: localStorage에서 지점 목록 읽기
      try {
        const data = JSON.parse(localStorage.getItem('troiareuke_branches') || '[]');
        setBranches(data);
      } catch { setBranches([]); }
    }
    setLoading(false);
  }

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setError('');
    setAdminNotice('');
    setShowModal(true);
  }

  // 계정 발급 결과 반영. 모달을 열어둬야 하면 true를 반환한다.
  function applyAdminResult(result: AdminApiResult): boolean {
    if (result.pending) {
      setAdminPending(true);
      return true;
    }
    if (!result.ok) {
      setError(`관리자 계정 생성 실패: ${result.reason || '알 수 없는 오류'}`);
      return true;
    }
    if (result.temporaryPassword) {
      setAdminNotice(`관리자 계정이 생성되었습니다. 임시 비밀번호: ${result.temporaryPassword} — 지금 복사해서 전달하세요. 창을 닫으면 다시 확인할 수 없습니다.`);
      return true;
    }
    return false;
  }

  function openEdit(b: Branch) {
    setEditTarget(b);
    setForm({ name: b.name, address: b.address || '', phone: b.phone || '', shop_type: b.shop_type || '', plan: b.plan, admin_email: '' });
    setAdminNotice('');
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('지점명을 입력해주세요.'); return; }
    setSaving(true);
    setError('');
    setAdminPending(false);

    let isPending = false;

    try {
      if (NAS_MODE) {
        if (editTarget) {
          // 서버에는 지점 엔티티가 없어 계정 단위로만 반영 가능 — 플랜 변경만 서버 적용
          const users = nasUsersByBranch[editTarget.id] || [];
          for (const u of users) {
            if (u.plan !== form.plan) await adminUpdateUser(u.id, { plan: form.plan });
          }
          if (form.name.trim() !== editTarget.name) {
            setAdminNotice('지점명·주소·전화는 해당 지점 관리자가 CRM 설정에서 직접 변경해야 합니다. (플랜 변경은 반영됨)');
            isPending = true;
          }
        } else {
          // NAS 모드 신규 지점 = 관리자 계정 발급 (계정에 지점 정보가 실림)
          if (!form.admin_email.trim()) {
            setError('중앙 서버 모드에서는 관리자 이메일이 필요합니다. 계정 발급으로 지점이 생성됩니다.');
            setSaving(false);
            return;
          }
          const result = await createBranchAdmin({
            email: form.admin_email.trim(),
            branchId: crypto.randomUUID(),
            branchName: form.name,
            shopType: form.shop_type,
            plan: form.plan,
          });
          if (applyAdminResult(result)) {
            isPending = true;
          }
        }
        if (!isPending) setShowModal(false);
        loadBranches();
        return;
      }

      if (isSupabaseConfigured) {
        if (editTarget) {
          await supabase.from('branches').update({
            name: form.name, address: form.address, phone: form.phone,
            shop_type: form.shop_type, plan: form.plan,
          }).eq('id', editTarget.id);
        } else {
          // 지점 레코드 생성
          const { data: branch } = await supabase.from('branches').insert({
            name: form.name, address: form.address, phone: form.phone,
            shop_type: form.shop_type, plan: form.plan,
            trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
          }).select().single();

          // 관리자 계정 생성은 NAS 관리자 API를 통해 수행 (auth.admin 직접 호출 금지)
          if (form.admin_email && branch) {
            const result = await createBranchAdmin({
              email: form.admin_email,
              branchId: branch.id,
              branchName: form.name,
              shopType: form.shop_type,
              plan: form.plan,
            });
            if (applyAdminResult(result)) {
              isPending = true;
            }
          }
        }
      } else {
        // 로컬 폴백 — 지점 정보만 저장, 계정 생성은 NAS 연동 후 지원
        const localBranches: Branch[] = JSON.parse(localStorage.getItem('troiareuke_branches') || '[]');
        if (editTarget) {
          const idx = localBranches.findIndex(b => b.id === editTarget.id);
          if (idx !== -1) {
            localBranches[idx] = { ...localBranches[idx], name: form.name, address: form.address, phone: form.phone, shop_type: form.shop_type, plan: form.plan as Branch['plan'] };
          }
        } else {
          const newBranch: Branch = {
            id: crypto.randomUUID(), name: form.name, address: form.address, phone: form.phone,
            shop_type: form.shop_type, plan: form.plan as Branch['plan'],
            trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
            is_active: true, created_at: new Date().toISOString(),
          };
          localBranches.unshift(newBranch);

          // 관리자 이메일 입력된 경우 — NAS 연동 시 즉시 발급, 아니면 pending 표시
          if (form.admin_email) {
            const result = await createBranchAdmin({
              email: form.admin_email,
              branchId: newBranch.id,
              branchName: form.name,
              shopType: form.shop_type,
              plan: form.plan,
            });
            if (applyAdminResult(result)) {
              isPending = true;
            }
          }
        }
        localStorage.setItem('troiareuke_branches', JSON.stringify(localBranches));
      }

      if (!isPending) {
        setShowModal(false);
      }
      // isPending이면 모달을 열어두고 안내 메시지 표시 후 사용자가 직접 닫음
      loadBranches();
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(b: Branch) {
    if (NAS_MODE) {
      // 지점 토글 = 해당 지점의 서버 계정 전체 활성/비활성 (기존엔 localStorage만 바꿔 서버 무반영이던 죽은 버튼)
      const users = nasUsersByBranch[b.id] || [];
      if (users.length === 0) return;
      const nextActive = !b.is_active;
      if (!window.confirm(`${b.name} 지점의 계정 ${users.length}개를 ${nextActive ? '활성화' : '비활성화'}할까요?`)) return;
      try {
        for (const u of users) await adminUpdateUser(u.id, { isActive: nextActive });
      } catch (e: any) {
        alert(`변경 실패: ${e?.message || '서버 오류'}`);
      }
      loadBranches();
      return;
    }
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('branches').update({ is_active: !b.is_active }).eq('id', b.id);
      if (error) alert(`변경 실패: ${error.message}`);
    } else {
      const localBranches: Branch[] = JSON.parse(localStorage.getItem('troiareuke_branches') || '[]');
      const idx = localBranches.findIndex(x => x.id === b.id);
      if (idx !== -1) localBranches[idx].is_active = !b.is_active;
      localStorage.setItem('troiareuke_branches', JSON.stringify(localBranches));
    }
    loadBranches();
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredBranches = branches.filter(branch => {
    const statusMatches = statusFilter === 'all'
      || (statusFilter === 'active' ? branch.is_active : !branch.is_active);
    const planLabel = planLabels[branch.plan]?.label || branch.plan;
    const searchMatches = !normalizedSearch || [
      branch.name,
      branch.address || '',
      branch.phone || '',
      branch.shop_type || '',
      planLabel,
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return statusMatches && searchMatches;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">지점 관리</h1>
          <p className="text-slate-400 text-sm mt-1">지점을 추가하고 관리자 계정을 발급하세요</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus size={16} />
          지점 추가
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-3 mb-4 flex flex-col md:flex-row gap-3 md:items-center">
        <label className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="지점명, 주소, 연락처, 유형, 플랜 검색"
            className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
            aria-label="지점 검색"
          />
        </label>
        <div className="flex gap-1 p-1 bg-slate-800 rounded-xl overflow-x-auto no-scrollbar">
          {([
            ['all', '전체'],
            ['active', '운영 중'],
            ['inactive', '비활성'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === value ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 whitespace-nowrap">{filteredBranches.length}개 지점</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-16 text-center">
          <Building2 size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">조건에 맞는 지점이 없습니다</p>
          <p className="text-slate-600 text-sm mt-1">검색어나 상태 필터를 바꿔보세요</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
          <table className="w-full min-w-[850px]">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-700/30 bg-slate-900">
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">지점명</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">유형</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">플랜</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">등록일</th>
                <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredBranches.map(b => {
                const plan = planLabels[b.plan] || planLabels.trial;
                return (
                  <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{b.name}</p>
                        {b.address && <p className="text-xs text-slate-500 mt-0.5">{b.address}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{b.shop_type || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${plan.color}`}>
                        {plan.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {b.is_active ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                          <CheckCircle size={12} /> 운영 중
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <XCircle size={12} /> 비활성
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {format(parseISO(b.created_at), 'yyyy.MM.dd', { locale: ko })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(b)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(b)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                            b.is_active
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                        >
                          {b.is_active ? '비활성화' : '활성화'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-700">
              <h2 className="text-base font-bold text-white">
                {editTarget ? '지점 정보 수정' : '새 지점 추가'}
              </h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>}

              <Field label="지점명 *">
                <input className="admin-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="강남점" />
              </Field>
              <Field label="주소">
                <input className="admin-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="서울시 강남구..." />
              </Field>
              <Field label="전화번호">
                <input className="admin-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="02-0000-0000" />
              </Field>
              <Field label="샵 유형">
                <select className="admin-input" value={form.shop_type} onChange={e => setForm(f => ({ ...f, shop_type: e.target.value }))}>
                  {shopTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="플랜">
                <select className="admin-input" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                  <option value="trial">무료체험</option>
                  <option value="starter">스타터</option>
                  <option value="pro">프로</option>
                  <option value="enterprise">엔터프라이즈</option>
                </select>
              </Field>

              {!editTarget && (
                <>
                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">관리자 계정 발급 (선택)</p>
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-3">
                      <Info size={13} className="text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-600 leading-relaxed">
                        {isAuthApiConfigured
                          ? '이메일을 입력하면 중앙 서버에 관리자 계정이 즉시 발급되고 임시 비밀번호가 표시됩니다.'
                          : '관리자 계정 생성은 중앙 서버(NAS) 연동 후 지원됩니다. 미연동 상태에서는 계정이 발급되지 않으니, 연동 후 지점 관리에서 다시 발급해주세요.'}
                      </p>
                    </div>
                  </div>
                  <Field label="관리자 이메일">
                    <input className="admin-input" type="email" value={form.admin_email} onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))} placeholder="manager@example.com" />
                  </Field>
                  {adminPending && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <Info size={13} className="text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-400 leading-relaxed">
                        지점이 저장되었습니다. 관리자 계정은 NAS 관리자 API 연동 후 생성됩니다.
                      </p>
                    </div>
                  )}
                  {adminNotice && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-emerald-500 leading-relaxed break-all">{adminNotice}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 0.75rem;
          color: #e2e8f0;
          outline: none;
          transition: border-color 0.15s;
        }
        .admin-input:focus { border-color: #3b82f6; }
        .admin-input option { background: #1e293b; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
