/** 차트 지연 로드 중 자리 — 같은 높이를 차지해 레이아웃이 튀지 않게 (recharts는 첫 화면 번들에서 분리, 2026-11-18) */
export default function ChartFallback({ height, dark = false }: { height: number; dark?: boolean }) {
  return <div style={{ height }} className={`w-full rounded-xl animate-pulse ${dark ? 'bg-slate-800/60' : 'bg-gray-50'}`} aria-hidden="true" />;
}
