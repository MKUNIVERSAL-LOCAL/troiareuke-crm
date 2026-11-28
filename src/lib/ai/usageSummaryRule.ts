// ═══════════════════════════════════════════════════════════════
// usageSummaryRule — AI 사용량 기록을 읽을 수 있는 요약으로 (순수 모듈, 319, GAP A-4)
// ───────────────────────────────────────────────────────────────
// 왜: `usage.ts` 는 150 부터 호출마다 **날짜별로** 호출 수·입출력 토큰·추정 비용·제공사를 쌓아 왔고
//     기록 90일분을 보관한다. 그런데 화면은 **이달 합계 한 줄**만 보여 줬다 — 어느 날, 어느 제공사에서
//     그 비용이 났는지는 아무 화면에도 없었다. 쌓기만 하고 쓰지 않는 자료는 CLAUDE.md 2절이 금지하는
//     쪽에 가깝다. GAP 표 A-4 는 그 위에 "토큰·비용 없음" 이라고 적고 있었는데(319 에서 정정),
//     토큰과 추정 비용은 150 부터 있었다 — **보이지 않았을 뿐이다**.
// 하는 일: 날짜별 기록 목록을 받아 ① 이달 합계 ② 제공사별 호출 수(많은 순) ③ 최근 날짜 몇 줄
//     ④ 지난달 추정 비용과의 차이를 만든다. 화면·저장소를 모르므로 e2e/lib-units.spec.ts 가 브라우저
//     없이 직접 import 해 검증한다.
// 정직: 비용은 **추정**이다(제공사가 usage 를 안 주면 글자 수로 센다, 단가는 카탈로그 시점 값).
//     지난달 기록이 없으면 비교를 만들지 않는다 — `null` 이다. 0 과 "없음" 을 섞으면 "지난달보다
//     100% 줄었다" 같은 거짓이 나온다(253·254 에서 취소 사유 추세로 실제로 겪은 종류다).
// ═══════════════════════════════════════════════════════════════
import { AI_PROVIDERS } from './catalog';
import { previousMonth } from '../format';
import type { AiProvider } from './types';

/** 아는 제공사 — 기록은 손댈 수 있으므로 모르는 키는 세지 않는다 (321, 리뷰 M-7).
 *  324(리뷰 L-6): 목록을 두 벌로 두지 않는다 — 카탈로그의 `AI_PROVIDERS` 한 곳에서 가져온다. */
const KNOWN_PROVIDERS: readonly AiProvider[] = AI_PROVIDERS;

/** `usage.ts` 가 날짜별로 쌓는 한 줄 — 이 모듈은 저장소를 모르고 모양만 안다 */
export interface AiUsageDayInput {
  date: string;            // YYYY-MM-DD (기기 현지 날짜)
  calls: number;
  input: number;
  output: number;
  usd: number;             // 누적 원값(반올림 전)
  byProvider: Partial<Record<AiProvider, number>>;
}

