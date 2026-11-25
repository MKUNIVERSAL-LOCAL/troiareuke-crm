// customerIdentity — 고객 이름·전화의 사본 전파와 삭제 전 정리 (비코어, 11차 점검 2026-11-23)
// 예약·시술 기록·회차권·결제·상담은 고객 이름(예약은 전화번호도)을 복사해 들고 있다. 익명화(retentionPolicy)·병합(customerMerge)·고객 정보 수정·삭제가
// 모두 이 전파를 쓴다 — 한 곳만 빠지면 개명한 고객이 다른 화면 검색에서 사라지거나 공유 캘린더에 실명이 남는다 (114~116 리뷰 #H4).
import { CustomerStore, ReservationStore, TreatmentLogStore, CustomerProgramStore, PaymentStore } from './store';
import { ConsultationStore } from './consultationStore';
import { clearHistoryOfCustomer } from './reservationHistory';
import { clearCustomerHistory } from './customerHistory';
import { clearPhotos } from './photoStore';
import { getPreference, setPreference } from './shopPreferences';
import { resyncGcalEvents } from './gcalEventMap';
import { todayISO } from './format';
import type { ProductSale } from '../types';

/** 삭제된 고객의 기록에 남기는 이름 — 실명을 남기지 않되 '탈퇴고객'(익명화)과 구분한다 */
export const DELETED_CUSTOMER_NAME = '삭제된 고객';

/** 이 건수를 넘는 전파는 저장 전에 확인한다 — 코어 update 가 건마다 컬렉션 전체를 다시 쓰고 NAS PATCH 1건씩 쌓아(배치 API 없음) 수백 건이면 화면이 멈추고 동기 큐가 길어진다 (리뷰 #H2) */
export const IDENTITY_PROPAGATION_CONFIRM_AT = 50;

type Identity = { name: string; phone: string };

/** 전파가 실제로 바꿀 기록 수(이미 같은 값인 행은 제외) — 저장 전 확인·버튼 안내용 */
export function countIdentityCopies(customerId: string, next: Identity): number {
  let n = 0;
  for (const r of ReservationStore.getAll()) if (r.customerId === customerId && (r.customerName !== next.name || r.customerPhone !== next.phone)) n++;
  for (const t of TreatmentLogStore.getByCustomer(customerId)) if (t.customerName !== next.name) n++;
  for (const cp of CustomerProgramStore.getByCustomer(customerId)) if (cp.customerName !== next.name) n++;
  for (const p of PaymentStore.getAll()) if (p.customerId === customerId && p.customerName !== next.name) n++;
  for (const c of ConsultationStore.getByCustomer(customerId)) if (c.customerName !== next.name) n++;
  return n;
}

/** 고객 이름·전화가 바뀌면 기록의 사본도 같이. update 는 이름만 바꾸므로 회차 차감·누적 결제액에 영향 없음. 공유 Google 캘린더의 앞 일정도 다시 만든다(best-effort). @returns 바꾼 기록 수 */
export function propagateCustomerIdentity(customerId: string, next: Identity, opts: { resyncCalendar?: boolean } = {}): number {
  let n = 0;
  for (const r of ReservationStore.getAll()) {
    if (r.customerId !== customerId || (r.customerName === next.name && r.customerPhone === next.phone)) continue;
    ReservationStore.update(r.id, { customerName: next.name, customerPhone: next.phone }); n++;
  }
  for (const t of TreatmentLogStore.getByCustomer(customerId)) if (t.customerName !== next.name) { TreatmentLogStore.update(t.id, { customerName: next.name }); n++; }
  for (const cp of CustomerProgramStore.getByCustomer(customerId)) if (cp.customerName !== next.name) { CustomerProgramStore.update(cp.id, { customerName: next.name }); n++; }
  for (const p of PaymentStore.getAll()) if (p.customerId === customerId && p.customerName !== next.name) { PaymentStore.update(p.id, { customerName: next.name }); n++; }
  for (const c of ConsultationStore.getByCustomer(customerId)) if (c.customerName !== next.name) { ConsultationStore.update(c.id, { customerName: next.name }); n++; }
  // 공유 Google 캘린더의 앞으로의 일정도 새 이름으로 (11차 #M8) — 익명화·삭제도 같은 길이라 캘린더에 실명이 남지 않는다.
  // 일괄 처리(보존기간 익명화)는 호출자가 resyncCalendar:false 로 끄고 끝에 upcomingReservationsOf 로 한 번만 돌린다 — 고객 수만큼 경고 토스트·레이트리밋이 나지 않게 (117~119 리뷰 #M1)
  if (opts.resyncCalendar !== false) void resyncGcalEvents(upcomingReservationsOf([customerId]));
  return n;
}

