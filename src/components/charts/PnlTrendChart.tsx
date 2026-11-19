import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

/** 매출 화면 손익 추이(매출·지출·이익, 만원) — lazy 로드용 */
export default function PnlTrendChart({ data }: { data: { month: string; 매출: number; 지출: number; 이익: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v.toLocaleString('ko-KR')}만원`, name]}
          contentStyle={{ borderRadius: 12, border: '1px solid #f0f0f0', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="매출" fill="#1a3a8f" radius={[3, 3, 0, 0]} />
        <Bar dataKey="지출" fill="#f97316" radius={[3, 3, 0, 0]} />
        <Bar dataKey="이익" fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
