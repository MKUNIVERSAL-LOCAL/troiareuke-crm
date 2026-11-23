import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

/** 대시보드 주간 매출(시술+홈케어 누적 막대). compact=모바일 카드(범례 없음, 작은 글자) — 페이지에서 lazy로 불러 recharts를 첫 화면 번들에서 뺀다 */
export default function WeeklySalesChart({ data, compact = false }: { data: { date: string; 시술: number; 제품: number }[]; compact?: boolean }) {
  const fontSize = compact ? 10 : 11;
  return (
    <ResponsiveContainer width="100%" height={compact ? 180 : 200}>
      <BarChart data={data} barSize={compact ? 12 : 14}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="만" />
        <Tooltip
          formatter={(v, name) => [`${v}만원`, name === '시술' ? '시술 매출' : compact ? '홈케어' : '홈케어 판매']}
          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: compact ? '11px' : '12px' }}
        />
        {!compact && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />}
        <Bar dataKey="시술" stackId="a" fill="#1a3a8f" radius={[0, 0, 0, 0]} />
        <Bar dataKey="제품" stackId="a" fill="#60a5fa" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
