/**
 * 어드민 — 지점별 손익계산서 (월/분기/연간)
 *
 * 서버 /api/admin/pnl?year=YYYY 원자료(월별 매출 구분·지출 분류)를 받아
 * 기간 단위 손익 표와 분류 상세, 지점 비교를 렌더링한다.
 * 매출원가/판관비 구분은 지점 화면(Sales 손익 탭)과 동일한 기준을 사용한다.
 */
import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fetchAdminPnl, type AdminPnlResponse } from '../../lib/adminApi';
import { COGS_CATEGORIES, EXPENSE_CATEGORIES, type ExpenseCategory } from '../../types';

type PeriodMode = 'month' | 'quarter' | 'year';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

interface PeriodPnl {
  key: string;
  label: string;
  revenue: { treatment: number; product: number; other: number; total: number };
  byCategory: Partial<Record<string, number>>;
  cogs: number;
  sga: number;
  totalExpense: number;
  grossProfit: number;
  operatingProfit: number;
}

function emptyPeriod(key: string, label: string): PeriodPnl {
  return {
    key, label,
    revenue: { treatment: 0, product: 0, other: 0, total: 0 },
    byCategory: {}, cogs: 0, sga: 0, totalExpense: 0, grossProfit: 0, operatingProfit: 0,
  };
}

