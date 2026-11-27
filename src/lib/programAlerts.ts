// ═══════════════════════════════════════════════════════════════
// programAlerts — 회차권 소진·만료 임박 알림 (비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 에스테틱 매출의 핵심은 회차권 재구매다. 잔여 1회 이하이거나 만료가 14일 안인 활성 프로그램을
// 대시보드에 모아 보여주고, 재구매 안내 문구 초안을 만든다(발송은 복사/공유 — 발송사 연동 후 자동).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, CustomerProgramStore, SettingsStore, ProgramStore, TreatmentLogStore } from './store';
import type { Customer, CustomerProgram } from '../types';
import { buildUsedSessionsIndex, derivedUsedSessions } from './programSessionsRule';

const EXPIRY_WINDOW_DAYS = 14;

export type ProgramAlertReason = 'exhausted' | 'low' | 'expired' | 'expiring';

export interface ProgramAlert {
  program: CustomerProgram;
  /** 지금 파는 상품명 — 회차권의 programName 은 구매 당시 사본. 카드·문자 초안이 같은 값을 쓴다 (11차 #M7, 리뷰 #M5) */
  programLabel: string;
  customer: Customer;
  remaining: number | null;   // 회차제가 아니면 null
  daysToExpiry: number | null; // 만료일 없으면 null (음수 = 지남)
  reason: ProgramAlertReason;
}

export const REASON_LABEL: Record<ProgramAlertReason, string> = {
  exhausted: '잔여 0회',
  low: '잔여 1회',
  expired: '기간 만료',
  expiring: '만료 임박',
};

/** 지역 날짜(YYYY-MM-DD) — 앱 전체 규칙(format.todayISO·reminderEngine). toISOString은 KST 00~09시에 하루 어긋난다 */
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 활성 프로그램 중 소진·만료 임박 — 긴급한 순(잔여 0 → 만료 지남 → 잔여 1 → 만료 임박) */
export function getProgramAlerts(today = new Date()): ProgramAlert[] {
  const todayISO = toISO(today);
  const customers = new Map(CustomerStore.getAll().map(c => [c.id, c]));
  const out: ProgramAlert[] = [];
  const all = CustomerProgramStore.getAll();
  const usedIdx = buildUsedSessionsIndex(TreatmentLogStore.getAll()); // 사용 회차는 기록 기준 (16차 #H2)
  // 고객별 활성 프로그램 — 재구매 확인에서 전체 테이블을 다시 훑지 않게 (성능 감사 2026-11-18)
  const activeByCustomer = new Map<string, CustomerProgram[]>();
  for (const p of all) if (!p.isCompleted) { const l = activeByCustomer.get(p.customerId); if (l) l.push(p); else activeByCustomer.set(p.customerId, [p]); }
  for (const cp of all) {
    // 마지막 회차를 쓰면 코어 useSession이 isCompleted=true로 닫는다 — 재구매 제안의 핵심 순간이므로 "소진으로 완료"는 알림 대상에 넣는다
    const used = derivedUsedSessions(cp, usedIdx);
    const exhausted = cp.totalSessions != null && used >= cp.totalSessions;
    if ((cp.isCompleted && !exhausted) || cp.id.startsWith('sample_')) continue;
    const customer = customers.get(cp.customerId);
    if (!customer || customer.id.startsWith('sample_') || customer.isActive === false) continue;
    // 같은 프로그램을 이미 재구매(활성)했으면 소진 알림 불필요
    if (exhausted && (activeByCustomer.get(cp.customerId) || []).some(p => p.id !== cp.id && (p.programId ? p.programId === cp.programId : p.programName === cp.programName))) continue;
    const remaining = cp.totalSessions == null ? null : Math.max(0, cp.totalSessions - used);
    const daysToExpiry = cp.expiryDate
      ? Math.round((new Date(cp.expiryDate + 'T00:00:00').getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86_400_000)
      : null;
    let reason: ProgramAlertReason | null = null;
    if (remaining === 0) reason = 'exhausted';
    else if (daysToExpiry !== null && daysToExpiry < 0) reason = 'expired';
    else if (remaining === 1) reason = 'low';
    else if (daysToExpiry !== null && daysToExpiry <= EXPIRY_WINDOW_DAYS) reason = 'expiring';
    if (reason) out.push({ program: cp, programLabel: (cp.programId && ProgramStore.getById(cp.programId)?.name) || cp.programName, customer, remaining, daysToExpiry, reason });
  }
  const order: Record<ProgramAlertReason, number> = { exhausted: 0, expired: 1, low: 2, expiring: 3 };
  return out.sort((a, b) => order[a.reason] - order[b.reason] || (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999));
}

/** 재구매 안내 문구 초안 — 복사/공유용 (발송사 연동 후 자동 발송) */
export function buildProgramMessage(alert: ProgramAlert): string {
  const shop = SettingsStore.get().name || '저희 매장';
  const { customer, programLabel: name, remaining, daysToExpiry, reason } = alert;
  const lines = [`${customer.name}님, 안녕하세요. ${shop}입니다.`];
  if (reason === 'exhausted') lines.push(`이용 중이신 "${name}" 회차를 모두 사용하셨어요.`);
  else if (reason === 'low') lines.push(`이용 중이신 "${name}" 잔여 회차가 ${remaining}회 남았어요.`);
  else if (reason === 'expired') lines.push(`"${name}" 이용 기간이 지났어요.`);
  else lines.push(`"${name}" 이용 기간이 ${daysToExpiry === 0 ? '오늘' : `${daysToExpiry}일 뒤`} 끝나요.`);
  lines.push('재등록하시면 관리 흐름이 끊기지 않도록 일정을 바로 잡아드릴게요. 편한 시간을 알려주세요 :)');
  return lines.join('\n');
}
