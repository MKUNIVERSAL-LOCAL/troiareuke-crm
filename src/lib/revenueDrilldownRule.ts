/**
 * revenueDrilldownRule — 매출 지표 **드릴다운** (순수 모듈, 저장소 미참조). 260, GAP P-6.
 *
 * 왜: 147 이 지표 10개를 냈지만 숫자만 보여 줘서, 매장이 "신규 고객 매출 320만" 이 어디서 나온 값인지
 *     확인할 길이 없었다(벤치마크 B: Metabase 드릴다운). 확인할 수 없는 숫자는 결국 쓰지 않게 된다.
 * 하는 일: 카드의 숫자를 만든 **그 줄들**을 돌려준다. 합계는 `revenueMetricsRule.monthMetrics` 와
 *     같은 정의·같은 입력에서 계산하므로 카드 숫자와 1원도 어긋나지 않아야 한다(lib-units 가 고정).
 * 정직성: 고객이 연결되지 않은 결제는 숨기지 않고 "기존 고객 매출" 쪽에 있다고 적는다.
 *     줄이 많으면 상위 100줄만 보여 주고 합계는 전체 기준이라고 밝힌다.
 */
import { localMonthOf } from './revenueMetricsRule';

export interface DrillPayment {
  id: string;
  paymentDate: string;
  status: 'completed' | 'refunded' | 'pending';
  amount: number;
  discountAmount?: number;
  customerId?: string;
  customerName?: string;
}
export interface DrillCustomer { id: string; name?: string; registeredAt: string }
export interface DrillProgram {
  id: string;
  customerName?: string;
  programName?: string;
  pricePaid: number;
  totalSessions: number | null;
  usedSessions: number;
  isCompleted?: boolean;
  expiryDate?: string;
}

export interface DrillRow { key: string; label: string; detail: string; amount: number }
export interface DrillResult {
  rows: DrillRow[];
  total: number;
  /** 줄을 잘랐으면 전체 줄 수 — 합계는 전체 기준이다 */
  truncatedFrom?: number;
  /** 화면에 그대로 적는 한계(없으면 적지 않는다) */
  caveat?: string;
  /**
   * 금액 칸을 아예 보여 주지 않는다 — 권한이 없어 금액을 못 보는 화면용 (270, 리뷰 H-1).
   * 금액을 0 으로 **바꿔서** 넘기면 "합계 0원" 이라는 거짓이 된다(같은 줄의 요약은 실제 금액을 말한다).
   */
  hideAmount?: boolean;
  /** 줄이 하나도 없을 때 보여 줄 말 */
  empty: string;
}

export const DRILL_MAX_ROWS = 100;
const NO_CUSTOMER = '고객 정보 없음'; // **연결하지 않은** 결제 — 그 뒤 삭제된 고객과 구분할 자료가 없다 (리뷰 L-4)
const NO_NAME = '이름 없음';          // 고객은 있는데 **이름만** 비어 있다(엑셀 가져오기) — 둘을 섞어 쓰지 않는다 (281, 리뷰 L-8)
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/**
 * 금액을 숨기는 화면의 줄 순서 — **화면에 보이는 이름 순** (274, 리뷰 M-2 / 275 순수 모듈로 이동).
 * 금액 순을 그대로 쓰면 금액 칸이 없어도 맨 위가 최다 결제자라는 사실이 드러난다.
 * 271 은 `customerId` 로 세웠는데 그 값은 난수라(= 순서가 없다) 안내문의 "이름 순" 과 달랐다.
 * 이름이 같으면 키로 가른다 — 같은 입력이면 항상 같은 순서여야 화면이 깜빡이지 않는다.
 * 입력 배열은 건드리지 않는다(호출 쪽이 같은 배열로 합계를 구한다).
 */
export function sortRowsByLabel(rows: DrillRow[]): DrillRow[] {
  return [...rows].sort((a, b) => a.label.localeCompare(b.label, 'ko') || a.key.localeCompare(b.key));
}

/**
 * 근거 창 바닥의 왼쪽 글자 (277 — 274 가 JSX 안에 적어 둔 것을 규칙으로).
 * 금액을 못 보는 화면은 합계 칸 자체가 없으므로(270) 합계 대신 **사람 수**를 적고,
 * 줄을 잘랐으면 "전체 M명 중 N명" 으로 — 잘린 수만 적으면 같은 화면의 "발송 2,000명" 과 충돌한다(274 리뷰 M-1).
 * 금액을 보는 화면의 줄은 결제·고객·회차권이라 단위가 "줄" 이다(사람 수가 아니다).
 */
export function describeDrillFooter(i: { shown: number; truncatedFrom?: number; hideAmount?: boolean }): string {
  if (i.hideAmount) return i.truncatedFrom ? `전체 ${i.truncatedFrom}명 중 ${i.shown}명` : `${i.shown}명`;
  return `합계${i.truncatedFrom ? ` (전체 ${i.truncatedFrom}줄 기준)` : ` (${i.shown}줄)`}`;
}

