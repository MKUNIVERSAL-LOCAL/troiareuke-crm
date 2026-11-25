// ═══════════════════════════════════════════════════════════════
// commissionRule — 직원 인센티브(수당) 계산 규칙 (순수 모듈, 233, GAP S-1)
// ───────────────────────────────────────────────────────────────
// 왜: 직원별 월 실적은 모으면서도 "그래서 수당이 얼마인지"는 매장이 계산기로 따로 계산했다.
//     상용 CRM(Mindbody·Boulevard)은 시술·제품 비율로 커미션을 계산해 보고서에 함께 낸다.
// 기준(화면에 그대로 적는다 — 급여는 틀리면 사람이 다친다):
//   - 시술 수당 = 그 직원 완료 예약에 연결된 **실결제액** × 시술 비율. 예약액(정가)이 아니라 실제 입금 기준이라
//     할인·환불·회차권 차감이 이미 반영돼 있다. 예약에 연결되지 않은 결제(회차권 선결제 등)는 빠진다.
//   - 제품 수당 = 담당 직원이 기록된 **제품 판매액** × 제품 비율(취소분 제외 — staffPerformance 집계 기준).
//   - 원 단위 내림. 비율은 0~50%, 소수점 한 자리까지.
// 비율은 매장 기본값 + 직원별 예외. 설정하지 않으면(0%) 수당 열을 띄우지 않는다(0원 줄을 보여 주지 않는다).
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export const MAX_COMMISSION_RATE = 50;

export interface CommissionRates {
  /** 시술(실결제액) 비율 % */
  serviceRate: number;
  /** 제품 판매액 비율 % */
  productRate: number;
}

export interface CommissionConfig extends CommissionRates {
  /** 직원별 예외 — 값이 없는 칸은 매장 기본값을 쓴다 */
  perStaff?: Record<string, Partial<CommissionRates>>;
}

export const DEFAULT_COMMISSION: CommissionConfig = { serviceRate: 0, productRate: 0 };

/** 입력칸 값 → 비율. 숫자가 아니거나 범위를 벗어나면 null(저장하지 않고 사유를 보여 준다) */
export function parseRate(input: unknown): number | null {
  if (typeof input === 'number') return normalizeRate(input);
  if (typeof input !== 'string') return null;
  const t = input.trim().replace(/%$/, '').trim();
  if (t === '') return 0;
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return null; // 소수점 한 자리까지, 음수·지수 표기 거부
  return normalizeRate(Number(t));
}

function normalizeRate(n: number): number | null {
  if (!Number.isFinite(n) || n < 0 || n > MAX_COMMISSION_RATE) return null;
  return Math.round(n * 10) / 10;
}

/** 그 직원에게 적용할 비율 — 직원별 예외가 있으면 그것, 없으면 매장 기본값 */
export function ratesFor(staffId: string, config: CommissionConfig = DEFAULT_COMMISSION): CommissionRates {
  const own = config.perStaff?.[staffId];
  return {
    serviceRate: clamp(own?.serviceRate ?? config.serviceRate),
    productRate: clamp(own?.productRate ?? config.productRate),
  };
}

function clamp(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.min(MAX_COMMISSION_RATE, Math.max(0, Math.round(v * 10) / 10));
}

export interface CommissionAmounts {
  service: number;
  product: number;
  total: number;
}

/** 실적 한 줄 → 수당 금액(원 단위 내림) */
export function computeCommission(stat: { paidAmount?: number; productAmount?: number }, rates: CommissionRates): CommissionAmounts {
  const service = floorWon((stat.paidAmount || 0) * clamp(rates.serviceRate) / 100);
  const product = floorWon((stat.productAmount || 0) * clamp(rates.productRate) / 100);
  return { service, product, total: service + product };
}

function floorWon(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 비율이 하나라도 설정돼 있는가 — 전부 0이면 수당 열을 띄우지 않는다 */
export function commissionConfigured(config: CommissionConfig = DEFAULT_COMMISSION): boolean {
  if (config.serviceRate > 0 || config.productRate > 0) return true;
  return Object.values(config.perStaff ?? {}).some(r => (r?.serviceRate ?? 0) > 0 || (r?.productRate ?? 0) > 0);
}

/** 화면·보고 문구에 붙는 기준 설명 */
export function describeCommissionBasis(rates: CommissionRates): string {
  return `시술 ${rates.serviceRate}% × 실결제액 + 제품 ${rates.productRate}% × 제품 판매액 (원 단위 내림)`;
}

/** 수당을 신뢰하기 전에 알아야 하는 한계 — 표 아래에 그대로 띄운다 */
export const COMMISSION_CAVEATS = [
  '수당은 참고 계산입니다. 시술 수당은 완료 예약에 연결된 결제만 세므로, 예약 없이 등록한 결제·회차권 선결제는 빠집니다.',
  '제품 수당은 담당 직원이 기록된 판매만 셉니다(취소분 제외).',
];
