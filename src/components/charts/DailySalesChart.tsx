import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

/** 매출 화면 일별 매출(시술·제품·기타 누적, 만원) — lazy 로드용 */
export default function DailySalesChart({ data }: { data: { day: string; 시술: number; 제품: number; 기타: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v, i) => i % 5 === 0 ? v : ''} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v.toFixed(0)}만원`, name]}
          contentStyle={{ borderRadius: 12, border: '1px solid #f0f0f0', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* isAnimationActive=false: 애니메이션 첫 프레임(막대 높이 0)이 화면·캡처에 남아 "데이터가 있는데 빈 차트"로 보이던 것 방지 */}
        <Bar dataKey="시술" stackId="a" fill="#1a3a8f" radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="제품" stackId="a" fill="#7c3aed" radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="기타" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
