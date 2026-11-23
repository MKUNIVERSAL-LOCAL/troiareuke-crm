// customerIdentity — 고객 이름·전화의 사본 전파와 삭제 전 정리 (비코어, 11차 점검 2026-11-23)
// 예약·시술 기록·회차권·결제·상담은 고객 이름(예약은 전화번호도)을 복사해 들고 있다. 익명화(retentionPolicy)·병합(customerMerge)은
// 그 사본을 고치는데 "고객 정보 수정"만 빠져 있어 개명하면 다른 화면 검색에서 그 고객이 사라지고, 번호를 바꿔도 예약 카드가 옛 번호로 전화했다.
import { CustomerStore, ReservationStore, TreatmentLogStore, CustomerProgramStore, PaymentStore } from './store';
import { ConsultationStore } from './consultationStore';
import { getPhotos, clearPhotos } from './photoStore';
import { getPreference, setPreference } from './shopPreferences';
import { resyncGcalEvents } from './gcalEventMap';
import { todayISO } from './format';
import type { ProductSale } from '../types';

/** 삭제된 고객의 기록에 남기는 이름 — 실명을 남기지 않되 '탈퇴고객'(익명화)과 구분한다 */
export const DELETED_CUSTOMER_NAME = '삭제된 고객';

/** 고객 이름·전화가 바뀌면 기록의 사본도 같이. update 는 이름만 바꾸므로 회차 차감·누적 결제액에 영향 없음. @returns 바꾼 기록 수 */
export function propagateCustomerIdentity(customerId: string, next: { name: string; phone: string }): number {
  let n = 0;
  for (const r of ReservationStore.getAll()) {
    if (r.customerId !== customerId || (r.customerName === next.name && r.customerPhone === next.phone)) continue;
    ReservationStore.update(r.id, { customerName: next.name, customerPhone: next.phone }); n++;
  }
  for (const t of TreatmentLogStore.getByCustomer(customerId)) if (t.customerName !== next.name) { TreatmentLogStore.update(t.id, { customerName: next.name }); n++; }
  for (const cp of CustomerProgramStore.getByCustomer(customerId)) if (cp.customerName !== next.name) { CustomerProgramStore.update(cp.id, { customerName: next.name }); n++; }
  for (const p of PaymentStore.getAll()) if (p.customerId === customerId && p.customerName !== next.name) { PaymentStore.update(p.id, { customerName: next.name }); n++; }
  for (const c of ConsultationStore.getByCustomer(customerId)) if (c.customerName !== next.name) { ConsultationStore.update(c.id, { customerName: next.name }); n++; }
  // 공유 Google 캘린더의 앞으로의 일정도 새 이름으로 (11차 #M8)
  const today = todayISO();
  resyncGcalEvents(ReservationStore.getAll().filter(r => r.customerId === customerId && r.date >= today && r.status !== 'cancelled'));
  return n;
}

/** 병합으로 사라진 고객 id 를 기록 — 옮길 수 없는 제품 판매 행(코어)을 읽을 때 되짚는다 (11차 #M10) */
export function recordMergedCustomer(sourceId: string, targetId: string): void {
  const map = mergedCustomerIds();
  const next: Record<string, string> = { ...map, [sourceId]: targetId };
  for (const [k, v] of Object.entries(map)) if (v === sourceId) next[k] = targetId; // 이전에 source 로 합쳐진 것도 target 으로
  setPreference('mergedCustomerIds', next);
}

function mergedCustomerIds(): Record<string, string> {
  const v = getPreference('mergedCustomerIds');
  return v && typeof v === 'object' ? v : {};
}

/** 병합 사슬을 따라 현재 살아 있는 고객 id 로 (최대 10단계) */
export function resolveCustomerId(id: string): string {
  const map = mergedCustomerIds();
  let cur = id;
  for (let i = 0; i < 10 && map[cur]; i++) cur = map[cur];
  return cur;
}

/** 고객 삭제 직전 정리 — 시술·상담의 얼굴 사진을 지우고(개별 삭제·익명화와 같은 규칙) 남는 기록의 이름·전화를 '삭제된 고객'으로. 기록 자체는 매출 통계를 위해 남는다 */
export function scrubCustomerBeforeDelete(customerId: string): { photos: number; records: number } {
  let photos = 0;
  for (const t of TreatmentLogStore.getByCustomer(customerId)) { photos += getPhotos(`treatment:${t.id}`).length; clearPhotos(`treatment:${t.id}`); }
  for (const c of ConsultationStore.getByCustomer(customerId)) { photos += getPhotos(`consult:${c.id}`).length; clearPhotos(`consult:${c.id}`); }
  return { photos, records: propagateCustomerIdentity(customerId, { name: DELETED_CUSTOMER_NAME, phone: '' }) };
}

/** 제품 판매 행의 고객 이름 — 판매 행은 수정 API 가 없어(코어) 저장 사본 대신 고객 레코드를 바로 읽는다(개명·익명화 즉시 반영).
 *  고객이 없으면(삭제·병합) '삭제된 고객', 고객 연결이 없는 비회원 판매만 저장 사본 */
export function saleCustomerName(sale: Pick<ProductSale, 'customerId' | 'customerName'>): string {
  if (!sale.customerId) return sale.customerName || '';
  return CustomerStore.getById(resolveCustomerId(sale.customerId))?.name ?? DELETED_CUSTOMER_NAME;
}