export interface AiUsageSummary {
  month: string;                                               // YYYY-MM
  calls: number;
  input: number;
  output: number;
  usd: number;                                                 // 표시용 반올림(소수 4자리)
  byProvider: { provider: AiProvider; calls: number }[];        // 많은 순, 0건은 넣지 않는다
  daily: { date: string; calls: number; usd: number }[];        // 최신 날짜부터
  prevMonthUsd: number | null;                                 // 지난달 기록이 없으면 null
  deltaUsd: number | null;                                      // 같은 이유로 null
  recordedDays: number;                                        // 기록이 있는 날 수(이달)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * @param days 날짜별 기록 — 순서는 상관없다(이 함수가 정렬한다)
 * @param month 보려는 달 YYYY-MM
 * @param dailyLimit 최근 몇 줄까지 보여 줄지(화면 사정, 기본 7)
 */
export function summarizeAiUsage(days: AiUsageDayInput[], month: string, dailyLimit = 7): AiUsageSummary {
  const ofMonth = days.filter(d => typeof d?.date === 'string' && d.date.startsWith(`${month}-`));
  // 321(리뷰 L-4): 기록이 문자열이면(`usd: '0.5'`) 합이 NaN 이 되어 화면에 "약 $NaN" 이 나갔다.
  // 324(321~323 리뷰 L-5): `byProvider` 만 음수를 막아 **합계는 음수를 그대로 더했다** — 같은 논리면 총계도 막아야 한다
  // (호출 수·토큰·비용에 음수는 없다. 음수가 들어온 기록은 손댄 것이고, 그것을 합에 반영하면 화면이 거짓을 말한다).
  const num = (v: unknown): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const total = ofMonth.reduce((s, d) => ({
    calls: s.calls + num(d.calls),
    input: s.input + num(d.input),
    output: s.output + num(d.output),
    usd: s.usd + num(d.usd),
  }), { calls: 0, input: 0, output: 0, usd: 0 });

  const counts = new Map<AiProvider, number>();
  for (const d of ofMonth) {
    for (const [p, n] of Object.entries(d.byProvider || {})) {
      // 321(318~320 리뷰 M-7): `!n` 은 **음수를 통과**시켰다(손댄 기록·옛 형식에서 `-5건` 이 줄로 나갔다).
      // 그리고 모르는 제공사 키(`grok` 등)가 들어오면 화면이 라벨 표를 찾다가 **예외로 카드를 못 그린다** —
      // 기록은 `JSON.parse` 만 거쳐 오므로 모양을 믿을 수 없다. 아는 제공사·양수만 센다.
      if (!(typeof n === 'number' && n > 0)) continue;
      if (!KNOWN_PROVIDERS.includes(p as AiProvider)) continue;
      counts.set(p as AiProvider, (counts.get(p as AiProvider) || 0) + n);
    }
  }

  const prev = previousMonth(month);
  const prevDays = days.filter(d => typeof d?.date === 'string' && d.date.startsWith(`${prev}-`));
  const prevMonthUsd = prevDays.length === 0 ? null : round4(prevDays.reduce((s, d) => s + num(d.usd), 0));

  return {
    month,
    calls: total.calls,
    input: total.input,
    output: total.output,
    usd: round4(total.usd),
    byProvider: [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([provider, calls]) => ({ provider, calls })),
    daily: [...ofMonth]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, Math.max(0, dailyLimit)) // 321(리뷰 L-5): 음수면 slice 가 **맨 최신 줄을 빼고** 돌려줬다
      .map(d => ({ date: d.date, calls: num(d.calls), usd: round4(num(d.usd)) })),
    prevMonthUsd,
    // 321(리뷰 L-3): 차이를 **반올림 전 합**에서 내면 `usd - prevMonthUsd ≠ deltaUsd` 가 되고,
    // 0.00005 같은 차이가 "$0.0000 보다 $0.0001 많습니다" 로 **두 배 과장**돼 나갔다. 표시값끼리 뺀다.
    deltaUsd: prevMonthUsd === null ? null : round4(round4(total.usd) - prevMonthUsd),
    recordedDays: ofMonth.length,
  };
}

/**
 * 지난달 대비 한 줄 — 비교할 수 없으면 **만들지 않는다**(`null`).
 * "변화 없음" 과 "비교할 기록이 없음" 은 다른 말이다.
 */
export function describeAiUsageDelta(summary: AiUsageSummary): string | null {
  if (summary.prevMonthUsd === null || summary.deltaUsd === null) return null;
  const abs = Math.abs(summary.deltaUsd);
  if (abs < 0.0001) return `지난달과 같습니다(약 $${summary.prevMonthUsd.toFixed(4)})`;
  const dir = summary.deltaUsd > 0 ? '많습니다' : '적습니다';
  return `지난달(약 $${summary.prevMonthUsd.toFixed(4)})보다 약 $${abs.toFixed(4)} ${dir}`;
}
