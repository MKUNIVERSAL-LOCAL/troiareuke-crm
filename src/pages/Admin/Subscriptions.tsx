import { useState, useEffect } from 'react';
import { CreditCard, Plus, Pencil, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Subscription {
  id: string;
  branch_id: string;
  branch_name: string;
  plan: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  amount: number;
  notes: string | null;
}

const planOptions = [
  { value: 'trial', label: '무료체험', color: 'bg-amber-500/10 text-amber-400', price: 0 },
  { value: 'starter', label: '스타터', color: 'bg-blue-500/10 text-blue-400', price: 49000 },
  { value: 'pro', label: '프로', color: 'bg-purple-500/10 text-purple-400', price: 99000 },
  { value: 'enterprise', label: '엔터프라이즈', color: 'bg-emerald-500/10 text-emerald-400', price: 199000 },
];

const statusOptions = [
  { value: 'active', label: '활성', icon: CheckCircle, color: 'text-emerald-400' },
  { value: 'expired', label: '만료', icon: AlertCircle, color: 'text-red-400' },
  { value: 'pending', label: '대기', icon: Clock, color: 'text-amber-400' },
  { value: 'cancelled', label: '해지', icon: AlertCircle, color: 'text-slate-400' },
];

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Subscription | null>(null);
  const [form, setForm] = useState({ plan: 'trial', status: 'active', expires_at: '', amount: '0', notes: '' });
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => { loadSubs(); }, []);

  async function loadSubs() {
    setLoading(true);
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('subscriptions')
        .select('*, branches(name)')
        .order('created_at', { ascending: false });
      setSubs((data || []).map((s: any) => ({ ...s, branch_name: s.branches?.name || '—' })));
    }
    setLoading(false);
  }

  function openEdit(s: Subscription) {
    setEditTarget(s);
    setForm({
      plan: s.plan,
      status: s.status,
      expires_at: s.expires_at ? s.expires_at.split('T')[0] : '',
      amount: String(s.amount),
      notes: s.notes || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!editTarget) return;
    setSaving(true);
    await supabase.from('subscriptions').update({
      plan: form.plan,
      status: form.status,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      amount: parseInt(form.amount) || 0,
      notes: form.notes,
    }).eq('id', editTarget.id);

    // branches 테이블도 동기화
    await supabase.from('branches').update({ plan: form.plan }).eq('id', editTarget.branch_id);

    setSaving(false);
    setShowModal(false);
    loadSubs();
  }

  const filtered = filterStatus === 'all' ? subs : subs.filter(s => s.status === filterStatus);

  // 요약 통계
  const stats = {
    total: subs.length,
    active: subs.filter(s => s.status === 'active').length,
    expired: subs.filter(s => s.status === 'expired').length,
    mrr: subs.filter(s => s.status === 'active').reduce((sum, s) => sum + s.amount, 0),
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">구독 / 플랜 관리</h1>
          <p className="text-slate-400 text-sm mt-1">샵별 구독 현황과 플랜을 관리하세요</p>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: '전체 구독', value: stats.total, color: 'text-white' },
          { label: '활성 구독', value: stats.active, color: 'text-emerald-400' },
          { label: '만료/해지', value: stats.expired, color: 'text-red-400' },
          { label: '월 예상 매출', value: stats.mrr.toLocaleString() + '원', color: 'text-purple-400' },
        ].map(c => (
          <div key={c.label} className="bg-slate-900 border border-slate-700/50 rounded-2xl px-5 py-4">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2 mb-4">
        {['all', 'active', 'expired', 'pending', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filterStatus === s ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {s === 'all' ? '전체' : statusOptions.find(o => o.value === s)?.label || s}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <CreditCard size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">구독 데이터가 없습니다</p>
            <p className="text-slate-600 text-sm mt-1">지점 추가 시 자동으로 구독이 생성됩니다</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/30">
                {['지점명', '플랜', '상태', '금액', '만료일', '메모', '액션'].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const plan = planOptions.find(p => p.value === s.plan) || planOptions[0];
                const status = statusOptions.find(o => o.value === s.status) || statusOptions[0];
                const StatusIcon = status.icon;
                return (
                  <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-white">{s.branch_name}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${plan.color}`}>{plan.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${status.color}`}>
                        <StatusIcon size={12} /> {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">{s.amount.toLocaleString()}원/월</td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {s.expires_at ? format(parseISO(s.expires_at), 'yyyy.MM.dd', { locale: ko }) : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">{s.notes || '—'}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openEdit(s)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 수정 모달 */}
      {showModal && editTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-700">
              <h2 className="text-base font-bold text-white">{editTarget.branch_name} — 구독 수정</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="플랜">
                <select className="admin-input" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                  {planOptions.map(p => <option key={p.value} value={p.value}>{p.label} ({p.price.toLocaleString()}원/월)</option>)}
                </select>
              </Field>
              <Field label="상태">
                <select className="admin-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="월 금액 (원)">
                <input className="admin-input" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </Field>
              <Field label="만료일">
                <input className="admin-input" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
              </Field>
              <Field label="메모">
                <input className="admin-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="특이사항 입력" />
              </Field>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">취소</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-input { width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; background: #0f172a; border: 1px solid #334155; border-radius: 0.75rem; color: #e2e8f0; outline: none; }
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
