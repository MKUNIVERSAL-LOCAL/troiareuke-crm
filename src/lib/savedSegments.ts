// savedSegments — 저장 세그먼트의 보관(지점 설정 행, 기기 동기)과 고객 사실 수집 (비코어, 166, GAP C-6·M-2). 규칙은 segmentFilterRule.ts
import { CustomerStore, ReservationStore } from './store';
import { getPreference, setPreference } from './shopPreferences';
import { buildCustomerStatsIndex, statsFor } from './customerStats';
import { buildSegmentIndex } from './customerSegments';
import { isUpcomingReservation } from './upcomingRule';
import { isCountableCustomer } from './customerScope';
import { consentOf } from './marketingConsent';
import { todayISO } from './format';
import { matchesSegment, type CustomerFacts, type SavedSegment, type SegmentCondition } from './segmentFilterRule';

function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function listSavedSegments(): SavedSegment[] {
  const v = getPreference('savedSegments');
  return Array.isArray(v) ? v : [];
}
export function saveSegment(name: string, condition: SegmentCondition, id?: string): SavedSegment {
  const list = listSavedSegments();
  const now = new Date().toISOString();
  const existing = id ? list.find(s => s.id === id) : undefined;
  const saved: SavedSegment = existing ? { ...existing, name: name.trim(), condition, updatedAt: now } : { id: genId(), name: name.trim(), condition, createdAt: now, updatedAt: now };
  setPreference('savedSegments', existing ? list.map(s => (s.id === saved.id ? saved : s)) : [...list, saved]);
  return saved;
}
export function deleteSegment(id: string): void {
  setPreference('savedSegments', listSavedSegments().filter(s => s.id !== id));
}

/** 고객별 평가 사실 — 통계·RFM·이탈·동의를 한 번에(전수 스캔이라 호출 쪽이 useMemo) */
export function buildSegmentFacts(): Map<string, CustomerFacts> {
  const today = todayISO();
  const stats = buildCustomerStatsIndex();
  const seg = buildSegmentIndex(stats);
  const upcoming = new Set<string>();
  for (const r of ReservationStore.getAll()) if (isUpcomingReservation(r, today)) upcoming.add(r.customerId);
  const out = new Map<string, CustomerFacts>();
  for (const c of CustomerStore.getAll().filter(isCountableCustomer)) {
    const s = statsFor(c, stats);
    const v = seg.get(c.id);
    out.set(c.id, {
      id: c.id, grade: c.grade, tags: c.tags || [], lastVisitDate: s.lastVisitDate, totalVisits: s.totalVisits, totalSpent: s.totalSpent,
      rfmSegment: v?.rfm.segment ?? null, churnLevel: v?.churn?.level ?? null,
      birthMonth: c.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(c.birthDate) ? Number(c.birthDate.slice(5, 7)) : null,
      hasUpcoming: upcoming.has(c.id), adConsent: consentOf(c).ad,
    });
  }
  return out;
}

/** 조건에 맞는 고객 id 집합 */
export function segmentIds(condition: SegmentCondition, facts: Map<string, CustomerFacts>, today = todayISO()): Set<string> {
  const ids = new Set<string>();
  for (const [id, f] of facts) if (matchesSegment(f, condition, today)) ids.add(id);
  return ids;
}

/** 캠페인 등이 가리키는 저장 세그먼트의 고객 id 집합 — segmentId 없음 → null(제한 없음), 삭제된 세그먼트 → 빈 집합(아무에게도) (167) */
export function segmentIdsFor(segmentId: string | undefined, facts?: Map<string, CustomerFacts>): Set<string> | null {
  if (!segmentId) return null; // 기본 매개변수로 두면 segmentId 가 없어도 전수 스캔이 먼저 돈다 (170 리뷰 M-1)
  const seg = listSavedSegments().find(x => x.id === segmentId);
  return seg ? segmentIds(seg.condition, facts ?? buildSegmentFacts()) : new Set();
}
