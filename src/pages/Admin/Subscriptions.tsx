import { useState, useEffect } from 'react';
import { notify } from '../../lib/notify';
import { CreditCard, Pencil, AlertCircle, CheckCircle, Clock, Search } from 'lucide-react';
import AdminDialog from '../../components/admin/AdminDialog';
import { isAuthApiConfigured, adminListUsers, adminUpdateUser } from '../../lib/authApi';
import { groupByBranch } from '../../lib/adminBranches';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
// 로컬(KST) 기준 오늘 — toISOString().slice(0,10)은 UTC라 새벽에 전날로 어긋난다
import { todayISO, localISODate } from '../../lib/format';
import { parseAmount } from '../../lib/inputRules';

// NAS 중앙 서버 모드에서는 구독 테이블이 없고 계정(auth_users)의 plan이 진실이다.
// 이 화면은 NAS 모드일 때 계정 목록에서 구독 뷰를 파생하고, 수정은 plan/활성만 반영한다.
const NAS_MODE = isAuthApiConfigured;

interface Subscription {
  id: string;
  branch_id: string;
  branch_name: string;
  plan: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  /** NAS 모드: 어드민이 설정한 사용기간(service_ends_at) 원본 — 표시용 expires_at과 구분 */
  service_ends_at?: string | null;
  amount: number;
  notes: string | null;
  /** NAS 모드: 이 지점에 속한 계정 id 전부 — 플랜·활성 변경은 지점 계정 모두에 적용 (4차 UX 점검 2026-11-19) */
  userIds?: string[];
}

const planOptions = [
  { value: 'trial', label: '무료체험', color: 'bg-amber-500/10 text-amber-700', price: 0 },
  // 단가는 Signup.tsx 플랜 표기와 동일하게 유지 (29,000 / 59,000)
  { value: 'starter', label: '스타터', color: 'bg-blue-500/10 text-blue-400', price: 29000 },
  { value: 'pro', label: '프로', color: 'bg-purple-500/10 text-purple-400', price: 59000 },
  { value: 'enterprise', label: '엔터프라이즈', color: 'bg-emerald-500/10 text-emerald-400', price: 199000 },
];

