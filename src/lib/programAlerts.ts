// ═══════════════════════════════════════════════════════════════
// programAlerts — 회차권 소진·만료 임박 알림 (비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 에스테틱 매출의 핵심은 회차권 재구매다. 잔여 1회 이하이거나 만료가 14일 안인 활성 프로그램을
// 대시보드에 모아 보여주고, 재구매 안내 문구 초안을 만든다(발송은 복사/공유 — 발송사 연동 후 자동).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, CustomerProgramStore, SettingsStore } from './store';
import type { Customer, CustomerProgram } from '../types';

export const EXPIRY_WINDOW_DAYS = 14;

export type ProgramAlertReason = 'exhausted' | 'low' | 'expired' | 'expiring';

export interface ProgramAlert {
  program: CustomerProgram;
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

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 활성 프로그램 중 소진·만료 임박 — 긴급한 순(잔여 0 → 만료 지남 → 잔여 1 → 만료 임박) */
export function getProgramAlerts(today = new Date()): ProgramAlert[] {
  const todayISO = toISO(today);
  const customers = new Map(CustomerStore.getAll().map(c => [c.id, c]));
  const out: ProgramAlert[] = [];
  for (const cp of CustomerProgramStore.getAll()) {
    if (cp.isCompleted || cp.id.startsWith('sample_')) continue;
    const customer = customers.get(cp.customerId);
    if (!customer || customer.id.startsWith('sample_') || customer.isActive === false) continue;
    const remaining = cp.totalSessions == null ? null : Math.max(0, cp.totalSessions - cp.usedSessions);
    const daysToExpiry = cp.expiryDate
      ? Math.round((new Date(cp.expiryDate + 'T00:00:00').getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86_400_000)
      : null;
    let reason: ProgramAlertReason | null = null;
    if (remaining === 0) reason = 'exhausted';
    else if (daysToExpiry !== null && daysToExpiry < 0) reason = 'expired';
    else if (remaining === 1) reason = 'low';
    else if (daysToExpiry !== null && daysToExpiry <= EXPIRY_WINDOW_DAYS) reason = 'expiring';
    if (reason) out.push({ program: cp, customer, remaining, daysToExpiry, reason });
  }
  const order: Record<ProgramAlertReason, number> = { exhausted: 0, expired: 1, low: 2, expiring: 3 };
  return out.sort((a, b) => order[a.reason] - order[b.reason] || (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999));
}

/** 재구매 안내 문구 초안 — 복사/공유용 (발송사 연동 후 자동 발송) */
export function buildProgramMessage(alert: ProgramAlert): string {
  const shop = SettingsStore.get().name || '저희 샵';
  const { customer, program, remaining, daysToExpiry, reason } = alert;
  const lines = [`${customer.name}님, 안녕하세요. ${shop}입니다.`];
  if (reason === 'exhausted') lines.push(`이용 중이신 "${program.programName}" 회차를 모두 사용하셨어요.`);
  else if (reason === 'low') lines.push(`이용 중이신 "${program.programName}" 잔여 회차가 ${remaining}회 남았어요.`);
  else if (reason === 'expired') lines.push(`"${program.programName}" 이용 기간이 지났어요.`);
  else lines.push(`"${program.programName}" 이용 기간이 ${daysToExpiry === 0 ? '오늘' : `${daysToExpiry}일 뒤`} 끝나요.`);
  lines.push('재등록하시면 관리 흐름이 끊기지 않도록 일정을 바로 잡아드릴게요. 편한 시간을 알려주세요 :)');
  return lines.join('\n');
}
