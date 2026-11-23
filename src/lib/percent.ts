/** 비중(%) 분배 — 각자 반올림하면 33+33=66% 처럼 합이 100 이 안 된다. 최대 잔여(largest remainder)로 합을 100 에 맞춘다 (10차 숫자 점검 #L3, 2026-11-20) */
export function splitPercent(values: number[]): number[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map(v => (Math.max(0, v) / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) { if (rest <= 0) break; if (values[i] > 0) { floors[i] += 1; rest -= 1; } }
  return floors;
}
