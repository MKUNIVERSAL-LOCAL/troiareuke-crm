// ═══════════════════════════════════════════════════════════════
// customerTimeline — 고객 활동 타임라인 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 예약·시술·피부 상담·프로그램 등록·결제를 한 줄기 시간순으로 모은다. 고객 상세에서 "이 고객에게 무슨 일이 있었나"를
// 섹션을 오가지 않고 한눈에 보기 위한 읽기 전용 뷰. 저장소는 건드리지 않는다.
// ═══════════════════════════════════════════════════════════════

import { ReservationStore, TreatmentLogStore, CustomerProgramStore, PaymentStore } from './store';
import { ConsultationStore } from './consultationStore';
import type { Reservation } from '../types';

export type TimelineKind = 'reservation' | 'treatment' | 'consult' | 'program' | 'payment';

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm — 정렬 보조(없으면 같은 날 뒤쪽) */
  time?: string;
  title: string;
  detail?: string;
  /** 결제·프로그램 금액(환불은 음수) */
  amount?: number;
  /** 눌렀을 때 이동할 경로 */
  href?: string;
  /** 취소·노쇼·환불 등 눈에 띄게 표시할 상태 */
  tone?: 'bad' | 'muted';
}

const RESERVATION_LABEL: Record<Reservation['status'], string> = {
  confirmed: '예약확정', pending: '대기', completed: '완료', cancelled: '취소', noshow: '노쇼',
};

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  reservation: '예약', treatment: '시술', consult: '상담', program: '프로그램', payment: '결제',
};

function dateOf(iso: string): string {
  return (iso || '').slice(0, 10);
}

/** 고객의 모든 활동을 최신순으로. 결제는 referenceId가 같은 분할 결제도 각각 한 줄(금액이 다르므로) */
export function buildCustomerTimeline(customerId: string): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const r of ReservationStore.getAll()) {
    if (r.customerId !== customerId) continue;
    const services = r.services.map(s => s.serviceName).join(', ');
    items.push({
      id: `res:${r.id}`, kind: 'reservation', date: r.date, time: r.startTime,
      title: `${RESERVATION_LABEL[r.status] ?? r.status} · ${r.startTime}${r.staffName ? ` · ${r.staffName}` : ''}`,
      detail: services || undefined,
      href: `/reservations?open=${r.id}`,
      tone: r.status === 'cancelled' || r.status === 'noshow' ? 'bad' : r.status === 'pending' ? 'muted' : undefined,
    });
  }

  for (const t of TreatmentLogStore.getByCustomer(customerId)) {
    const parts = [t.programName, t.staffName].filter(Boolean);
    items.push({
      id: `trt:${t.id}`, kind: 'treatment', date: t.treatmentDate, time: t.treatmentTime,
      title: parts.length ? parts.join(' · ') : '시술',
      detail: t.treatmentDetails || t.skinCondition || undefined,
      href: `/treatments?open=${t.id}`,
    });
  }

  for (const c of ConsultationStore.getByCustomer(customerId)) {
    items.push({
      id: `con:${c.id}`, kind: 'consult', date: c.consultDate,
      title: `피부 상담${c.skinTypeResult ? ` · ${c.skinTypeResult}` : ''}${c.staffName ? ` · ${c.staffName}` : ''}`,
      detail: c.concerns.length ? c.concerns.join(', ') : c.managerNote || undefined,
    });
  }

  for (const cp of CustomerProgramStore.getByCustomer(customerId)) {
    items.push({
      id: `prg:${cp.id}`, kind: 'program', date: cp.purchaseDate,
      title: `${cp.programName} 등록`,
      detail: cp.totalSessions ? `${cp.totalSessions}회${cp.expiryDate ? ` · ~${cp.expiryDate}` : ''}` : cp.expiryDate ? `기간제 · ~${cp.expiryDate}` : '기간제',
      amount: cp.pricePaid || undefined,
    });
  }

  for (const p of PaymentStore.getAll()) {
    if (p.customerId !== customerId) continue;
    const refunded = p.status === 'refunded';
    items.push({
      id: `pay:${p.id}`, kind: 'payment', date: dateOf(p.paymentDate),
      title: `${refunded ? '환불' : p.status === 'pending' ? '결제 대기' : '결제'} · ${p.typeLabel}`,
      detail: p.memo || undefined,
      amount: refunded ? -p.amount : p.amount,
      tone: refunded ? 'bad' : p.status === 'pending' ? 'muted' : undefined,
    });
  }

  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}