export default function PnlReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<AdminPnlResponse | null>(null);
  const [selected, setSelected] = useState<string>('all');
  const [mode, setMode] = useState<PeriodMode>('month');

  async function load(targetYear: string) {
    setLoading(true);
    setError('');
    try {
      setData(await fetchAdminPnl(targetYear));
    } catch (e: any) {
      setError(e?.message || '손익 데이터를 불러오지 못했습니다.');
    }
    setLoading(false);
  }
  useEffect(() => { load(year); }, [year]);

  // 데이터에 등장하는 지점 목록 (매출 또는 지출이 있는 지점)
  const branchIds = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    data.revenue.forEach(r => ids.add(r.branchId));
    data.expenses.forEach(x => ids.add(x.branchId));
    return [...ids].sort((a, b) =>
      (data.branchNames[a] || a).localeCompare(data.branchNames[b] || b, 'ko'));
  }, [data]);

  const branchLabel = (id: string) => data?.branchNames[id] || id.slice(0, 8);

  // 기간 목록 (선택 연도의 12개월 / 4분기 / 1년)
  const periods = useMemo(() => {
    if (mode === 'month') {
      return Array.from({ length: 12 }, (_, i) => {
        const mm = String(i + 1).padStart(2, '0');
        return { key: `${year}-${mm}`, label: `${i + 1}월`, months: [`${year}-${mm}`] };
      });
    }
    if (mode === 'quarter') {
      return Array.from({ length: 4 }, (_, q) => ({
        key: `${year}-Q${q + 1}`,
        label: `${q + 1}분기`,
        months: [0, 1, 2].map(i => `${year}-${String(q * 3 + i + 1).padStart(2, '0')}`),
      }));
    }
    return [{
      key: year, label: `${year}년 전체`,
      months: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    }];
  }, [year, mode]);

  // 선택 범위(전체 or 특정 지점)의 기간별 손익
  const rows = useMemo<PeriodPnl[]>(() => {
    if (!data) return [];
    const inScope = (branchId: string) => selected === 'all' || branchId === selected;
    return periods.map(p => {
      const set = new Set(p.months);
      const row = emptyPeriod(p.key, p.label);
      for (const r of data.revenue) {
        if (!inScope(r.branchId) || !set.has(r.month)) continue;
        row.revenue[r.type] += r.amount;
        row.revenue.total += r.amount;
      }
      for (const x of data.expenses) {
        if (!inScope(x.branchId) || !set.has(x.month)) continue;
        row.byCategory[x.category] = (row.byCategory[x.category] || 0) + x.amount;
        row.totalExpense += x.amount;
      }
      row.cogs = COGS_CATEGORIES.reduce((s, c) => s + (row.byCategory[c] || 0), 0);
      row.sga = row.totalExpense - row.cogs;
      row.grossProfit = row.revenue.total - row.cogs;
      row.operatingProfit = row.grossProfit - row.sga;
      return row;
    });
  }, [data, periods, selected]);

  const yearTotal = useMemo(() => {
    const t = emptyPeriod('total', `${year}년 합계`);
    for (const r of rows) {
      t.revenue.treatment += r.revenue.treatment;
      t.revenue.product += r.revenue.product;
      t.revenue.other += r.revenue.other;
      t.revenue.total += r.revenue.total;
      for (const [c, v] of Object.entries(r.byCategory)) {
        t.byCategory[c] = (t.byCategory[c] || 0) + (v || 0);
      }
      t.totalExpense += r.totalExpense;
    }
    t.cogs = COGS_CATEGORIES.reduce((s, c) => s + (t.byCategory[c] || 0), 0);
    t.sga = t.totalExpense - t.cogs;
    t.grossProfit = t.revenue.total - t.cogs;
    t.operatingProfit = t.grossProfit - t.sga;
    return t;
  }, [rows, year]);

  // 지점별 연간 영업이익 비교 (전체 보기에서 표시)
  const branchCompare = useMemo(() => {
    if (!data) return [];
    return branchIds.map(id => {
      const revenue = data.revenue.filter(r => r.branchId === id).reduce((s, r) => s + r.amount, 0);
      const expense = data.expenses.filter(x => x.branchId === id).reduce((s, x) => s + x.amount, 0);
      return { name: branchLabel(id), 매출: revenue, 지출: expense, 영업이익: revenue - expense };
    }).sort((a, b) => b.영업이익 - a.영업이익);
  }, [data, branchIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCategories = EXPENSE_CATEGORIES.filter(c => (yearTotal.byCategory[c] || 0) > 0);

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText size={22} className="text-blue-400" />지점 손익계산서
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            지점이 등록한 매출·지출 기준의 월/분기/연간 손익 (NAS 중앙서버 실데이터)
          </p>
        </div>
        <button
          onClick={() => load(year)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 연도 · 기간 단위 선택 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/50 rounded-xl px-2 py-1.5">
          <button onClick={() => setYear(String(Number(year) - 1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-bold text-white min-w-[56px] text-center">{year}년</span>
          <button onClick={() => setYear(String(Number(year) + 1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex gap-1 bg-slate-900 border border-slate-700/50 p-1 rounded-xl">
          {([['month', '월별'], ['quarter', '분기별'], ['year', '연간']] as [PeriodMode, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 지점 선택 */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelected('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            selected === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700/50'
          }`}
        >
          전체 합산
        </button>
        {branchIds.map(id => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              selected === id ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700/50'
            }`}
          >
            {branchLabel(id)}
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
          <button onClick={() => load(year)} className="mt-3 text-xs underline text-red-200 hover:text-white">다시 시도</button>
        </div>
      ) : branchIds.length === 0 ? (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-12 text-center">
          <p className="text-slate-400">{year}년에 등록된 매출·지출 데이터가 없습니다</p>
          <p className="text-slate-600 text-xs mt-1">지점이 CRM의 매출·손익 관리에서 결제·지출을 등록하면 여기에 집계됩니다</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 연간 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: '매출액', value: yearTotal.revenue.total, color: 'text-blue-400' },
              { label: '매출원가', value: yearTotal.cogs, color: 'text-orange-400' },
              { label: '매출총이익', value: yearTotal.grossProfit, color: 'text-white' },
              { label: '판매비·관리비', value: yearTotal.sga, color: 'text-rose-400' },
              { label: '영업이익', value: yearTotal.operatingProfit, color: yearTotal.operatingProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map(c => (
              <div key={c.label} className="bg-slate-900 border border-slate-700/50 rounded-2xl px-5 py-4">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className={`text-lg font-bold mt-1 ${c.color}`}>{won(c.value)}</p>
                {c.label === '영업이익' && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    이익률 {yearTotal.revenue.total > 0 ? Math.round((yearTotal.operatingProfit / yearTotal.revenue.total) * 100) : 0}%
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* 기간별 손익 표 */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/30">
              <h3 className="text-sm font-bold text-white">
                {selected === 'all' ? '전체 합산' : branchLabel(selected)} · {year}년 {mode === 'month' ? '월별' : mode === 'quarter' ? '분기별' : '연간'} 손익
              </h3>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-slate-700/30">
                    {['기간', '매출액', '매출원가', '매출총이익', '판매비·관리비', '영업이익', '이익률'].map(h => (
                      <th key={h} className="text-right first:text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-5 py-3 text-sm font-medium text-white">{r.label}</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-300">{r.revenue.total ? won(r.revenue.total) : '—'}</td>
                      <td className="px-5 py-3 text-sm text-right text-orange-400/90">{r.cogs ? won(r.cogs) : '—'}</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-300">{r.revenue.total || r.cogs ? won(r.grossProfit) : '—'}</td>
                      <td className="px-5 py-3 text-sm text-right text-rose-400/90">{r.sga ? won(r.sga) : '—'}</td>
                      <td className={`px-5 py-3 text-sm text-right font-bold ${r.operatingProfit > 0 ? 'text-emerald-400' : r.operatingProfit < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {r.revenue.total || r.totalExpense ? won(r.operatingProfit) : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-right text-slate-500">
                        {r.revenue.total > 0 ? `${Math.round((r.operatingProfit / r.revenue.total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-800/40">
                    <td className="px-5 py-3 text-sm font-bold text-white">{year}년 합계</td>
                    <td className="px-5 py-3 text-sm text-right font-bold text-white">{won(yearTotal.revenue.total)}</td>
                    <td className="px-5 py-3 text-sm text-right font-bold text-orange-400">{won(yearTotal.cogs)}</td>
                    <td className="px-5 py-3 text-sm text-right font-bold text-white">{won(yearTotal.grossProfit)}</td>
                    <td className="px-5 py-3 text-sm text-right font-bold text-rose-400">{won(yearTotal.sga)}</td>
                    <td className={`px-5 py-3 text-sm text-right font-bold ${yearTotal.operatingProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{won(yearTotal.operatingProfit)}</td>
                    <td className="px-5 py-3 text-xs text-right text-slate-400">
                      {yearTotal.revenue.total > 0 ? `${Math.round((yearTotal.operatingProfit / yearTotal.revenue.total) * 100)}%` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {/* 매출·지출 구성 상세 */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4">{year}년 구성 상세 ({selected === 'all' ? '전체' : branchLabel(selected)})</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between py-1.5 font-bold text-white border-b border-slate-700/30">
                  <span>매출액</span><span>{won(yearTotal.revenue.total)}</span>
                </div>
                {[['시술 매출', yearTotal.revenue.treatment], ['제품 매출', yearTotal.revenue.product], ['기타 매출', yearTotal.revenue.other]]
                  .filter(([, v]) => (v as number) > 0)
                  .map(([label, v]) => (
                    <div key={label as string} className="flex justify-between py-1 pl-3 text-xs text-slate-400">
                      <span>{label}</span><span>{won(v as number)}</span>
                    </div>
                  ))}
                <div className="flex justify-between py-1.5 font-bold text-white border-b border-slate-700/30 mt-2">
                  <span>지출</span><span>{won(yearTotal.totalExpense)}</span>
                </div>
                {activeCategories.length === 0 && (
                  <p className="text-xs text-slate-600 py-1 pl-3">등록된 지출이 없습니다</p>
                )}
                {activeCategories.map(c => (
                  <div key={c} className="flex justify-between py-1 pl-3 text-xs">
                    <span className="text-slate-400">
                      {c}
                      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${COGS_CATEGORIES.includes(c as ExpenseCategory) ? 'bg-orange-500/10 text-orange-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {COGS_CATEGORIES.includes(c as ExpenseCategory) ? '매출원가' : '판관비'}
                      </span>
                    </span>
                    <span className="text-slate-400">{won(yearTotal.byCategory[c] || 0)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 지점 비교 (전체 보기) 또는 기간 추이 차트 */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4">
                {selected === 'all' ? `${year}년 지점별 손익 비교` : `${year}년 ${mode === 'quarter' ? '분기별' : '월별'} 추이`}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={selected === 'all'
                    ? branchCompare
                    : (mode === 'year' ? rows : rows).map(r => ({ name: r.label, 매출: r.revenue.total, 지출: r.totalExpense, 영업이익: r.operatingProfit }))}
                  margin={{ top: 0, right: 0, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `${Math.round(Number(v) / 10000).toLocaleString('ko-KR')}만`} />
                  <Tooltip
                    formatter={(v: number, name: string) => [won(v), name]}
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="매출" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="지출" fill="#f97316" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="영업이익" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="text-[11px] text-slate-600">
            * 지점이 CRM에 등록한 결제(완료)·지출 기록 기준의 운영 참고용 집계입니다. 세무 신고 자료와 다를 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
