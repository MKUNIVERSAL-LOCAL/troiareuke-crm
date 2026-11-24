// resourceStore — 베드/룸 자원 목록과 예약 ↔ 자원 배정 (비코어, 142, GAP R-5)
// 코어 Reservation 에 resourceId 가 없어(toDbReservation 이 모르는 필드는 버린다 — 코어 수정은 승인 A 항목) 배정을 지점 설정(preferences)에 둔다.
// 설정 행은 shop_settings 하나로 NAS 동기(staffAliases·staffSchedules 와 같은 방식). 배정 맵은 저장할 때마다 지난 예약(60일 전)·없는 예약을 정리해 설정 행이 커지지 않게 한다.
import { getPreference, setPreference } from './shopPreferences';
import { ReservationStore } from './store';
import { todayISO } from './format';
import type { Resource } from '../types';

const KEEP_DAYS = 60;

export function allResources(): Resource[] {
  const v = getPreference('resources');
  return Array.isArray(v) ? v : [];
}

export function activeResources(): Resource[] {
  return allResources().filter(r => r.isActive);
}

export function saveResources(list: Resource[]): void {
  setPreference('resources', list);
}

export function resourceAssignments(): Record<string, string> {
  const v = getPreference('reservationResources');
  return v && typeof v === 'object' ? v : {};
}

export function resourceOf(reservationId: string): Resource | null {
  const id = resourceAssignments()[reservationId];
  return id ? allResources().find(r => r.id === id) ?? null : null;
}

/** 예약에 자원을 붙이거나(resourceId) 뗀다(null). 저장하며 오래된·없는 예약의 배정을 정리한다 */
export function assignResource(reservationId: string, resourceId: string | null): void {
  const next = pruned(resourceAssignments());
  if (resourceId) next[reservationId] = resourceId; else delete next[reservationId];
  setPreference('reservationResources', next);
}

function pruned(map: Record<string, string>): Record<string, string> {
  const cutoff = new Date(`${todayISO()}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const keepFrom = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const dates = new Map(ReservationStore.getAll().map(r => [r.id, r.date] as const));
  const out: Record<string, string> = {};
  for (const [rid, res] of Object.entries(map)) {
    const d = dates.get(rid);
    if (!d || d >= keepFrom) out[rid] = res; // 이 기기 캐시에 없는 예약(다른 기기 것·아직 안 받은 것)은 지우지 않는다 — 날짜를 알고 60일 지난 것만 (144 리뷰 M-2)
  }
  return out;
}

/** 자원 삭제 — 앞으로의 예약에 배정돼 있으면 건수를 돌려주고 삭제하지 않는다(호출 쪽이 확인 뒤 force) */
export function removeResource(resourceId: string, force = false): { removed: boolean; upcoming: number } {
  const today = todayISO();
  const dates = new Map(ReservationStore.getAll().filter(r => r.status !== 'cancelled' && r.status !== 'noshow').map(r => [r.id, r.date] as const));
  const upcoming = Object.entries(resourceAssignments()).filter(([rid, res]) => res === resourceId && (dates.get(rid) ?? '') >= today).length;
  if (upcoming > 0 && !force) return { removed: false, upcoming };
  saveResources(allResources().filter(r => r.id !== resourceId));
  const next = pruned(resourceAssignments());
  for (const [rid, res] of Object.entries(next)) if (res === resourceId) delete next[rid];
  setPreference('reservationResources', next);
  return { removed: true, upcoming };
}

export function newResourceId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}
