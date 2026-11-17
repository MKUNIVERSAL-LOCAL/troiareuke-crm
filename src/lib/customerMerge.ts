// ═══════════════════════════════════════════════════════════════
// customerMerge — 중복 고객 병합 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 엑셀 중복 업로드·전화번호 변경 등으로 한 사람이 두 레코드로 쪼개졌을 때, 모든 기록(예약·시술·프로그램·결제·상담)을
// 남길 고객(target)으로 옮기고 흡수되는 고객(source)을 삭제한다. 사진은 기록 id에 묶여 있어 그대로 따라간다.
// 결제 이동은 PaymentStore.update가 누적 결제액을 양쪽에 반영하고, 방문 횟수·마지막 방문일은 여기서 합친다.
// 한계: 제품 판매(ProductSale.customerId)는 코어에 수정 API가 없어 옮기지 못한다(로드맵 P4 코어 메모 — ProductSaleStore.update).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, ReservationStore, TreatmentLogStore, CustomerProgramStore, PaymentStore } from './store';
import { ConsultationStore } from './consultationStore';
import type { Customer } from '../types';

export interface MergePreview {
  reservations: number;
  treatments: number;
  programs: number;
  payments: number;
  consultations: number;
}

export function previewMerge(sourceId: string): MergePreview {
  return {
    reservations: ReservationStore.getAll().filter(r => r.customerId === sourceId).length,
    treatments: TreatmentLogStore.getByCustomer(sourceId).length,
    programs: CustomerProgramStore.getByCustomer(sourceId).length,
    payments: PaymentStore.getAll().filter(p => p.customerId === sourceId).length,
    consultations: ConsultationStore.getByCustomer(sourceId).length,
  };
}

function later(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** source의 기록을 target으로 옮기고 source를 삭제한다. 되돌릴 수 없다. @returns 이동한 기록 수 */
export function mergeCustomers(targetId: string, sourceId: string): MergePreview {
  if (targetId === sourceId) throw new Error('같은 고객입니다.');
  const target = CustomerStore.getById(targetId);
  const source = CustomerStore.getById(sourceId);
  if (!target || !source) throw new Error('고객을 찾을 수 없습니다.');
  if (target.id.startsWith('sample_') || source.id.startsWith('sample_')) throw new Error('샘플 고객은 병합할 수 없습니다.');

  const preview = previewMerge(sourceId);
  const name = target.name;
  ReservationStore.getAll().filter(r => r.customerId === sourceId)
    .forEach(r => ReservationStore.update(r.id, { customerId: targetId, customerName: name, customerPhone: target.phone }));
  TreatmentLogStore.getByCustomer(sourceId)
    .forEach(t => TreatmentLogStore.update(t.id, { customerId: targetId, customerName: name }));
  CustomerProgramStore.getByCustomer(sourceId)
    .forEach(cp => CustomerProgramStore.update(cp.id, { customerId: targetId, customerName: name }));
  PaymentStore.getAll().filter(p => p.customerId === sourceId)
    .forEach(p => PaymentStore.update(p.id, { customerId: targetId, customerName: name })); // 누적 결제액은 update가 양쪽 반영
  ConsultationStore.getByCustomer(sourceId)
    .forEach(c => ConsultationStore.update(c.id, { customerId: targetId, customerName: name }));

  // 고객 필드 합치기 — 비어 있는 항목만 source로 채우고, 방문·메모·태그는 합산
  const t = CustomerStore.getById(targetId) ?? target; // 결제 이동으로 totalSpent가 바뀌었을 수 있어 다시 읽는다
  const updates: Partial<Customer> = {
    totalVisits: (t.totalVisits || 0) + (source.totalVisits || 0),
    lastVisitDate: later(t.lastVisitDate, source.lastVisitDate),
    tags: [...new Set([...(t.tags || []), ...(source.tags || [])])],
  };
  if (!t.email && source.email) updates.email = source.email;
  if (!t.address && source.address) updates.address = source.address;
  if (!t.birthDate && source.birthDate) updates.birthDate = source.birthDate;
  if (!t.skinType && source.skinType) updates.skinType = source.skinType;
  if (!t.allergies && source.allergies) updates.allergies = source.allergies;
  if (!t.referralSource && source.referralSource) updates.referralSource = source.referralSource;
  if (source.memo) updates.memo = t.memo ? `${t.memo}\n[병합: ${source.name} ${source.phone}] ${source.memo}` : `[병합: ${source.name} ${source.phone}] ${source.memo}`;
  if (!t.privacyConsent && source.privacyConsent) { updates.privacyConsent = true; updates.privacyConsentAt = source.privacyConsentAt; }
  CustomerStore.update(targetId, updates);
  CustomerStore.delete(sourceId);
  return preview;
}
