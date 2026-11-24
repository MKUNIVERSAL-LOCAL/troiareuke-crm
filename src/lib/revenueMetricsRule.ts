/**
 * revenueMetricsRule — 월 매출 지표 확장 (순수 모듈, 저장소 미참조). 147, GAP P-6.
 * 정의는 docs/ANALYTICS-DEFINITIONS.md 에, 공식은 e2e/lib-units.spec.ts 가 고정한다. 확정값과 예측값(월말 예상)을 구분한다.
 *  - 매출 = 결제일이 그 달인 완료(completed) 결제 금액 합(매출 화면 "총 매출"과 같은 정의, 환불·대기 제외).
 *  - 전월/전년 동월 대비 = (이달 − 비교달) ÷ 비교달 × 100, 비교달이 0 이면 산출하지 않음.
 *  - 목표 달성률 = 매출 ÷ 목표 × 100 (목표 없으면 없음).
 *  - 신규 고객 매출 = 그 달에 등록된 고객의 결제 합, 기존 = 나머지(고객 없는 결제 포함).
 *  - 할인 합 = 완료 결제의 discountAmount 합.
 *  - 회차권 판매 = type=program 완료 결제 합(현금 유입), 회차권 실현 = 그 달 시술 기록이 차감한 회차 × 회당 가격(pricePaid ÷ 총 회차), 기간제·회차 0 은 제외.
 *  - 미사용 잔액 = 진행 중(미완료) 회차권의 잔여 회차 × 회당 가격 합(시점값, 달과 무관).
 *  - 매출원가 = '제품 매입'·'소모품 매입' 지출, 판관비 = 나머지 지출(그 달). 손익분기 매출 = 판관비 ÷ (1 − 매출원가율), 원가율 ≥ 1 이면 없음.
 *  - 영업시간 = 그 달(이달이면 오늘까지) 휴무·지정 휴일이 아닌 날의 (마감 − 오픈) 합(시간). 시간당 매출 = 매출 ÷ 영업시간.
 *  - 월말 예상(예측) = 이달에만: 매출 ÷ 지난 일수 × 그 달 일수.
 */
export interface MetricPayment { paymentDate: string; type: 'program' | 'product' | 'single_treatment' | 'other'; status: 'completed' | 'refunded' | 'pending'; amount: number; discountAmount?: number; customerId?: string }
export interface MetricExpense { expenseDate: string; category: string; amount: number }
export interface MetricProgram { id: string; pricePaid: number; totalSessions: number | null; usedSessions: number; isCompleted?: boolean }
export interface MetricLog { treatmentDate: string; customerProgramId?: string; sessionsUsed?: number }
export interface MetricCustomer { id: string; registeredAt: string }
export interface MetricHours { open: string; close: string; isOff: boolean }

export interface MonthMetricsInput {
  month: string;              // YYYY-MM
  today: string;              // YYYY-MM-DD
  payments: MetricPayment[];
  expenses: MetricExpense[];
  programs: MetricProgram[];
  logs: MetricLog[];
  customers: MetricCustomer[];
  target: number | null;
  businessHours?: Record<string, MetricHours>;
  holidays?: string[];
  cogsCategories?: string[];  // 기본 '제품 매입'·'소모품 매입'
}

