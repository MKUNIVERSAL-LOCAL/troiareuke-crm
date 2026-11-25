// ═══════════════════════════════════════════════════════════════
// retentionPolicy — 개인정보 보존기간 정책 (P4, 비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 개인정보보호법: 수집 목적을 달성했거나 보유기간이 지난 개인정보는 지체 없이 파기해야 한다.
// 지점이 보존기간(년)을 정하면, 마지막 활동(마지막 방문·등록일 중 늦은 날)이 그 기간을 넘긴 고객을
// 대시보드·고객 화면에 "보존기간 경과"로 모아 보여주고, 한 번에 익명화(개인 식별 정보 제거)한다.
// 자동 삭제는 하지 않는다 — 사람이 확인하고 누르는 방식(실수 삭제·회차권 잔여 등 분쟁 방지).
// 정책은 지점 환경설정(서버 동기)에 저장되어 어느 PC/앱에서나 같다. 기본은 OFF(오너 결정 전).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, TreatmentLogStore } from './store';
import { toISODate, localISODate } from './format';
import { ConsultationStore } from './consultationStore';
import { clearPhotos } from './photoStore';
import type { Customer } from '../types';
import { getPreference, setPreference } from './shopPreferences';
import { clearFreeTextReasonsOfCustomer } from './cancelReasons';
import { clearHistoryOfCustomer } from './reservationHistory';
import { propagateCustomerIdentity, upcomingReservationsOf } from './customerIdentity';
import { resyncGcalEvents } from './gcalEventMap';

export interface RetentionPolicy {
  enabled: boolean;
  years: number; // 1~10
}

export const DEFAULT_RETENTION_YEARS = 3;
export const MIN_RETENTION_YEARS = 1;
export const MAX_RETENTION_YEARS = 10;
export const ANONYMIZED_NAME = '탈퇴고객';

export function getRetentionPolicy(): RetentionPolicy {
  const v = getPreference('retentionPolicy');
  const years = typeof v?.years === 'number' && Number.isInteger(v.years) && v.years >= MIN_RETENTION_YEARS && v.years <= MAX_RETENTION_YEARS
    ? v.years : DEFAULT_RETENTION_YEARS;
  return { enabled: v?.enabled === true, years };
}

/** 정책 저장(1~10년). 범위 밖이면 false. */
export function setRetentionPolicy(policy: RetentionPolicy): boolean {
  if (!Number.isInteger(policy.years) || policy.years < MIN_RETENTION_YEARS || policy.years > MAX_RETENTION_YEARS) return false;
  setPreference('retentionPolicy', { enabled: policy.enabled, years: policy.years });
  return true;
}

/** 고객의 마지막 활동일(YYYY-MM-DD) — 마지막 방문일과 등록일 중 늦은 날 */
export function lastActivityDate(c: Customer): string {
  const registered = localISODate(c.registeredAt); // UTC ISO → 로컬 날짜 — 방문일(로컬)과 같은 기준으로 비교 (12차 #M3)
  const visit = (c.lastVisitDate || '').slice(0, 10);
  return visit > registered ? visit : registered;
}

export function isAnonymized(c: Customer): boolean {
  return c.name === ANONYMIZED_NAME && !c.phone;
}

/** 보존기간이 지난(아직 익명화되지 않은) 고객 — 정책 OFF면 빈 배열 */
export function getExpiredCustomers(today = new Date()): Customer[] {
  const policy = getRetentionPolicy();
  if (!policy.enabled) return [];
  const cutoff = new Date(today.getFullYear() - policy.years, today.getMonth(), today.getDate()); // 2/29 기준이면 setFullYear 가 3/1 로 밀리던 것 — JS 가 2/29→(평년)3/1 로 정규화하되 기준은 명시적 (12차 #M3)
  const cutoffISO = toISODate(cutoff);
  return CustomerStore.getAll().filter(c => !c.id.startsWith('sample_') && !isAnonymized(c) && lastActivityDate(c) < cutoffISO);
}

/**
 * 익명화(파기) — 고객 레코드의 개인 식별 정보를 지우고 통계(방문·결제 합계)만 남긴다.
 * 예약·시술·프로그램·결제·상담 기록에 복사돼 있던 이름(예약은 전화번호도)과 얼굴 사진(시술·상담 사진)도 함께 지운다 —
 * 기록 자체는 고객 id로 연결된 채 남아 매출 통계가 깨지지 않는다. (제품 판매 기록의 저장 이름은 수정 API가 없어 남지만 화면·엑셀은 customerIdentity.saleCustomerName 으로 현재 이름을 읽어 노출되지 않는다 — 11차 #H4)
 * @returns 처리한 고객 수
 */
export function anonymizeCustomers(ids: string[]): number {
  let n = 0;
  const done: string[] = [];
  for (const id of ids) {
    const c = CustomerStore.getById(id);
    if (!c || isAnonymized(c)) continue;
    done.push(id);
    // 문자열 필드는 undefined가 아니라 ''로 지운다 — store의 toDbCustomer는 undefined 필드를 서버(NAS)에 보내지 않아
    // 로컬만 지워지고 서버 행에는 개인정보가 남는다 (2026-11-17 자체 점검에서 발견)
    CustomerStore.update(id, {
      name: ANONYMIZED_NAME,
      phone: '',
      email: '',
      address: '',
      birthDate: '',
      memo: '',
      allergies: '',
      skinType: '',
      tags: [],
      referralSource: '',
      privacyConsent: false,      // 로컬 전용 필드(서버 매핑 없음)
      privacyConsentAt: undefined,
      isActive: false,            // 재방문 리마인더·예약/발송 대상에서 제외하는 표식
    });
    // 연결 기록에 복사된 이름·전화 + 공유 Google 캘린더 앞 일정 — 고객 정보 수정·삭제와 같은 전파(customerIdentity). 수동 복제본일 때 캘린더만 빠져 실명이 남았다 (리뷰 #H4)
    propagateCustomerIdentity(id, { name: ANONYMIZED_NAME, phone: '' }, { resyncCalendar: false });
    clearFreeTextReasonsOfCustomer(id); // 취소·노쇼에 직접 적은 사유(개인 사정이 적힐 수 있다)도 지운다 (246 리뷰 M-4)
    clearHistoryOfCustomer(id);         // 예약 변경 이력에 남은 실명도 지운다 (250 리뷰 H-4)
    TreatmentLogStore.getByCustomer(id).forEach(t => clearPhotos(`treatment:${t.id}`));
    ConsultationStore.getByCustomer(id).forEach(c => clearPhotos(`consult:${c.id}`));
    n += 1;
  }
  if (n > 0) void resyncGcalEvents(upcomingReservationsOf(done)); // 건너뛴 id 는 제외 (120~122 리뷰 #L6) // 캘린더 재동기·실패 경고는 일괄 1회 (117~119 리뷰 #M1)
  return n;
}
