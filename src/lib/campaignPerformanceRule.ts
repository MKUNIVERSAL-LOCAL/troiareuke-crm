// campaignPerformanceRule — 캠페인 성과 추정(발송 → N일 내 예약 → 결제) (순수, 157, GAP M-6)
// 어트리뷰션은 추정이다: 발송 뒤 창 안에 생긴 예약·결제를 캠페인 덕으로 "본다"는 뜻이지 인과가 아니다 → 화면은 항상 [추정] 라벨.
// 숫자는 여기서만 계산하고 AI 는 해석만 한다.
const PERFORMANCE_WINDOW_DAYS = 14;

export interface SendRef { customerId: string; at: string }               // 발송 성공 기록(기기별, campaignStore)
export interface ReservationRef { customerId: string; date: string; status: string }
export interface PaymentRef { customerId?: string; paymentDate: string; amount: number; status: string }
export interface CampaignPerformance {
  sent: number;        // 발송 성공 고객 수(중복 제거)
  reserved: number;    // 발송 뒤 N일 안에 예약(취소·노쇼 제외)이 잡힌 고객 수
  paid: number;        // 발송 뒤 N일 안에 결제(완료)한 고객 수
  revenue: number;     // 그 결제 합계(원)
  windowDays: number;
}

/** 발송 시각(ISO, UTC)을 로컬 YYYY-MM-DD 로 — UTC 를 그대로 자르면 KST 00~09시 발송이 전날로 잡힌다 (159 리뷰 M-1) */
function dateOf(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso.slice(0, 10);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function addDaysISO(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function estimatePerformance(sends: SendRef[], reservations: ReservationRef[], payments: PaymentRef[], windowDays = PERFORMANCE_WINDOW_DAYS): CampaignPerformance {
  // 고객별 첫 발송일 — 같은 고객에게 여러 번 갔으면 가장 이른 발송부터 창을 연다
  const first = new Map<string, string>();
  for (const s of sends) { const d = dateOf(s.at); const cur = first.get(s.customerId); if (!cur || d < cur) first.set(s.customerId, d); }
  let reserved = 0, paid = 0, revenue = 0;
  for (const [cid, d] of first) {
    const end = addDaysISO(d, windowDays);
    if (reservations.some(r => r.customerId === cid && r.status !== 'cancelled' && r.status !== 'noshow' && r.date >= d && r.date <= end)) reserved += 1;
    const pays = payments.filter(p => p.customerId === cid && p.status === 'completed' && p.paymentDate >= d && p.paymentDate <= end);
    if (pays.length) { paid += 1; revenue += pays.reduce((a, p) => a + p.amount, 0); }
  }
  return { sent: first.size, reserved, paid, revenue, windowDays };
}

/** 성과 숫자를 만든 한 사람 — 발송일과 창 안에서 찾은 예약·결제 (263, GAP M-6) */
export interface PerformanceRow {
  customerId: string;
  sentOn: string;             // 첫 발송일(로컬 YYYY-MM-DD)
  windowEnd: string;          // 창의 마지막 날
  reservedOn: string | null;  // 창 안 첫 예약일(취소·노쇼 제외) — 없으면 null
  paidOn: string | null;      // 창 안 첫 결제일 — 없으면 null
  amount: number;             // 창 안 결제 합(원)
}

/**
 * 성과 추정의 **근거 목록** — 숫자만 보여 주면 매장이 "이게 그 문자 덕인지" 확인할 수 없다 (263).
 * 같은 창·같은 조건(estimatePerformance 와 같은 식)으로 고르므로 합계가 요약 줄과 어긋나지 않는다.
 * 어트리뷰션은 여전히 추정이다 — 창 안에 있었다는 사실만 말하고 인과라고 말하지 않는다.
 */
export function performanceRows(sends: SendRef[], reservations: ReservationRef[], payments: PaymentRef[], windowDays = PERFORMANCE_WINDOW_DAYS): PerformanceRow[] {
  const first = new Map<string, string>();
  for (const s of sends) { const d = dateOf(s.at); const cur = first.get(s.customerId); if (!cur || d < cur) first.set(s.customerId, d); }
  const rows: PerformanceRow[] = [];
  for (const [cid, d] of first) {
    const end = addDaysISO(d, windowDays);
    const resv = reservations
      .filter(r => r.customerId === cid && r.status !== 'cancelled' && r.status !== 'noshow' && r.date >= d && r.date <= end)
      .map(r => r.date)
      .sort();
    const pays = payments.filter(p => p.customerId === cid && p.status === 'completed' && p.paymentDate >= d && p.paymentDate <= end);
    rows.push({
      customerId: cid,
      sentOn: d,
      windowEnd: end,
      reservedOn: resv[0] ?? null,
      paidOn: pays.length ? pays.map(p => p.paymentDate).sort()[0] : null,
      amount: pays.reduce((a, p) => a + p.amount, 0),
    });
  }
  // 결제한 사람 먼저(금액 큰 순) → 예약만 한 사람 → 아무 것도 없는 사람
  return rows.sort((a, b) =>
    b.amount - a.amount
    || Number(!!b.reservedOn) - Number(!!a.reservedOn)
    || a.sentOn.localeCompare(b.sentOn)
    || a.customerId.localeCompare(b.customerId));
}

/** 한 줄 요약 — 발송이 없으면 null(값을 만들지 않는다) */
export function describePerformance(p: CampaignPerformance, formatPrice: (n: number) => string): string | null {
  if (p.sent === 0) return null;
  return `[추정] 발송 ${p.sent}명 → ${p.windowDays}일 내 예약 ${p.reserved}명 · 결제 ${p.paid}명${p.revenue > 0 ? ` ${formatPrice(p.revenue)}` : ''}`;
}
