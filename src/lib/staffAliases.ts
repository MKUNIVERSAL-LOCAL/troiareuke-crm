// staffAliases — 직원 이름 변경 이력 (비코어, 11차 점검 2026-11-23 #M2)
// 제품 판매 행은 담당자를 이름으로 들고 있고 수정 API 가 없어(코어 ProductSaleStore) 직원 이름을 바꾸면 그 달 제품 실적이 "이름 불일치"로 빠져
// 인센티브가 줄었다. 옛 이름을 지점 설정에 남겨 실적 집계(staffPerformance)가 되짚는다. 현재 다른 직원의 이름과 겹치면 현재 이름이 우선.
import { getPreference, setPreference } from './shopPreferences';

const MAX_PER_STAFF = 10;

export function staffAliases(): Record<string, string[]> {
  const v = getPreference('staffAliases');
  return v && typeof v === 'object' ? v : {};
}

export function recordStaffAlias(staffId: string, oldName: string): void {
  const name = oldName.trim();
  if (!name) return;
  const all = staffAliases();
  const mine = all[staffId] ?? [];
  if (mine.includes(name)) return;
  setPreference('staffAliases', { ...all, [staffId]: [name, ...mine].slice(0, MAX_PER_STAFF) });
}
