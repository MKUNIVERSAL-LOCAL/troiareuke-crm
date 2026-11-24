// pilotMetricsRule — 파일럿 지표(초기 설정 완료율·활용률·활동 상태) (순수, 166, PHASE 6, docs/PILOT-CHECKLIST.md 6절)
// 입력은 어드민 /api/admin/overview 의 지점별 컬렉션 건수(서버 집계) — 여기서는 비율·등급만 정한다. 숫자를 만들지 않는다(자료 없으면 none).
export interface BranchCounts {
  recordCounts: Record<string, number>; // 컬렉션명 → 건수 (customers·reservations·payments·staff·services·programs·treatment_logs·customer_programs·shop_settings·…)
  photoCount: number;
  messageCount: number;
  lastActivity: string | null;          // ISO
}

export interface SetupCheck { key: string; label: string; done: boolean }
const n = (c: BranchCounts, k: string) => c.recordCounts[k] || 0;

/** 초기 설정 6단계 — 파일럿 첫 주 목표(PILOT-CHECKLIST 2절 흐름과 같은 순서) */
const SETUP_STEPS: { key: string; label: string; test: (c: BranchCounts) => boolean }[] = [
  { key: 'settings', label: '매장 설정 저장', test: c => n(c, 'shop_settings') >= 1 },
  { key: 'staff', label: '직원 1명 이상', test: c => n(c, 'staff') >= 1 },
  { key: 'menu', label: '시술 메뉴·프로그램 등록', test: c => n(c, 'services') + n(c, 'programs') >= 1 },
  { key: 'customers', label: '고객 5명 이상', test: c => n(c, 'customers') >= 5 },
  { key: 'reservation', label: '첫 예약', test: c => n(c, 'reservations') >= 1 },
  { key: 'payment', label: '첫 결제', test: c => n(c, 'payments') >= 1 },
];
export function setupChecks(c: BranchCounts): SetupCheck[] {
  return SETUP_STEPS.map(s => ({ key: s.key, label: s.label, done: s.test(c) }));
}
/** 초기 설정 완료율(%) */
export function setupCompletionPct(c: BranchCounts): number {
  const list = setupChecks(c);
  return Math.round((list.filter(x => x.done).length / list.length) * 100);
}

/** 활용 영역 7개 — 쓰고 있는 영역 수 / 7 = 활용률 */
const AREAS: { key: string; label: string; test: (c: BranchCounts) => boolean }[] = [
  { key: 'customers', label: '고객', test: c => n(c, 'customers') >= 1 },
  { key: 'reservations', label: '예약', test: c => n(c, 'reservations') >= 1 },
  { key: 'payments', label: '결제', test: c => n(c, 'payments') >= 1 },
  { key: 'treatments', label: '시술 기록', test: c => n(c, 'treatment_logs') >= 1 },
  { key: 'programs', label: '회차권', test: c => n(c, 'customer_programs') >= 1 },
  { key: 'photos', label: '사진', test: c => c.photoCount >= 1 },
  { key: 'messages', label: '문자/카카오', test: c => c.messageCount >= 1 },
];
export function areasUsed(c: BranchCounts): { key: string; label: string; used: boolean }[] {
  return AREAS.map(a => ({ key: a.key, label: a.label, used: a.test(c) }));
}
export function utilizationPct(c: BranchCounts): number {
  const list = areasUsed(c);
  return Math.round((list.filter(x => x.used).length / list.length) * 100);
}

export type ActivityLevel = 'active' | 'idle' | 'dormant' | 'none';
export const ACTIVITY_LABEL: Record<ActivityLevel, string> = { active: '활동 중(7일)', idle: '뜸함(30일)', dormant: '휴면(30일+)', none: '기록 없음' };
/** 마지막 활동 기준 — 7일 안 active, 30일 안 idle, 그 밖 dormant, 없으면 none */
export function activityLevel(lastActivity: string | null, now: Date): ActivityLevel {
  if (!lastActivity) return 'none';
  const t = new Date(lastActivity).getTime();
  if (Number.isNaN(t)) return 'none';
  const days = (now.getTime() - t) / 86_400_000;
  if (days <= 7) return 'active';
  if (days <= 30) return 'idle';
  return 'dormant';
}

export interface PilotRow { branchId: string; name: string; setupPct: number; utilizationPct: number; activity: ActivityLevel; lastActivity: string | null; missing: string[] }
export interface PilotSummary { branches: number; avgSetupPct: number | null; avgUtilizationPct: number | null; byActivity: Record<ActivityLevel, number>; rows: PilotRow[] }

export function pilotSummary(branches: { branchId: string; name: string; counts: BranchCounts }[], now: Date): PilotSummary {
  const rows: PilotRow[] = branches.map(b => ({
    branchId: b.branchId, name: b.name,
    setupPct: setupCompletionPct(b.counts), utilizationPct: utilizationPct(b.counts),
    activity: activityLevel(b.counts.lastActivity, now), lastActivity: b.counts.lastActivity,
    missing: setupChecks(b.counts).filter(x => !x.done).map(x => x.label),
  })).sort((a, b) => a.setupPct - b.setupPct || a.name.localeCompare(b.name, 'ko')); // 설정이 덜 된 지점이 위로(본사가 먼저 도울 곳)
  const avg = (f: (r: PilotRow) => number) => (rows.length ? Math.round(rows.reduce((s, r) => s + f(r), 0) / rows.length) : null);
  const byActivity: Record<ActivityLevel, number> = { active: 0, idle: 0, dormant: 0, none: 0 };
  for (const r of rows) byActivity[r.activity] += 1;
  return { branches: rows.length, avgSetupPct: avg(r => r.setupPct), avgUtilizationPct: avg(r => r.utilizationPct), byActivity, rows };
}
