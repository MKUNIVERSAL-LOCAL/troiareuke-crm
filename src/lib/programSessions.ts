import { CustomerProgramStore, TreatmentLogStore, initializeStores } from './store';
import type { CustomerProgram } from '../types';
import { buildUsedSessionsIndex, derivedUsedSessions, remainingSessions, sessionsDrift } from './programSessionsRule';

/**
 * 회차권 사용·잔여 회차를 시술 기록에서 다시 센다(규칙은 programSessionsRule, 순수). 16차 점검 #H2 — 다기기 동시 차감 유실 우회.
 * 표시는 항상 파생값, 저장값은 고객 상세를 열 때·기록 저장 뒤 한 번 맞춘다(customerStats 와 같은 방식).
 */
export function usedSessionsFor(cp: CustomerProgram): number {
  return derivedUsedSessions(cp, buildUsedSessionsIndex(TreatmentLogStore.getByCustomer(cp.customerId)));
}

export function remainingFor(cp: CustomerProgram): number | null {
  return remainingSessions(cp, usedSessionsFor(cp));
}

/**
 * 이 고객의 회차권 중 저장값이 기록 합과 다른 것을 고쳐 쓴다 — 하이드레이션(initializeStores) 뒤에만. 완료 여부는 코어 useSession 과 같이
 * "기록 합이 총 회차에 닿으면 완료" 로만 올리고, 수동 완료(기록이 모자라도 완료)는 되돌리지 않는다.
 */
export function healProgramSessionsWhenReady(customerId: string, onHealed?: (healed: CustomerProgram[]) => void): void {
  void initializeStores().then(() => {
    if (TreatmentLogStore.getAll().length === 0) return; // 컬렉션이 통째로 비었으면(로드 실패·하이드레이션 전) 손대지 않는다
    const idx = buildUsedSessionsIndex(TreatmentLogStore.getByCustomer(customerId));
    const healed: CustomerProgram[] = [];
    for (const cp of CustomerProgramStore.getByCustomer(customerId)) {
      if (cp.id.startsWith('sample_')) continue;
      const used = sessionsDrift(cp, idx);
      if (used === null) continue;
      const isCompleted = cp.isCompleted || (cp.totalSessions != null && used >= cp.totalSessions);
      const u = CustomerProgramStore.update(cp.id, { usedSessions: used, isCompleted });
      if (u) healed.push(u);
    }
    if (healed.length > 0) {
      console.warn('[programSessions] 회차권 사용 회차를 기록 기준으로 맞춤:', healed.map(h => `${h.programName} → ${h.usedSessions}`).join(', '));
      onHealed?.(healed);
    }
  }).catch(() => { /* 로드 실패는 오프라인 배너가 알린다 */ });
}