/**
 * 줄을 잘랐을 때의 안내 — 자르지 않았으면 null(띠 자체를 그리지 않는다).
 * 금액을 숨긴 창은 금액 순으로 세우지 않으므로(최다 결제자가 드러난다) "금액이 큰" 이라고 적으면 거짓이고,
 * 합계 칸이 없으므로 "위 합계" 를 가리켜도 거짓이다 (274 리뷰 H-1 이 고친 그 문장).
 * 권한 안내는 여기서 반복하지 않는다 — 같은 창의 caveat 가 이미 말한다 (277, 리뷰 L-11).
 */
export function describeDrillTruncation(i: { shown: number; truncatedFrom?: number; hideAmount?: boolean }): string | null {
  if (!i.truncatedFrom) return null;
  if (i.hideAmount) return `줄이 많아 이름 순으로 ${i.shown}줄만 보여 줍니다(전체 ${i.truncatedFrom}명).`;
  return `줄이 많아 금액이 큰 ${i.shown}줄만 보여 줍니다. 위 합계는 전체 ${i.truncatedFrom}줄 기준입니다.`;
}

function finish(rows: DrillRow[], total: number, empty: string, caveat?: string): DrillResult {
  rows.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  if (rows.length > DRILL_MAX_ROWS) {
    return { rows: rows.slice(0, DRILL_MAX_ROWS), total, truncatedFrom: rows.length, empty, caveat };
  }
  return { rows, total, empty, caveat };
}

/** 신규 고객 매출 — 그 달에 등록한 고객별 결제 합(카드의 "신규 ...원" 과 같은 정의) */
export function newCustomerRows(month: string, payments: DrillPayment[], customers: DrillCustomer[]): DrillResult {
  const newOnes = new Map<string, DrillCustomer>();
  for (const c of customers) if (localMonthOf(c.registeredAt || '') === month) newOnes.set(c.id, c);
  const byCustomer = new Map<string, { amount: number; count: number; name: string; registeredAt: string }>();
  let total = 0;
  for (const p of payments) {
    if (p.status !== 'completed' || !p.paymentDate.startsWith(month)) continue;
    if (!p.customerId) continue;
    const c = newOnes.get(p.customerId);
    if (!c) continue;
    total += p.amount;
    // registeredAt 이 비면 localMonthOf('') === '' 이라 이 고객은 애초에 newOnes 에 들어오지 않는다 —
    // 그래서 폴백('날짜 미상')은 도달할 수 없었다. 죽은 분기를 두지 않는다 (281, 리뷰 L-7)
    const prev = byCustomer.get(p.customerId) ?? { amount: 0, count: 0, name: c.name || '이름 없음', registeredAt: c.registeredAt.slice(0, 10) };
    byCustomer.set(p.customerId, { ...prev, amount: prev.amount + p.amount, count: prev.count + 1 });
  }
  const rows: DrillRow[] = [];
  for (const [id, v] of byCustomer) rows.push({ key: id, label: v.name, detail: `결제 ${v.count}건 · 등록 ${v.registeredAt}`, amount: v.amount });
  return finish(rows, total, '이달 등록한 고객의 결제가 아직 없습니다.',
    '고객을 연결하지 않은 결제는 신규에 넣지 않고 기존 고객 매출로 셉니다.');
}

/** 할인 합계 — 할인이 붙은 완료 결제 한 줄씩 */
export function discountRows(month: string, payments: DrillPayment[]): DrillResult {
  const rows: DrillRow[] = [];
  let total = 0;
  for (const p of payments) {
    if (p.status !== 'completed' || !p.paymentDate.startsWith(month)) continue;
    const d = Math.max(0, p.discountAmount || 0);
    if (d <= 0) continue;
    total += d;
    rows.push({ key: p.id, label: p.customerName || NO_CUSTOMER, detail: `${p.paymentDate} · 결제 ${won(p.amount)}`, amount: d });
  }
  return finish(rows, total, '이달 할인한 결제가 없습니다.');
}

/** 미사용 회원권 잔액 — 진행 중 회차권 한 줄씩(잔여 회차 × 회당 가격) */
export function unusedBalanceRows(today: string, programs: DrillProgram[]): DrillResult {
  const rows: DrillRow[] = [];
  let total = 0;
  for (const p of programs) {
    if (p.isCompleted) continue;
    if (!p.totalSessions || p.totalSessions <= 0) continue;                    // 기간제·회차 0 은 잔액 정의가 없다
    if (p.expiryDate && p.expiryDate < today) continue;                        // 만료분은 서비스할 몫이 아니다 (149 리뷰 L-4)
    const remain = Math.max(0, p.totalSessions - Math.max(0, p.usedSessions || 0));
    if (remain <= 0) continue;
    const per = p.pricePaid / p.totalSessions;
    const amount = Math.round(remain * per);
    total += amount;
    rows.push({
      key: p.id,
      // 회차권은 고객에 붙어 있으므로 "고객 정보 없음" 이 아니라 "이름 없음" 이다 (281, 리뷰 L-8)
      label: p.customerName || NO_NAME,
      detail: `${p.programName || '회차권'} · 잔여 ${remain}회 × 회당 ${won(per)}`,
      amount,
    });
  }
  // 카드 숫자는 합을 한 번만 반올림한다 — 줄 합과 1원씩 어긋나지 않게 같은 방식으로 더한다
  return finish(rows, total, '진행 중인 회차권 잔액이 없습니다.',
    '만료된 회차권과 기간제(회차 없는) 상품은 넣지 않습니다.');
}
