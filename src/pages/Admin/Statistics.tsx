import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isAuthApiConfigured } from '../../lib/authApi';
import { fetchAdminAnalytics, type AdminBranchAnalytics } from '../../lib/adminApi';
import DataBrowser from './DataBrowser';
import PnlReport from './PnlReport';
import { format, subDays } from 'date-fns';
import ChartFallback from '../../components/charts/ChartFallback';
// recharts 지연 로드 (2026-11-18) — 통계 차트 3종은 한 모듈에서
const MonthlyRevenueChart = lazy(() => import('../../components/charts/admin/AdminCharts').then(m => ({ default: m.MonthlyRevenueChart })));
const DailyRevenueAreaChart = lazy(() => import('../../components/charts/admin/AdminCharts').then(m => ({ default: m.DailyRevenueAreaChart })));
const BranchCompareChart = lazy(() => import('../../components/charts/admin/AdminCharts').then(m => ({ default: m.BranchCompareChart })));
import { TrendingUp, Users, CalendarCheck, Sparkles, RefreshCw } from 'lucide-react';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const wonShort = (n: number) =>
  Math.abs(n) >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만` : n.toLocaleString('ko-KR');

export default function Statistics() {
  const [searchParams] = useSearchParams();
  if (searchParams.get('view') === 'data') return <DataBrowser />;
  if (searchParams.get('view') === 'pnl') {
    if (isAuthApiConfigured) return <PnlReport />;
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-8">지점 손익계산서</h1>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-8 text-center">
          <p className="text-amber-200 font-bold text-sm">중앙 서버(NAS) 연결 후 이용할 수 있습니다</p>
        </div>
      </div>
    );
  }
  if (isAuthApiConfigured) return <NasAnalytics />;
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
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-10 text-center text-slate-400 text-sm">
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
                <p className="text-xs text-slate-400 mt-1 truncate" title={c.sub}>{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* 월별 매출 */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">최근 6개월 매출</h2>
              <Suspense fallback={<ChartFallback height={220} dark />}><MonthlyRevenueChart data={view.monthlySeries} won={won} wonShort={wonShort} /></Suspense>
            </div>

            {/* 일별 매출 */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">최근 30일 일별 매출</h2>
              <Suspense fallback={<ChartFallback height={220} dark />}><DailyRevenueAreaChart data={view.dailySeries} won={won} wonShort={wonShort} /></Suspense>
            </div>
          </div>

          {/* 전체 보기: 지점 간 비교 */}
          {selected === 'all' && branches.length > 0 && (
            <>
              {branches.length > 1 && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 mb-6">
                  <h2 className="text-sm font-bold text-white mb-6">지점별 누적 매출 비교</h2>
                  <Suspense fallback={<ChartFallback height={Math.max(160, compareData.length * 44)} dark />}><BranchCompareChart data={compareData} height={Math.max(160, compareData.length * 44)} won={won} wonShort={wonShort} /></Suspense>
                </div>
              )}

              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50">
                  <h2 className="text-sm font-bold text-white">지점별 상세</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
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
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(b.branchId); } }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${b.branchName || b.branchId.slice(0, 8)} 지점 통계 보기`}
                        className="border-b border-slate-800/50 hover:bg-slate-800/40 focus-visible:bg-slate-800/40 focus-visible:outline-none cursor-pointer transition-colors"
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
