import { formatDate } from './format';
// ═══════════════════════════════════════════════════════════════
// customerTimeline — 고객 활동 타임라인 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 예약·시술·피부 상담·프로그램 등록·결제를 한 줄기 시간순으로 모은다. 고객 상세에서 "이 고객에게 무슨 일이 있었나"를
// 섹션을 오가지 않고 한눈에 보기 위한 읽기 전용 뷰. 저장소는 건드리지 않는다.
// ═══════════════════════════════════════════════════════════════

import { ReservationStore, TreatmentLogStore, CustomerProgramStore, PaymentStore, ProductSaleStore, CustomerStore, MessageHistoryStore } from './store';
import { ConsultationStore } from './consultationStore';
import { listCampaigns, sendsForCustomer } from './campaignStore';
import { consentFromTags } from './consentRule';
import { toISO } from './revisitRule';
import { formatPrice } from './format';
import type { Reservation } from '../types';

export type TimelineKind = 'reservation' | 'treatment' | 'consult' | 'program' | 'payment' | 'product' | 'programNote' | 'campaign' | 'consent' | 'message';

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm — 정렬 보조(없으면 같은 날 뒤쪽) */
  time?: string;
  title: string;
  detail?: string;
  /** 결제 금액. 프로그램 등록은 자동 생성되는 결제 행이 금액을 들고 있어 여기 금액을 두지 않는다(이중 표시 방지) */
  amount?: number;
  /** 눌렀을 때 이동할 경로 */
  href?: string;
  /** 취소·노쇼·환불 등 눈에 띄게 표시할 상태 */
  tone?: 'bad' | 'muted';
  /** 사진이 붙는 기록의 photoStore 키 — 장수는 화면이 보이는 항목에서만 센다(전수 IDB 읽기 방지) (189·191) */
  photoKey?: string;
}

