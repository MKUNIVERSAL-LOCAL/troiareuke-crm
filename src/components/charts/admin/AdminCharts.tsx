import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

/** 어드민 콘솔(다크 테마) 차트 4종 — 한 모듈로 lazy 로드해 recharts를 첫 화면 번들에서 뺀다 (2026-11-18) */

const DARK_TOOLTIP = { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 } as const;

/** 지점 손익계산서 — 지점별 비교 또는 월/분기 추이 (매출·지출·영업이익) */
export function PnlCompareChart({ data, won }: { data: { name: string; 매출: number; 지출: number; 영업이익: number }[]; won: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 8, bottom: 0 }}>
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
  );
}

/** 통계 — 최근 6개월 매출·환불 */
export function MonthlyRevenueChart({ data, won, wonShort }: { data: { month: string; 매출: number; 환불: number }[]; won: (v: number) => string; wonShort: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={wonShort} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => won(v)} contentStyle={DARK_TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
        <Bar dataKey="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="환불" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 통계 — 최근 30일 일별 매출(영역) */
export function DailyRevenueAreaChart({ data, won, wonShort }: { data: { date: string; 매출: number }[]; won: (v: number) => string; wonShort: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="dailyRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
        <YAxis tickFormatter={wonShort} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => won(v)} contentStyle={DARK_TOOLTIP} />
        <Area type="monotone" dataKey="매출" stroke="#3b82f6" fill="url(#dailyRev)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** 통계 — 지점별 누적 매출 비교(가로 막대). 높이는 지점 수에 비례 */
export function BranchCompareChart({ data, height, won, wonShort }: { data: { name: string; 매출: number }[]; height: number; won: (v: number) => string; wonShort: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
        <XAxis type="number" tickFormatter={wonShort} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => won(v)} contentStyle={DARK_TOOLTIP} />
        <Bar dataKey="매출" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
