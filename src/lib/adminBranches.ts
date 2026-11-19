// ═══════════════════════════════════════════════════════════════
// adminBranches — 어드민 콘솔이 계정 목록에서 "지점"을 파생하는 공통 규칙 (비코어, 8차 점검 2026-11-20)
// ───────────────────────────────────────────────────────────────
// 서버 /api/admin/users 는 승인 대기·거부 신청자까지 전부 돌려준다. 대시보드·지점 관리·구독·기능 관리가 각자
// role !== 'superadmin' 만 걸러 지점을 세면 신청만 한 가입자가 "운영 중 지점"·"활성 구독"·기능 칩에 나타난다.
// 지점의 대표 실행 버전 규칙(가장 낮은 버전 = 경고 대상, 접속 시각은 가장 최근)도 두 화면이 달라 같은 지점이 다른 시각으로 보였다.
// ═══════════════════════════════════════════════════════════════

import type { AuthApiUser } from './authApi';
import { compareVersions } from './updateChannel';

/** 승인된 지점 계정만 — 본사(superadmin)·승인 대기·거부 제외. status 가 없는 옛 서버 행은 승인으로 본다 */
export function approvedBranchUsers<T extends Pick<AuthApiUser, 'role' | 'status'>>(users: T[]): T[] {
  return users.filter(u => u.role !== 'superadmin' && (u.status ?? 'approved') === 'approved');
}

/** 지점 묶음 키 — branchId 가 없는 옛 계정은 자기 id 로 한 지점 */
export function branchKey(u: Pick<AuthApiUser, 'id' | 'branchId'>): string {
  return u.branchId || u.id;
}

/** 승인된 계정을 지점별로 묶는다 (삽입 순서 유지) */
export function groupByBranch<T extends Pick<AuthApiUser, 'id' | 'branchId' | 'role' | 'status'>>(users: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const u of approvedBranchUsers(users)) {
    const key = branchKey(u);
    map.set(key, [...(map.get(key) || []), u]);
  }
  return map;
}

export interface BranchVersionInfo {
  version: string;           // 지점 안 계정 중 가장 낮은 실행 버전 (경고 대상)
  mode: string;              // 그 계정의 실행 모드
  lastSeenAt: string | null; // 지점 안 가장 최근 접속 시각
}

/** 지점의 실행 버전 — 버전 기록이 있는 계정이 없으면 null */
export function branchVersionInfo(users: Pick<AuthApiUser, 'lastAppVersion' | 'lastAppMode' | 'lastSeenAt'>[]): BranchVersionInfo | null {
  const seen = users.filter(u => u.lastAppVersion);
  if (seen.length === 0) return null;
  const latestSeen = seen.reduce((acc, u) => ((u.lastSeenAt || '') > (acc.lastSeenAt || '') ? u : acc), seen[0]);
  const lowest = seen.reduce((acc, u) => (compareVersions(u.lastAppVersion, acc.lastAppVersion) < 0 ? u : acc), seen[0]);
  return { version: lowest.lastAppVersion!, mode: lowest.lastAppMode || '', lastSeenAt: latestSeen.lastSeenAt || null };
}