const statusOptions = [
  { value: 'active', label: '활성', icon: CheckCircle, color: 'text-emerald-400' },
  { value: 'expired', label: '만료', icon: AlertCircle, color: 'text-red-400' },
  { value: 'pending', label: '대기', icon: Clock, color: 'text-amber-700' },
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
  const [search, setSearch] = useState('');

  useEffect(() => { loadSubs(); }, []);

  const [loadError, setLoadError] = useState('');
  async function loadSubs() {
    setLoading(true);
    setLoadError('');
    if (NAS_MODE) {
      try {
        const users = await adminListUsers();
        const priceOf = (plan: string) => planOptions.find(p => p.value === plan)?.price ?? 0;
        // 지점당 한 행 — 계정마다 행을 만들면 같은 지점 요금이 계정 수만큼 더해져 "월 예상 매출"이 부풀고 "전체 구독"도 계정 수가 된다 (4차 UX 점검 2026-11-19)
        const byBranch = groupByBranch(users); // 승인 대기·거부 신청자는 "활성 구독"이 아니다 (8차 점검 2026-11-20)
        setSubs([...byBranch.entries()].map(([branchId, accounts]) => {
          const rep = accounts.find(u => u.role === 'admin') || accounts[0];
          const serviceEndsAt = rep.serviceEndsAt || null;
          const isExpired = Boolean(serviceEndsAt && serviceEndsAt.slice(0, 10) < todayISO()); // 사용자 관리와 같은 규칙(만료일 당일은 유효) — new Date('YYYY-MM-DD') 는 KST 09:00 부터 만료로 보였다 (12차 #M4)
          // 체험(trial) 지점은 체험 만료일도 만료 판정에 넣는다 — 전에는 "활성 · 만료일(과거)" 조합이 나왔다 (8차 점검 2026-11-20)
          const trialExpired = rep.plan === 'trial' && !serviceEndsAt && Boolean(rep.trialEndsAt && localISODate(rep.trialEndsAt) < todayISO()); // 사용기간과 같은 규칙(만료일 당일 유효) — 밀리초 비교는 KST 09시부터 만료로 보였다 (117~119 리뷰 #M7)
          const allInactive = accounts.every(u => u.isActive === false);
          return {
            id: rep.id,
            branch_id: branchId,
            branch_name: rep.branchName || rep.shopName || rep.email,
            plan: rep.plan,
            status: allInactive ? 'cancelled' : (isExpired || trialExpired) ? 'expired' : 'active',
            started_at: rep.createdAt,
            // 표시 우선순위: 어드민 설정 사용기간 > (trial이면) 체험 만료일
            expires_at: serviceEndsAt || (rep.plan === 'trial' ? rep.trialEndsAt : null),
            service_ends_at: serviceEndsAt,
            amount: priceOf(rep.plan),
            notes: accounts.length > 1 ? `${rep.email} 외 ${accounts.length - 1}개 계정` : rep.email,
            userIds: accounts.map(u => u.id),
          };
        }));
      } catch (e: any) {
        console.warn('[Subscriptions] NAS 계정 목록 로드 실패:', e?.message);
        setSubs([]);
        setLoadError(e?.message || '중앙 서버에서 목록을 불러오지 못했습니다'); // 빈 상태로 위장하지 않는다 (4차 UX 점검 2026-11-19)
      }
    }
    setLoading(false);
  }

  function openEdit(s: Subscription) {
    setEditTarget(s);
    setForm({
      plan: s.plan,
      status: s.status === 'expired' ? 'active' : s.status,
      // NAS 모드: 어드민이 실제 설정한 사용기간만 프리필 — trial 파생 만료일을 그대로 저장해
      // 의도치 않게 체험 만료가 강제 차단으로 굳는 것을 방지
      expires_at: s.service_ends_at ? s.service_ends_at.split('T')[0] : '', // 서버 모드에서만 열리는 모달 — 비NAS는 구독 목록이 비어 도달 불가 (8차 점검 2026-11-20)
      amount: String(s.amount),
      notes: s.notes || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!editTarget) return;
    setSaving(true);

    if (NAS_MODE) {
      // NAS 모드: 계정의 plan / 활성 여부만 서버에 반영 (만료일·금액·메모는 파생값)
      const willDeactivate = form.status !== 'active' && editTarget.status === 'active';
      if (willDeactivate && !window.confirm(
        `${editTarget.branch_name} 지점 계정의 로그인이 차단됩니다.\n계속할까요?`
      )) {
        setSaving(false);
        return;
      }
      const nextEndsAt = form.expires_at || null;
      if (nextEndsAt && nextEndsAt < todayISO()
          && !window.confirm('만료일이 과거입니다. 저장 즉시 해당 지점 계정의 로그인이 차단됩니다. 계속할까요?')) {
        setSaving(false);
        return;
      }
      // 지점 관리 화면의 플랜 수정과 같은 범위(지점 계정 전부)·같은 규칙(바뀐 항목만) — isActive를 늘 보내면 개별로 꺼 둔 직원 계정이 되살아난다 (리뷰 67)
      const statusChanged = (form.status === 'active') !== (editTarget.status !== 'cancelled');
      const prevEndsAt = editTarget.service_ends_at ? editTarget.service_ends_at.split('T')[0] : null;
      const endsChanged = nextEndsAt !== prevEndsAt;
      const ids = editTarget.userIds ?? [editTarget.id];
      let changed = 0, failed = 0;
      for (const id of ids) {
        const updates: { plan?: string; isActive?: boolean; serviceEndsAt?: string | null } = {};
        if (form.plan !== editTarget.plan) updates.plan = form.plan;
        if (statusChanged) updates.isActive = form.status === 'active';
        if (endsChanged) updates.serviceEndsAt = nextEndsAt;
        if (Object.keys(updates).length === 0) continue;
        try { await adminUpdateUser(id, updates); changed++; } catch { failed++; }
      }
      setSaving(false);
      // 중간에 실패해도 이미 바뀐 계정은 그대로 — 숨기지 않고 요약, 목록은 항상 다시 읽는다
      if (failed > 0) notify.error(`${changed + failed}개 계정 중 ${changed}개 변경, ${failed}개 실패 — 다시 저장해 재시도하세요`);
      else setShowModal(false);
      loadSubs();
      return;
    }
    // 로컬 모드: 구독 기록 저장처 없음 (NAS 계정 plan이 정본)
    setSaving(false);
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = subs.filter(subscription => {
    const statusMatches = filterStatus === 'all' || subscription.status === filterStatus;
    const planLabel = planOptions.find(plan => plan.value === subscription.plan)?.label || subscription.plan;
    const searchMatches = !normalizedSearch || [
      subscription.branch_name,
      planLabel,
      subscription.notes || '',
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return statusMatches && searchMatches;
  });

  // 요약 통계
  const stats = {
    total: subs.length,
    active: subs.filter(s => s.status === 'active').length,
    expired: subs.filter(s => s.status === 'expired' || s.status === 'cancelled').length,
    mrr: subs.filter(s => s.status === 'active').reduce((sum, s) => sum + s.amount, 0),
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">구독 / 플랜 관리</h1>
          <p className="text-slate-400 text-sm mt-1">샵별 구독 현황과 플랜을 관리하세요</p>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
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

      <div className="relative mb-4 max-w-xl">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="지점명, 플랜, 메모 검색"
          className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-500"
          aria-label="구독 검색"
        />
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
        {['all', 'active', 'expired', 'pending', 'cancelled'].filter(s => !(NAS_MODE && s === 'pending')).map(s => ( // NAS 파생 상태엔 '대기'가 없다
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
            <CreditCard size={32} className="text-slate-400 mx-auto mb-3" />
            <p className="text-slate-400">{loadError ? '구독 목록을 불러오지 못했습니다' : NAS_MODE ? '구독 데이터가 없습니다' : '중앙 서버(NAS) 연동 후 구독 현황이 표시됩니다'}</p>
            <p className="text-slate-400 text-sm mt-1">{loadError ? loadError : NAS_MODE ? '지점 계정이 생기면 여기에 나타납니다' : '미연동 상태에서는 표시할 데이터가 없습니다'}</p>
            {loadError && <button type="button" onClick={() => void loadSubs()} className="mt-3 px-4 py-2 text-sm font-medium rounded-xl bg-slate-800 text-white hover:bg-slate-700">다시 시도</button>}
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-700/30 bg-slate-900">
                {['지점명', '플랜', '상태', '금액', '만료일', '메모', '액션'].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
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
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${plan.color}`}>{plan.label}</span>
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
                    <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">{s.notes || '—'}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openEdit(s)}
                        aria-label={`${s.branch_name} 구독 수정`}
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
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {showModal && editTarget && (
        <AdminDialog title={`${editTarget.branch_name} — 구독 수정`} onClose={() => setShowModal(false)} escape={false}>
            <div className="px-6 py-5 border-b border-slate-700">
              <h2 className="text-base font-bold text-white">{editTarget.branch_name} — 구독 수정</h2>
              {NAS_MODE && (editTarget.userIds?.length ?? 1) > 1 && (
                <p className="text-xs text-slate-400 mt-1">이 지점 계정 {editTarget.userIds!.length}개에 함께 적용됩니다</p>
              )}
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="플랜">
                <select className="admin-input" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                  {planOptions.map(p => <option key={p.value} value={p.value}>{p.label} ({p.price.toLocaleString()}원/월)</option>)}
                </select>
              </Field>
              <Field label="상태" hint="'해지'는 해당 지점 계정의 로그인을 차단합니다.">
                {/* NAS 모드: 서버 계정에는 활성/비활성만 존재 — 만료·대기 선택지를 주면
                    isActive=false로 축약 저장되어 지점 로그인이 잠기는 함정이 됨 */}
                <select className="admin-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {statusOptions.filter(o => o.value === 'active' || o.value === 'cancelled')
                    .map(o => <option key={o.value} value={o.value}>{o.value === 'cancelled' ? '해지 (로그인 차단)' : o.label}</option>)}
                </select>
              </Field>
              <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <p className="text-xs text-amber-600 leading-relaxed">
                  플랜·상태·사용기간이 저장됩니다. 월 금액은 플랜에서, 메모(계정 목록)는 계정에서 자동으로 정해져 여기서는 보기만 합니다.
                </p>
              </div>
              <Field label="월 금액 (원)">
                <p className="px-3 py-2 text-sm text-slate-300">{(parseAmount(form.amount) ?? 0).toLocaleString('ko-KR')}원 — 플랜 기준 자동</p>
              </Field>
              <Field label="사용기간 만료일 (비우면 무제한)" hint="만료일이 지나면 해당 계정은 로그인할 수 없습니다. 데이터는 유지됩니다.">
                <input className="admin-input" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
              </Field>
              <Field label="계정">
                <p className="px-3 py-2 text-sm text-slate-300">{form.notes || '—'}</p>
              </Field>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">취소</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? '저장 중...' : '저장하기'}
              </button>
            </div>
        </AdminDialog>
      )}

      <style>{`
        .admin-input { width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; background: #0f172a; border: 1px solid #334155; border-radius: 0.75rem; color: #e2e8f0; outline: none; }
        .admin-input:focus { border-color: #3b82f6; }
        .admin-input option { background: #1e293b; }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    // label로 감싸 안의 입력이 이름(implicit label)을 갖게 — 어드민 게이트가 지점 추가 창의 select-name 위반을 잡았다 (2026-11-19 53)
    // 도움말(hint)은 label 밖에 — 안에 두면 문장 전체가 입력의 이름으로 읽힌다 (리뷰 54)
    <div>
      <label className="block">
        <span className="block text-xs font-medium text-slate-400 mb-1.5">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
