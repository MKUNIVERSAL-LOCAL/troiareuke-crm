// staffScheduleStore — 직원 근무표·휴게·버퍼 저장 (비코어, 141)
// 새 컬렉션(`staff_schedules`, 서버 S-7 화이트리스트 승인 B-2 필요) 대신 지점 설정(preferences)에 둔다 —
// shop_settings 한 행으로 NAS 에 동기화되고 PC 교체·로그아웃 wipe 와 무관(staffAliases 와 같은 방식).
// 직원 수 × 요일 7 의 작은 데이터라 설정 행에 충분하다. 두 기기가 동시에 저장하면 마지막 저장이 남는다(설정 전체가 그렇다 — S-1 승인 뒤 개선).
import { getPreference, setPreference } from './shopPreferences';
import type { StaffSchedule } from '../types';

export function allStaffSchedules(): Record<string, StaffSchedule> {
  const v = getPreference('staffSchedules');
  return v && typeof v === 'object' ? v : {};
}

export function getStaffSchedule(staffId: string): StaffSchedule | null {
  return allStaffSchedules()[staffId] ?? null;
}

export function saveStaffSchedule(schedule: StaffSchedule): void {
  setPreference('staffSchedules', { ...allStaffSchedules(), [schedule.staffId]: { ...schedule, updatedAt: new Date().toISOString() } });
}

/** 직원 삭제 시 근무표도 함께 (설정 행에 고아 데이터를 남기지 않게) */
export function removeStaffSchedule(staffId: string): void {
  const all = allStaffSchedules();
  if (!(staffId in all)) return;
  const next = { ...all };
  delete next[staffId];
  setPreference('staffSchedules', next);
}
