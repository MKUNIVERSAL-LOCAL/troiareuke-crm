import { CustomerStore, PaymentStore, ReservationStore, TreatmentLogStore, initializeStores } from './store';
import type { Customer } from '../types';

/**
 * 고객 누적값(누적 결제액·방문 횟수·마지막 방문일)의 재계산 (정합성 감사 2026-11-19).
 * 코어는 이 값들을 증분(+1, +금액)으로만 저장해 서버 결제 링크 자동 기록·다기기 last-writer-wins·백업 복원·같은 날 시술 기록 2건 같은
 * 경우에 어긋나도 되돌릴 길이 없었다. 기록(결제·예약·시술 기록)이 정본이므로 거기서 다시 센다.
 *  - 누적 결제액 = 완료(completed) 결제 합 (고객 병합 창의 "완료된 결제 기록 기준"과 같은 정의)
 *  - 방문 횟수 = 완료 예약 날짜 ∪ 시술 기록 날짜의 서로 다른 날 수 (같은 날 두 번 기록해도 1회)
 *  - 마지막 방문일 = 그중 가장 늦은 날
 * 방문 횟수는 의도된 정의 변경이다: 코어는 예약 완료 +1, 시술 기록 저장 +1로 같은 날 방문을 두 번 세지만(코어 전용 결함, 로드맵 P1),
 * 여기서는 "다녀간 날 수"로 센다. 목록·상세가 어긋나 보이지 않게 기록을 저장한 직후(예약 완료·시술 기록)와 상세를 열 때 바로 맞춘다 (리뷰 2026-11-19).
 */
export interface CustomerStats { totalSpent: number; totalVisits: number; lastVisitDate: string | null }

function computeCustomerStats(customerId: string): CustomerStats {
  const totalSpent = PaymentStore.getAll()
    .filter(p => p.customerId === customerId && p.status === 'completed')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const dates = new Set<string>();
  for (const r of ReservationStore.getAll()) if (r.customerId === customerId && r.status === 'completed' && r.date) dates.add(r.date);
  for (const t of TreatmentLogStore.getAll()) if (t.customerId === customerId && t.treatmentDate) dates.add(t.treatmentDate);
  let lastVisitDate: string | null = null;
  for (const d of dates) if (!lastVisitDate || d > lastVisitDate) lastVisitDate = d;
  return { totalSpent, totalVisits: dates.size, lastVisitDate };
}

/**
 * 저장된 증분값이 재계산값과 다르면 고쳐 쓰고 고친 고객을 돌려준다(차이 없으면 null).
 * 고객 상세를 열 때 그 고객 한 명만 — 목록 전수는 결제 4,000건에서 비싸고, 어차피 보는 사람이 있는 고객부터 맞으면 된다.
 * 마지막 방문일은 내리지 않는다(기록 없이 손으로 적은 방문일을 지우지 않게).
 */
function healCustomerStats(customerId: string): Customer | null {
  const c = CustomerStore.getById(customerId);
  if (!c) return null;
  const s = computeCustomerStats(customerId);
  const updates: Partial<Customer> = {};
  // 필드별 가드: 그 필드의 근거 기록이 매장 전체에 하나도 없으면(컬렉션 로드 실패·하이드레이션 전) 저장값을 0으로 내리지 않는다 — 결제만 로드에 실패해도
  // 예약·시술은 있어 전체 가드가 열리는 경우를 막는다. 정당한 0은 코어 delete/updateStatus가 이미 차감하므로 잃는 것이 없다 (리뷰 2026-11-19)
  const noPayments = PaymentStore.getAll().length === 0;
  const noVisitRecords = ReservationStore.getAll().length === 0 && TreatmentLogStore.getAll().length === 0;
  if ((c.totalSpent || 0) !== s.totalSpent && !(noPayments && (c.totalSpent || 0) > 0)) updates.totalSpent = s.totalSpent;
  if ((c.totalVisits || 0) !== s.totalVisits && !(noVisitRecords && (c.totalVisits || 0) > 0)) updates.totalVisits = s.totalVisits;
  if (s.lastVisitDate && (c.lastVisitDate || '') < s.lastVisitDate) updates.lastVisitDate = s.lastVisitDate;
  if (Object.keys(updates).length === 0) return null;
  return CustomerStore.update(customerId, updates);
}

/**
 * 서버 하이드레이션(initializeStores)이 끝난 뒤 재계산 — 이미 끝났으면 마이크로태스크 하나로 즉시. 기록 저장 직후 호출 지점(예약 완료·시술 기록)도 이 경로로:
 * 로그인 직후 새 기기에서 결제 목록이 비어 있는 채로 0을 서버에 PATCH하지 않게. initializeStores는 실패를 삼키고 resolve하므로 catch는 방어용 (리뷰 2026-11-19)
 */
export function healCustomerStatsWhenReady(customerId: string, onHealed?: (healed: Customer) => void): void {
  void initializeStores().then(() => {
    const healed = healCustomerStats(customerId);
    if (healed && onHealed) onHealed(healed);
  }).catch(() => { /* 로드 실패는 오프라인 배너가 알린다 — 재계산만 건너뜀 */ });
}
