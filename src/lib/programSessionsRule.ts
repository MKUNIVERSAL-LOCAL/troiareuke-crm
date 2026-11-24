/**
 * 회차권 사용 회차의 파생 규칙(순수 — store 를 import 하지 않는다, lib-units 스펙 대상).
 * 코어는 사용 회차를 로컬 캐시 기준 절대값으로 서버에 PATCH 한다(store.useSession). 두 기기가 같은 회차권을 동시에 차감하면
 * 둘 다 "5→6" 을 보내 서버는 6(정답 7)이 되고 한 회가 공짜가 된다(16차 점검 #H2, 2026-11-24). 시술 기록(treatment_logs)은 기기마다
 * 따로 생기므로 그 합이 정본이다 — 표시와 자가 치유는 기록에서 다시 센다.
 * 근거 기록이 하나도 없는 회차권(옛 데이터·수기 조정)은 저장값을 그대로 둔다 — customerStats 의 "근거 없으면 내리지 않는다" 와 같은 가드.
 */
export type SessionLogLike = { customerProgramId?: string; sessionsUsed?: number };
export type ProgramLike = { id: string; usedSessions: number; totalSessions: number | null };
export type UsedSessionsIndex = Map<string, number>;

/** 회차권 id → 시술 기록이 차감한 회차 합 */
export function buildUsedSessionsIndex(logs: SessionLogLike[]): UsedSessionsIndex {
  const idx: UsedSessionsIndex = new Map();
  for (const t of logs) {
    if (!t.customerProgramId) continue;
    const n = Math.max(0, Number(t.sessionsUsed) || 0);
    idx.set(t.customerProgramId, (idx.get(t.customerProgramId) || 0) + n);
  }
  return idx;
}

/** 기록이 있으면 기록 합, 없으면 저장값 */
export function derivedUsedSessions(cp: ProgramLike, idx: UsedSessionsIndex): number {
  const fromLogs = idx.get(cp.id);
  return fromLogs === undefined ? Math.max(0, cp.usedSessions || 0) : fromLogs;
}

/** 잔여 회차 — 기간제(총 회차 없음)는 null, 0 아래로 내려가지 않는다 */
export function remainingSessions(cp: Pick<ProgramLike, 'totalSessions'>, used: number): number | null {
  return cp.totalSessions == null ? null : Math.max(0, cp.totalSessions - used);
}

/** 저장값이 기록 합과 다르면 고쳐 쓸 값, 같거나 근거가 없으면 null */
export function sessionsDrift(cp: ProgramLike, idx: UsedSessionsIndex): number | null {
  const fromLogs = idx.get(cp.id);
  if (fromLogs === undefined) return null;
  return fromLogs === (cp.usedSessions || 0) ? null : fromLogs;
}