/** 앞으로의 미취소 예약(캘린더 재동기 대상) */
export function upcomingReservationsOf(customerIds: string[]) {
  const ids = new Set(customerIds); const today = todayISO();
  return ReservationStore.getAll().filter(r => ids.has(r.customerId) && r.date >= today && r.status !== 'cancelled');
}

const MERGED_MAP_MAX = 500;

/** 병합으로 사라진 고객 id 를 기록 — 옮길 수 없는 제품 판매 행(코어)을 읽을 때 되짚는다 (11차 #M10). 사슬은 기록 시점에 평탄화하고, 오래된 항목부터 500개까지만 */
export function recordMergedCustomer(sourceId: string, targetId: string): void {
  const map = mergedCustomerIds();
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) next[k] = v === sourceId ? targetId : v; // 이전에 source 로 합쳐진 것도 target 으로
  next[sourceId] = targetId;
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - MERGED_MAP_MAX))) delete next[k];
  setPreference('mergedCustomerIds', next);
}

function mergedCustomerIds(): Record<string, string> {
  const v = getPreference('mergedCustomerIds');
  return v && typeof v === 'object' ? v : {};
}

/** 고객 삭제 직전 정리 — 시술·상담의 얼굴 사진을 지우고(개별 삭제·익명화와 같은 규칙) 남는 기록의 이름·전화를 '삭제된 고객'으로. 기록 자체는 매출 통계를 위해 남는다.
 *  사진 건수는 돌려주지 않는다 — 동기 getPhotos 는 캐시 미적재면 []라 "0장"으로 거짓 안내가 됐다(삭제 자체는 tombstone 으로 정상) (리뷰 #M7). @returns 이름을 바꾼 기록 수 */
export function scrubCustomerBeforeDelete(customerId: string): number {
  for (const t of TreatmentLogStore.getByCustomer(customerId)) clearPhotos(`treatment:${t.id}`);
  for (const c of ConsultationStore.getByCustomer(customerId)) clearPhotos(`consult:${c.id}`);
  clearHistoryOfCustomer(customerId); // 예약 변경 이력에 남은 실명도 지운다 (250 리뷰 H-4)
  clearCustomerHistory(customerId);   // 고객 정보 변경 이력도 지운다 (252)
  return propagateCustomerIdentity(customerId, { name: DELETED_CUSTOMER_NAME, phone: '' });
}

/** 제품 판매 행의 고객 이름을 돌려주는 함수 — 판매 행은 수정 API 가 없어(코어) 저장 사본 대신 고객 레코드를 읽는다(개명·익명화 즉시 반영).
 *  고객이 없으면(삭제·병합) '삭제된 고객', 고객 연결이 없는 비회원 판매만 저장 사본. 고객 캐시가 비어 있으면(로그인 직후 로드 실패 등) 전 행이 '삭제된 고객'으로
 *  엑셀에 박제되므로 그때는 저장 사본으로 (리뷰 #M1). 목록·내보내기는 한 번 만들어 재사용 — 행마다 선형 탐색하지 않게 (리뷰 #M2) */
export function saleCustomerNameResolver(): (sale: Pick<ProductSale, 'customerId' | 'customerName'>) => string {
  const all = CustomerStore.getAll();
  if (all.length === 0) return sale => sale.customerName || '';
  const byId = new Map(all.map(c => [c.id, c.name]));
  const merged = mergedCustomerIds();
  return sale => {
    if (!sale.customerId) return sale.customerName || '';
    return byId.get(merged[sale.customerId] ?? sale.customerId) ?? DELETED_CUSTOMER_NAME;
  };
}
