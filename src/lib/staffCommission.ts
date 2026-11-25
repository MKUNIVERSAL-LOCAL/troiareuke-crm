// staffCommission — 인센티브 비율 설정 저장 (비코어, 233)
// 설정 행(preferences)에 두어 NAS 로 동기화된다 — PC 를 바꿔도 비율이 남는다(결제수단·근무표와 같은 방식).
// 규칙·계산은 commissionRule.ts(순수).
import { getPreference, setPreference } from './shopPreferences';
import { clampRate, DEFAULT_COMMISSION, type CommissionConfig, type CommissionRates } from './commissionRule';

export function getCommissionConfig(): CommissionConfig {
  const saved = getPreference('staffCommission');
  if (!saved || typeof saved !== 'object') return DEFAULT_COMMISSION;
  // 범위 밖·숫자 아닌 값은 여기서 걸러 낸다 — 급여 숫자라 화면과 계산이 다른 값을 말하면 안 된다 (234, 리뷰 M-1·M-2)
  const perStaff: Record<string, Partial<CommissionRates>> = {};
  for (const [staffId, rates] of Object.entries(saved.perStaff && typeof saved.perStaff === 'object' ? saved.perStaff : {})) {
    const own: Partial<CommissionRates> = {};
    if (typeof rates?.serviceRate === 'number' && Number.isFinite(rates.serviceRate)) own.serviceRate = clampRate(rates.serviceRate);
    if (typeof rates?.productRate === 'number' && Number.isFinite(rates.productRate)) own.productRate = clampRate(rates.productRate);
    if (Object.keys(own).length > 0) perStaff[staffId] = own;
  }
  return {
    serviceRate: clampRate(saved.serviceRate),
    productRate: clampRate(saved.productRate),
    perStaff: Object.keys(perStaff).length > 0 ? perStaff : undefined,
  };
}

export function saveCommissionConfig(config: CommissionConfig): void {
  // 기본값과 같은 직원별 예외는 지운다 — 설정 행이 쓸데없이 커지지 않게
  const perStaff: Record<string, Partial<CommissionRates>> = {};
  for (const [staffId, rates] of Object.entries(config.perStaff ?? {})) {
    const own: Partial<CommissionRates> = {};
    if (typeof rates?.serviceRate === 'number' && Number.isFinite(rates.serviceRate) && clampRate(rates.serviceRate) !== clampRate(config.serviceRate)) own.serviceRate = clampRate(rates.serviceRate);
    if (typeof rates?.productRate === 'number' && Number.isFinite(rates.productRate) && clampRate(rates.productRate) !== clampRate(config.productRate)) own.productRate = clampRate(rates.productRate);
    if (Object.keys(own).length > 0) perStaff[staffId] = own;
  }
  setPreference('staffCommission', {
    serviceRate: clampRate(config.serviceRate),
    productRate: clampRate(config.productRate),
    ...(Object.keys(perStaff).length > 0 ? { perStaff } : {}),
  });
}
