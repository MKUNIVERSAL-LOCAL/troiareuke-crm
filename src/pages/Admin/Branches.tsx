import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Building2 } from 'lucide-react';
import { supabase, isSupabaseConfigured, type Branch } from '../../lib/supabase';
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
  admin_password: string;
}

const emptyForm: BranchForm = {
  name: '', address: '', phone: '', shop_type: '피부관리실',
  plan: 'trial', admin_email: '', admin_password: '',
};

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadBranches(); }, []);

  async function loadBranches() {
    setLoading(true);
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('branches').select('*').order('created_at', { ascending: false });
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
    setShowModal(true);
  }

  function openEdit(b: Branch) {
    setEditTarget(b);
    setForm({ name: b.name, address: b.address || '', phone: b.phone || '', shop_type: b.shop_type || '', plan: b.plan, admin_email: '', admin_password: '' });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('지점명을 입력해주세요.'); return; }
    setSaving(true);
    setError('');

    try {
      if (isSupabaseConfigured) {
        if (editTarget) {
          await supabase.from('branches').update({
            name: form.name, address: form.address, phone: form.phone,
            shop_type: form.shop_type, plan: form.plan,
          }).eq('id', editTarget.id);
        } else {
          // 새 지점 생성
          const { data: branch } = await supabase.from('branches').insert({
            name: form.name, address: form.address, phone: form.phone,
            shop_type: form.shop_type, plan: form.plan,
            trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
          }).select().single();

          // 관리자 계정 생성 (이메일 입력된 경우)
          if (form.admin_email && form.admin_password && branch) {
            const { data: authData } = await supabase.auth.admin.createUser({
              email: form.admin_email,
              password: form.admin_password,
              email_confirm: true,
            });
            if (authData.user) {
              await supabase.from('user_profiles').insert({
                id: authData.user.id,
                name: form.name + ' 관리자',
                role: 'admin',
                branch_id: branch.id,
                is_onboarded: true,
              });
            }
          }
        }
      } else {
        // 로컬 폴백
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

          // 로컬 유저 저장 (관리자 계정)
          if (form.admin_email && form.admin_password) {
            const localUsers = JSON.parse(localStorage.getItem('troiareuke_local_users') || '[]');
            localUsers.push({
              email: form.admin_email,
              passwordHash: form.admin_password,
              user: {
                id: 'user_' + Date.now(),
                email: form.admin_email,
                name: form.name + ' 관리자',
                shopName: form.name,
                shopType: form.shop_type,
                plan: form.plan,
                trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
                isOnboarded: true,
                role: 'admin',
                branchId: newBranch.id,
                branchName: form.name,
                createdAt: new Date().toISOString(),
              },
            });
            localStorage.setItem('troiareuke_local_users', JSON.stringify(localUsers));
          }
        }
        localStorage.setItem('troiareuke_branches', JSON.stringify(localBranches));
      }

      setShowModal(false);
      loadBranches();
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(b: Branch) {
    if (isSupabaseConfigured) {
      await supabase.from('branches').update({ is_active: !b.is_active }).eq('id', b.id);
    } else {
      const localBranches: Branch[] = JSON.parse(localStorage.getItem('troiareuke_branches') || '[]');
      const idx = localBranches.findIndex(x => x.id === b.id);
      if (idx !== -1) localBranches[idx].is_active = !b.is_active;
      localStorage.setItem('troiareuke_branches', JSON.stringify(localBranches));
    }
    loadBranches();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-16 text-center">
          <Building2 size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">등록된 지점이 없습니다</p>
          <p className="text-slate-600 text-sm mt-1">위의 "지점 추가" 버튼으로 첫 지점을 등록하세요</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/30">
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">지점명</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">유형</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">플랜</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">등록일</th>
                <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">액션</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(b => {
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
                  </div>
                  <Field label="관리자 이메일">
                    <input className="admin-input" type="email" value={form.admin_email} onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))} placeholder="manager@example.com" />
                  </Field>
                  <Field label="초기 비밀번호">
                    <input className="admin-input" type="password" value={form.admin_password} onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))} placeholder="임시 비밀번호" />
                  </Field>
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