const RESERVATION_LABEL: Record<Reservation['status'], string> = {
  confirmed: '예약확정', pending: '대기', completed: '완료', cancelled: '취소', noshow: '노쇼',
};

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  reservation: '예약', treatment: '시술', consult: '상담', program: '프로그램', payment: '결제', product: '제품 판매', programNote: '회차권 변경', campaign: '캠페인 발송', consent: '수신 동의', message: '메시지 발송',
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
      id: `res:${r.id}`, kind: 'reservation', date: dateOf(r.date), time: r.startTime,
      title: `${RESERVATION_LABEL[r.status] ?? r.status} · ${r.startTime}${r.staffName ? ` · ${r.staffName}` : ''}`,
      detail: services || undefined,
      href: `/reservations?open=${r.id}`,
      tone: r.status === 'cancelled' || r.status === 'noshow' ? 'bad' : r.status === 'pending' ? 'muted' : undefined,
    });
  }

  for (const t of TreatmentLogStore.getByCustomer(customerId)) {
    const parts = [t.programName, t.staffName].filter(Boolean);
    items.push({
      id: `trt:${t.id}`, kind: 'treatment', date: dateOf(t.treatmentDate), time: t.treatmentTime,
      title: parts.length ? parts.join(' · ') : '시술 기록 (내역 미입력)',
      detail: t.treatmentDetails || t.skinCondition || undefined,
      photoKey: `treatment:${t.id}`,
      href: `/treatments?open=${t.id}`,
    });
  }

  for (const c of ConsultationStore.getByCustomer(customerId)) {
    items.push({
      id: `con:${c.id}`, kind: 'consult', date: dateOf(c.consultDate),
      title: `피부 상담${c.skinTypeResult ? ` · ${c.skinTypeResult}` : ''}${c.staffName ? ` · ${c.staffName}` : ''}`,
      detail: c.concerns.length ? c.concerns.join(', ') : c.managerNote || undefined,
      photoKey: `consult:${c.id}`,
    });
  }

  for (const cp of CustomerProgramStore.getByCustomer(customerId)) {
    items.push({
      id: `prg:${cp.id}`, kind: 'program', date: dateOf(cp.purchaseDate),
      title: `${cp.programName} 등록`,
      detail: [
        cp.totalSessions ? `${cp.totalSessions}회` : '기간제',
        cp.expiryDate ? `~${formatDate(cp.expiryDate)}` : '',
        cp.pricePaid ? formatPrice(cp.pricePaid) : '',
      ].filter(Boolean).join(' · '),
    });
  }

  // 제품 판매 — 금액은 연결된 결제 행이 들고 있으므로 여기엔 수량·단가만(이중 표시 방지) (137, GAP C-4)
  for (const ps of ProductSaleStore.getAll()) {
    if (ps.customerId !== customerId) continue;
    items.push({
      id: `psl:${ps.id}`, kind: 'product', date: dateOf(ps.saleDate),
      title: `${ps.productName} × ${ps.quantity}${ps.staffName ? ` · ${ps.staffName}` : ''}`,
      detail: [ps.unitPrice ? `단가 ${formatPrice(ps.unitPrice)}` : '', ps.notes || ''].filter(Boolean).join(' · ') || undefined,
      href: '/products?tab=sales',
    });
  }
  // 회차권 변경 기록 — 관리 창이 notes 에 "[YYYY-MM-DD] 내용" 으로 남긴 줄(만료일·총 회차 보정, 완료/되돌림) (137)
  for (const cp of CustomerProgramStore.getByCustomer(customerId)) {
    (cp.notes || '').split('\n').forEach((line, idx) => {
      const m = /^\[(\d{4}-\d{2}-\d{2})\]\s*(.+)$/.exec(line.trim());
      if (!m) return;
      items.push({ id: `pnote:${cp.id}:${idx}`, kind: 'programNote', date: m[1], title: `${cp.programName} 변경`, detail: m[2], tone: 'muted' }); // 줄 번호로 고유 (139 #L5)
    });
  }

  for (const p of PaymentStore.getAll()) {
    if (p.customerId !== customerId) continue;
    const refunded = p.status === 'refunded';
    items.push({
      id: `pay:${p.id}`, kind: 'payment', date: dateOf(p.paymentDate),
      title: `${refunded ? '환불' : p.status === 'pending' ? '결제 대기' : '결제'} · ${p.typeLabel}`,
      detail: p.memo || undefined,
      amount: p.amount,
      tone: refunded ? 'bad' : p.status === 'pending' ? 'muted' : undefined,
    });
  }

  // 캠페인 발송 — 승인 뒤 실제로 나간(성공) 건만, 이 PC 의 기록(다른 PC 의 발송은 서버 보관 B-4 뒤). 삭제된 캠페인은 이름 대신 표기 (179, GAP C-4)
  const campaignNames = new Map(listCampaigns().map(c => [c.id, c.name]));
  for (const sd of sendsForCustomer(customerId)) {
    const at = new Date(sd.at);
    if (Number.isNaN(at.getTime())) continue;
    items.push({
      id: `cs:${sd.key}:${sd.at}`, kind: 'campaign', date: toISO(at), time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
      title: `캠페인 발송 · ${campaignNames.get(sd.campaignId) ?? '삭제된 캠페인'}`,
      detail: '이 PC 에서 승인·발송 성공',
      href: '/messaging',
    });
  }
  // 문자·카카오 수동 발송(발송 창·상담 결과 안내) — 이력에 수신 고객 id 가 남은 건(204 부터)만, 이 PC 기록. 미연동 판정은 발송 이력 화면과 같은 식. 캠페인 실행은 위 campaign 줄이 맡는다 (GAP C-4)
  for (const h of MessageHistoryStore.getAll()) {
    if (!h.customerIds?.includes(customerId)) continue;
    const at = new Date(h.sentAt);
    if (Number.isNaN(at.getTime())) continue;
    const gatewayPending = h.status === 'failed' && h.successCount === 0 && !h.cost;
    const detail = h.status === 'sent'
      ? (h.recipients > 1 ? `${h.recipients}명에게 발송${h.failCount > 0 ? ` · ${h.failCount}명 실패` : ''}` : '발송 성공')
      : gatewayPending ? '발송사 미연동 — 실제 발송 안 됨' : '발송 실패';
    items.push({
      id: `msg:${h.id}`, kind: 'message', date: toISO(at), time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
      title: `${h.type.startsWith('kakao') ? '카카오' : '문자'} 발송 · ${h.templateName || h.title || '직접 작성'}`,
      detail, tone: h.status === 'sent' ? undefined : gatewayPending ? 'muted' : 'bad', href: `/messaging?history=${customerId}`, // 발송 이력 탭을 이 고객 발송만으로 (205)
    });
  }
  // 광고 수신 동의 — 동의일 태그(광고동의:YYYY-MM-DD)가 있는 동안 한 줄. 거부로 바꾸면 동의 태그가 지워져 줄도 사라진다(태그가 정본) (179)
  const consent = consentFromTags(CustomerStore.getById(customerId)?.tags);
  if (consent.consentAt) {
    const refused = [consent.sms ? '' : '문자 거부', consent.kakao ? '' : '카카오 거부'].filter(Boolean).join(' · ');
    items.push({ id: `consent:${customerId}`, kind: 'consent', date: consent.consentAt, title: '광고 수신 동의', detail: refused || undefined });
  }

  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}
