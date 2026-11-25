// staffCommission — 인센티브 비율 설정 저장 (비코어, 233)
// 설정 행(preferences)에 두어 NAS 로 동기화된다 — PC 를 바꿔도 비율이 남는다(결제수단·근무표와 같은 방식).
// 규칙·계산은 commissionRule.ts(순수).
import { getPreference, setPreference } from './shopPreferences';
import { DEFAULT_COMMISSION, type CommissionConfig, type CommissionRates } from './commissionRule';

export function getCommissionConfig(): CommissionConfig {
  const saved = getPreference('staffCommission');
  if (!saved || typeof saved !== 'object') return DEFAULT_COMMISSION;
  return {
    serviceRate: num(saved.serviceRate),
    productRate: num(saved.productRate),
    perStaff: saved.perStaff && typeof saved.perStaff === 'object' ? saved.perStaff : undefined,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function saveCommissionConfig(config: CommissionConfig): void {
  // 기본값과 같은 직원별 예외는 지운다 — 설정 행이 쓸데없이 커지지 않게
  const perStaff: Record<string, Partial<CommissionRates>> = {};
  for (const [staffId, rates] of Object.entries(config.perStaff ?? {})) {
    const own: Partial<CommissionRates> = {};
    if (typeof rates?.serviceRate === 'number' && rates.serviceRate !== config.serviceRate) own.serviceRate = rates.serviceRate;
    if (typeof rates?.productRate === 'number' && rates.productRate !== config.productRate) own.productRate = rates.productRate;
    if (Object.keys(own).length > 0) perStaff[staffId] = own;
  }
  setPreference('staffCommission', {
    serviceRate: config.serviceRate,
    productRate: config.productRate,
    ...(Object.keys(perStaff).length > 0 ? { perStaff } : {}),
  });
}