export interface MonthMetrics {
  month: string;
  total: number; prevMonth: number; lastYear: number;
  momPct: number | null; yoyPct: number | null;
  target: number | null; achievementPct: number | null;
  newCustomerRevenue: number; existingCustomerRevenue: number; newSharePct: number | null;
  discount: number;
  programSold: number; programRealized: number; unusedBalance: number;
  cogs: number; sga: number; breakEven: number | null;
  openHours: number | null; perHour: number | null;
  daysElapsed: number; daysInMonth: number; isCurrentMonth: boolean; projected: number | null;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DEFAULT_COGS = ['제품 매입', '소모품 매입'];

function pct(cur: number, base: number): number | null {
  if (!(base > 0)) return null;
  return Math.round(((cur - base) / base) * 100);
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 그 달의 영업시간 합(시간) — 이달이면 오늘까지. 영업시간 설정이 없으면 null */
export function openHoursInMonth(month: string, today: string, hours: Record<string, MetricHours> | undefined, holidays: string[] = []): number | null {
  if (!hours || Object.keys(hours).length === 0) return null;
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const last = today.startsWith(month) ? Number(today.slice(8, 10)) : days;
  let minutes = 0;
  for (let d = 1; d <= last; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    if (holidays.includes(iso)) continue;
    const h = hours[DAY_LABELS[new Date(y, m - 1, d).getDay()]];
    if (!h || h.isOff) continue;
    const o = toMin(h.open);
    let c = h.close === '00:00' ? 24 * 60 : toMin(h.close);
    if (o === null || c === null) continue;
    if (c <= o) c += 24 * 60;
    minutes += c - o;
  }
  return Math.round((minutes / 60) * 10) / 10;
}

export function monthMetrics(i: MonthMetricsInput): MonthMetrics {
  const done = i.payments.filter(p => p.status === 'completed');
  const sum = (month: string) => done.filter(p => p.paymentDate.startsWith(month)).reduce((s, p) => s + p.amount, 0);
  const inMonth = done.filter(p => p.paymentDate.startsWith(i.month));
  const total = inMonth.reduce((s, p) => s + p.amount, 0);
  const prevMonth = sum(shiftMonth(i.month, -1));
  const lastYear = sum(shiftMonth(i.month, -12));
  const newIds = new Set(i.customers.filter(c => (c.registeredAt || '').startsWith(i.month)).map(c => c.id));
  const newCustomerRevenue = inMonth.filter(p => p.customerId && newIds.has(p.customerId)).reduce((s, p) => s + p.amount, 0);
  const discount = inMonth.reduce((s, p) => s + Math.max(0, p.discountAmount || 0), 0);
  const programSold = inMonth.filter(p => p.type === 'program').reduce((s, p) => s + p.amount, 0);
  const perSession = new Map<string, number>();
  for (const p of i.programs) if (p.totalSessions && p.totalSessions > 0) perSession.set(p.id, p.pricePaid / p.totalSessions);
  const programRealized = Math.round(i.logs.filter(l => l.customerProgramId && l.treatmentDate.startsWith(i.month))
    .reduce((s, l) => s + (perSession.get(l.customerProgramId as string) || 0) * Math.max(0, Number(l.sessionsUsed) || 0), 0));
  const unusedBalance = Math.round(i.programs.filter(p => !p.isCompleted && p.totalSessions && p.totalSessions > 0)
    .reduce((s, p) => s + Math.max(0, (p.totalSessions as number) - Math.max(0, p.usedSessions || 0)) * (perSession.get(p.id) || 0), 0));
  const cogsCats = i.cogsCategories ?? DEFAULT_COGS;
  const monthExpenses = i.expenses.filter(e => e.expenseDate.startsWith(i.month));
  const cogs = monthExpenses.filter(e => cogsCats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const sga = monthExpenses.filter(e => !cogsCats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const cogsRate = total > 0 ? cogs / total : null;
  const breakEven = cogsRate !== null && cogsRate < 1 ? Math.round(sga / (1 - cogsRate)) : (total === 0 && cogs === 0 ? Math.round(sga) : null);
  const [y, m] = i.month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrentMonth = i.today.startsWith(i.month);
  const daysElapsed = isCurrentMonth ? Number(i.today.slice(8, 10)) : daysInMonth;
  const openHours = openHoursInMonth(i.month, i.today, i.businessHours, i.holidays);
  return {
    month: i.month, total, prevMonth, lastYear,
    momPct: pct(total, prevMonth), yoyPct: pct(total, lastYear),
    target: i.target, achievementPct: i.target && i.target > 0 ? Math.round((total / i.target) * 100) : null,
    newCustomerRevenue, existingCustomerRevenue: total - newCustomerRevenue, newSharePct: total > 0 ? Math.round((newCustomerRevenue / total) * 100) : null,
    discount, programSold, programRealized, unusedBalance,
    cogs, sga, breakEven,
    openHours, perHour: openHours && openHours > 0 ? Math.round(total / openHours) : null,
    daysElapsed, daysInMonth, isCurrentMonth,
    projected: isCurrentMonth && daysElapsed > 0 && total > 0 ? Math.round((total / daysElapsed) * daysInMonth) : null,
  };
}
