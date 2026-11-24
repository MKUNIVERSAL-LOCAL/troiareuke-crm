/**
 * briefingRule — AI 경영 브리핑 컨텍스트 서식 (순수, 153, GAP D-3 / 마스터 프롬프트 12·13절)
 * 숫자는 전부 내부 엔진(revenueMetricsRule·kpiRule·todayTasks·customerSegments·stockRule)이 계산한 값이고 AI 는 해석·추천만 한다.
 * 줄마다 [확정]/[예측]/[추정] 라벨과 기간·근거(정의 모듈)를 붙여 AI 가 출처를 말할 수 있게 한다. 직원 실명은 가명(직원A…)으로, 고객은 건수만.
 */
import type { MonthMetrics } from '../revenueMetricsRule';
import type { MonthlyKpis } from '../kpiRule';

export interface BriefingTask { label: string; count: number; detail?: string }
export interface BriefingSegments { total: number; churnHigh: number; churnMedium: number; loyal: number; dormant: number; newThisMonth: number; atRiskRevenue90: number }
export interface BriefingStaffPerf { name: string; completed: number; revenue: number }
export interface BriefingInput {
  shopLabel: string;            // 매장 이름 대신 "우리 매장" 등 — 실명 불필요
  today: string;                // YYYY-MM-DD
  month: string;                // YYYY-MM
  metrics: MonthMetrics | null; // 매출 권한 없으면 null
  kpi: MonthlyKpis | null;
  tasks: BriefingTask[];
  segments: BriefingSegments | null;
  lowStock: { name: string; stock: number; minStock: number; unit: string }[];
  staff: BriefingStaffPerf[];   // 실명 → 가명으로 바뀐다
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (v: number | null) => (v === null ? '산출 불가' : `${v > 0 ? '+' : ''}${v}%`);

/** 직원 실명 → 직원A·직원B… (호출마다 같은 순서면 같은 가명) */
export function pseudonymizeStaff(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  for (const n of names) {
    if (map.has(n)) continue;
    map.set(n, `직원${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`);
    i++;
  }
  return map;
}

export function formatBriefing(i: BriefingInput): string {
  const lines: string[] = [];
  lines.push(`[기준] ${i.shopLabel} · 오늘 ${i.today} · 이달 ${i.month} · 라벨: [확정]=기록 집계, [예측]=추정치(바뀔 수 있음), [추정]=근사값`);
  if (i.metrics) {
    const m = i.metrics;
    lines.push(`[확정] 이달 매출 ${won(m.total)} (결제일 기준 완료 결제 합, 환불 제외 — revenueMetricsRule.total)`);
    lines.push(`[확정] 전월 대비 ${pct(m.momPct)} (지난달 ${won(m.prevMonth)}) · 전년 동월 대비 ${pct(m.yoyPct)} (작년 ${won(m.lastYear)})`);
    lines.push(m.target ? `[확정] 목표 ${won(m.target)} 대비 달성률 ${m.achievementPct}%` : `[확정] 월 목표 미설정`);
    lines.push(`[확정] 신규 고객 매출 ${won(m.newCustomerRevenue)} (${m.newSharePct === null ? '비중 산출 불가' : `${m.newSharePct}%`}) · 기존 ${won(m.existingCustomerRevenue)} · 할인 합 ${won(m.discount)}`);
    lines.push(`[확정] 회원권 판매 ${won(m.programSold)} · 이달 실현 ${won(m.programRealized)} · 미사용 회원권 잔액(시점) ${won(m.unusedBalance)}`);
    lines.push(`[확정] 매출원가 ${won(m.cogs)} · 판관비 ${won(m.sga)} · 손익분기 매출 ${m.breakEven === null || m.sga === 0 ? '산출 불가(판관비 0 또는 원가≥매출)' : won(m.breakEven)}`);
    lines.push(`[확정] 영업시간 ${m.openHours === null ? '설정 없음' : `${m.openHours}시간`} · 시간당 매출 ${m.perHour === null ? '산출 불가' : won(m.perHour)}`);
    if (m.isCurrentMonth) lines.push(`[예측] 월말 예상 매출 ${m.projected === null ? '산출 불가' : won(m.projected)} (지금까지 ${m.daysElapsed}/${m.daysInMonth}일 일평균 × 일수 — 주말·이벤트 반영 안 됨)`);
  } else {
    lines.push('[권한] 매출 자료는 이 계정에 제공되지 않습니다.');
  }
  if (i.kpi) {
    const k = i.kpi;
    lines.push(`[확정] 이달 방문 고객 ${k.visitors}명 · 재방문율 ${k.revisitRate === null ? '산출 불가' : `${k.revisitRate}%`} (${k.returning}명) · 재예약률 ${k.rebookRate === null ? '산출 불가' : `${k.rebookRate}%`} (${k.rebooked}명) · 객단가 ${k.avgTicket === null ? '산출 불가' : won(k.avgTicket)} (kpiRule)`);
  }
  if (i.segments) {
    const s = i.segments;
    lines.push(`[확정] 고객 ${s.total}명: 이탈 위험 높음 ${s.churnHigh}명(90일 위험 매출 [추정] ${won(s.atRiskRevenue90)}) · 주의 ${s.churnMedium}명 · 충성 ${s.loyal}명 · 휴면 ${s.dormant}명 · 이달 신규 ${s.newThisMonth}명 (churnRule·rfmRule: 개인 방문 주기 대비 경과 비율 ≥2.0 높음, ≥1.3 주의)`);
  }
  if (i.tasks.length) {
    lines.push('[확정] 오늘 할 일(todayTasks): ' + i.tasks.map(t => `${t.label} ${t.count}건${t.detail ? `(${t.detail})` : ''}`).join(' / '));
  } else {
    lines.push('[확정] 오늘 할 일: 없음');
  }
  if (i.lowStock.length) {
    lines.push('[확정] 재고 부족: ' + i.lowStock.map(p => `${p.name} ${p.stock}${p.unit}(안전 ${p.minStock})`).join(', '));
  }
  if (i.staff.length) {
    const alias = pseudonymizeStaff(i.staff.map(s => s.name));
    lines.push('[확정] 직원별 이달 완료 예약·실결제(실명은 가명): ' + i.staff.map(s => `${alias.get(s.name)} ${s.completed}건 ${won(s.revenue)}`).join(' / '));
  }
  return lines.join('\n');
}

/** 브리핑 전용 시스템 프롬프트 — 계산 금지·근거 인용·불확실성 표기 */
export const BRIEFING_SYSTEM = `당신은 더마솔루션의 AI 경영 비서입니다. 아래 <data> 블록의 숫자는 프로그램이 이미 계산한 값입니다.
규칙: ① 숫자를 새로 계산하거나 추정하지 말고 자료의 값을 그대로 인용하세요(비율·합계도 자료에 있는 것만). ② 각 판단마다 근거 줄의 라벨([확정]/[예측]/[추정])과 기간을 함께 말하세요. ③ 자료에 없는 것은 "자료 없음"이라고 하세요.
④ 형식: 1) 한 줄 요약 2) 잘 된 점 2가지 3) 걱정되는 점 2가지(근거) 4) 이번 주에 할 행동 3가지(누구에게·무엇을, 고객·직원은 자료의 가명/건수로만) 5) 불확실한 부분. 한국어, 존댓말, 과장 없이.`;
