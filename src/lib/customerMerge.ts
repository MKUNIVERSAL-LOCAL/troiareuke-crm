// ═══════════════════════════════════════════════════════════════
// customerMerge — 중복 고객 병합 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 엑셀 중복 업로드·전화번호 변경 등으로 한 사람이 두 레코드로 쪼개졌을 때, 모든 기록(예약·시술·프로그램·결제·상담)을
// 남길 고객(target)으로 옮기고 흡수되는 고객(source)을 삭제한다. 사진은 기록 id(treatment:/consult:)에 묶여 있어 그대로 따라간다.
// 결제 이동은 PaymentStore.update가 누적 결제액을 양쪽에 반영하고(완료 결제만), 방문 횟수·마지막 방문일은 여기서 합친다.
// 한계: 제품 판매(ProductSale.customerId)는 코어에 수정 API가 없어 옮기지 못한다(로드맵 P4 코어 메모 — ProductSaleStore.update).
// 서버 결제 요청(payment_requests)의 customer_id도 옮기지 못해, 미결 요청이 있으면 모달이 병합을 막는다.
// 로컬 쓰기는 동기이므로 중간에 실패(저장 용량 등)하면 일부만 옮겨진 채 source가 남는다 — 같은 병합을 다시 실행하면 이어서 완료된다.
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, ReservationStore, TreatmentLogStore, CustomerProgramStore, PaymentStore, ProductSaleStore } from './store';
import { ConsultationStore } from './consultationStore';
import { isAnonymized } from './retentionPolicy';
import type { Customer, CustomerGrade } from '../types';

export interface MergePreview {
  reservations: number;
  treatments: number;
  programs: number;
  payments: number;
  consultations: number;
  /** 옮기지 못하는 제품 판매 건수 — 안내용 */
  productSales: number;
  /** 흡수 고객의 완료 결제 합계 — 누적 결제액은 이 금액만 옮겨진다 */
  completedAmount: number;
}

export function previewMerge(sourceId: string): MergePreview {
  const payments = PaymentStore.getAll().filter(p => p.customerId === sourceId);
  return {
    reservations: ReservationStore.getAll().filter(r => r.customerId === sourceId).length,
    treatments: TreatmentLogStore.getByCustomer(sourceId).length,
    programs: CustomerProgramStore.getByCustomer(sourceId).length,
    payments: payments.length,
    consultations: ConsultationStore.getByCustomer(sourceId).length,
    productSales: ProductSaleStore.getAll().filter(s => s.customerId === sourceId).length,
    completedAmount: payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0),
  };
}

/** 병합 가능 여부 — 모달 버튼 노출과 실행 양쪽에서 같은 규칙을 쓴다 */
export function mergeBlockReason(c: Customer): string | null {
  if (c.id.startsWith('sample_')) return '샘플 고객은 병합할 수 없습니다.';
  if (isAnonymized(c)) return '익명화된 고객은 병합할 수 없습니다.';
  return null;
}

/** 같은 전화번호(숫자 8자리 이상 기준)를 쓰는 다른 고객 — 상세 화면의 "중복 의심" 안내용. 샘플·익명화 고객은 제외 */
export function findSamePhoneCustomers(customer: Customer): Customer[] {
  const digits = (customer.phone || '').replace(/\D/g, '');
  if (digits.length < 8 || mergeBlockReason(customer)) return [];
  return CustomerStore.getAll().filter(c => c.id !== customer.id && !mergeBlockReason(c) && c.phone.replace(/\D/g, '') === digits);
}

function later(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

const GRADE_RANK: Record<CustomerGrade, number> = { 신규: 0, 일반: 1, 골드: 2, VIP: 3 };

/** source의 기록을 target으로 옮기고 source를 삭제한다. 되돌릴 수 없다. @returns 이동한 기록 수 */
export function mergeCustomers(targetId: string, sourceId: string): MergePreview {
  if (targetId === sourceId) throw new Error('같은 고객입니다.');
  const target = CustomerStore.getById(targetId);
  const source = CustomerStore.getById(sourceId);
  if (!target || !source) throw new Error('고객을 찾을 수 없습니다.');
  const blocked = mergeBlockReason(target) ?? mergeBlockReason(source);
  if (blocked) throw new Error(blocked);

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

  // 고객 필드 합치기 — 비어 있는 항목만 source로 채우고, 방문·메모·태그는 합산, 등급은 높은 쪽·등록일은 이른 쪽
  const t = CustomerStore.getById(targetId) ?? target; // 결제 이동으로 totalSpent가 바뀌었을 수 있어 다시 읽는다
  const updates: Partial<Customer> = {
    totalVisits: (t.totalVisits || 0) + (source.totalVisits || 0),
    lastVisitDate: later(t.lastVisitDate, source.lastVisitDate),
    tags: [...new Set([...(t.tags || []), ...(source.tags || [])])],
    isActive: t.isActive !== false || source.isActive !== false,
  };
  if (source.registeredAt && (!t.registeredAt || source.registeredAt < t.registeredAt)) updates.registeredAt = source.registeredAt;
  if ((GRADE_RANK[source.grade] ?? 0) > (GRADE_RANK[t.grade] ?? 0)) updates.grade = source.grade;
  if ((!t.gender || t.gender === '미입력') && source.gender && source.gender !== '미입력') updates.gender = source.gender;
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
