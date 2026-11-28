// ═══════════════════════════════════════════════════════════════
// reminderEngine — 자동 재방문 리마인더 (킬러 기능 ③, 비코어)
// ───────────────────────────────────────────────────────────────
// 목적: 재방문 이탈(에스테틱 최대 매출 누수)을 막기 위해, 권장 재방문일이
//       지난 고객을 자동 산출한다.
// 산출 규칙은 revisitRule.computeRevisitDue (순수) — 권장일 → 마지막 방문 + 주기(기본 28일, 설정 가능).
//   그 날짜가 오늘 이전이고, 아직 예정된(미래) 예약이 없으면 '재방문 대상'.
// ⚠️ 실제 카카오/문자 자동 발송은 회사 NAS 서버의 게이트웨이 연동 후 지원.
//    지금은 대상 산출 + 메시지 초안 생성까지(수동 발송/복사 가능).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, TreatmentLogStore, ReservationStore, SettingsStore } from './store';
import type { Customer, TreatmentLog } from '../types';
import { getPreference, setPreference, migrateLegacyPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';
import { toISO, daysBetween, computeRevisitDue } from './revisitRule';
import { computeCustomerStats, buildCustomerStatsIndex, statsFor, collectVisitDates } from './customerStats';
import { resolveVisitCycle, type VisitCycle } from './visitCycleRule';
import { isUpcomingReservation } from './upcomingRule';
import type { CustomerStatsIndex } from './customerStatsRule';
import { isCountableCustomer } from './customerScope';

const LEGACY_CYCLE_KEY = 'troiareuke_revisit_cycle_days';
export const DEFAULT_CYCLE_DAYS = 28;
export const MIN_CYCLE_DAYS = 7;
export const MAX_CYCLE_DAYS = 365;

/** 재방문 권장 주기(일) — 지점 환경설정(서버 동기). 설정 > 알림 설정에서 변경. 예전 PC별 값은 1회 이관. */
export function getRevisitCycleDays(): number {
  const migrated = migrateLegacyPreference('revisitCycleDays', LEGACY_CYCLE_KEY, raw => {
    const v = parseInt(raw, 10);
    return Number.isFinite(v) && v >= MIN_CYCLE_DAYS && v <= MAX_CYCLE_DAYS ? v : null;
  });
  const v = migrated ?? getPreference('revisitCycleDays');
  return typeof v === 'number' && Number.isFinite(v) && v >= MIN_CYCLE_DAYS && v <= MAX_CYCLE_DAYS ? v : DEFAULT_CYCLE_DAYS;
}

/**
 * 재방문 권장 주기 저장(7~365일). 범위 밖이면 `'invalid'`. 서버 리마인더도 같은 값을 읽는다.
 * 294(288~292 리뷰 M-7): 전에는 `boolean` 이라 **저장이 남았는지를 버렸다** — 290 이 보존기간에서
 * HIGH 급으로 고친 것과 같은 모양이고, 같은 설정 탭 바로 옆 카드였다.
 */
export function setRevisitCycleDays(days: number): PrefLanded {
  if (!Number.isInteger(days) || days < MIN_CYCLE_DAYS || days > MAX_CYCLE_DAYS) return 'invalid';
  return setPreference('revisitCycleDays', days);
}

export interface DueCustomer {
  customer: Customer;
  lastVisit: string | null;    // 마지막 방문/시술일
  dueDate: string;             // 권장 재방문일 (YYYY-MM-DD)
  overdueDays: number;         // 지난 일수 (오늘 - dueDate)
  basis: 'recommended' | 'cycle'; // 권장일 기반인지, 주기 추정인지
  cycleDays: number;           // 주기 추정에 쓴 일수 (135)
  cycleBasis: VisitCycle['basis']; // 'personal' 이 고객의 방문 간격 중앙값 / 'shop' 매장 기본
}

export interface CustomerRevisitInfo {
  dueDate: string;                 // 권장 재방문일 (YYYY-MM-DD)
  daysLeft: number;                // 남은 일수 (음수 = 지남)
  basis: 'recommended' | 'cycle';  // 시술기록 권장일 / 주기 추정
  upcomingReservation: string | null; // 이미 잡힌 다음 예약일
  cycleDays: number;               // (135)
  cycleBasis: VisitCycle['basis'];
}

/** 고객별 방문 주기 — 방문 3회 이상이면 간격 중앙값, 아니면 매장 기본 주기 (135, docs/ANALYTICS-DEFINITIONS.md) */
export function getCustomerVisitCycle(customerId: string): VisitCycle {
  return resolveVisitCycle(collectVisitDates(customerId), getRevisitCycleDays());
}

/** 고객 상세용 — 다음 방문 권장일과 남은 일수 (방문 이력이 없으면 null). 리마인더 목록과 같은 규칙 (2026-11-17) */
export function getCustomerRevisitInfo(customerId: string): CustomerRevisitInfo | null {
  const todayStr = toISO(new Date());
  const upcoming = ReservationStore.getAll()
    .filter(r => r.customerId === customerId && isUpcomingReservation(r, todayStr)) // 재예약률·이탈 위험과 같은 정의 (139 #M3)
    .map(r => r.date)
    .sort()[0] ?? null;
  const lastLog = TreatmentLogStore.getByCustomer(customerId)[0];
  const customer = CustomerStore.getAll().find(c => c.id === customerId);
  // 마지막 방문일은 기록(완료 예약·시술) 기준 — 저장값은 과거 날짜 시술을 적어도 "오늘"로 찍혀 권장일이 늦게 잡혔다 (10차 숫자 점검 #H1)
  const recordLast = customer ? computeCustomerStats(customer.id).lastVisitDate : null;
  const cycle = getCustomerVisitCycle(customerId); // 매장 공통 주기 → 고객별 주기 (135)
  const due = computeRevisitDue({ lastTreatmentDate: lastLog?.treatmentDate, nextAppointment: lastLog?.nextAppointment, lastVisitDate: recordLast ?? customer?.lastVisitDate, cycleDays: cycle.days });
  if (!due) return null;
  return { dueDate: due.dueDate, daysLeft: daysBetween(todayStr, due.dueDate), basis: due.basis, upcomingReservation: upcoming, cycleDays: cycle.days, cycleBasis: cycle.basis };
}

/**
 * 재방문 권장일이 지난 고객 목록 (오래 지난 순 정렬).
 * @param minOverdueDays 최소 며칠 이상 지났을 때만 포함 (기본 0 = 오늘 포함)
 */
export function getRevisitDueCustomers(minOverdueDays = 0, statsIndex: CustomerStatsIndex = buildCustomerStatsIndex()): DueCustomer[] {
  const cycle = getRevisitCycleDays();
  const todayISO = toISO(new Date());
  const customers = CustomerStore.getAll().filter(isCountableCustomer); // 샘플·익명화(보존기간 경과) 고객 제외 — 대시보드·생일과 같은 규칙
  // statsIndex: 기록 기준 마지막 방문일 (10차 숫자 점검 #H1) — 호출 쪽이 이미 만든 인덱스를 넘기면 재사용 (139 #M8)
  // 한 번에 버킷 — 고객 3,000명 × 예약 8,000·시술 15,000건을 고객마다 훑으면 폰에서 포커스 복귀 때마다 1초 이상 멈춘다 (성능 감사 2026-11-18)
  const upcoming = new Set<string>();
  for (const r of ReservationStore.getAll()) if (isUpcomingReservation(r, todayISO)) upcoming.add(r.customerId); // (139 #M3)
  const latestLog = new Map<string, TreatmentLog>();
  for (const t of TreatmentLogStore.getAll()) {
    const cur = latestLog.get(t.customerId);
    if (!cur || t.treatmentDate > cur.treatmentDate) latestLog.set(t.customerId, t); // getByCustomer와 같은 "최신 시술" 기준
  }

  const result: DueCustomer[] = [];

  for (const customer of customers) {
    // 미래 예약이 이미 있으면 리마인더 제외 (이미 재방문 예정)
    if (upcoming.has(customer.id)) continue;

    const lastLog = latestLog.get(customer.id);
    const vc = resolveVisitCycle(statsIndex.visitDays?.get(customer.id) ?? [], cycle); // 고객별 주기, 없으면 매장 기본 (135)
    const due = computeRevisitDue({ lastTreatmentDate: lastLog?.treatmentDate, nextAppointment: lastLog?.nextAppointment, lastVisitDate: statsFor(customer, statsIndex).lastVisitDate, cycleDays: vc.days }); // 상세(getCustomerRevisitInfo)와 같은 규칙
    if (!due) continue; // 방문 이력이 전혀 없는 고객은 리마인더 대상에서 제외
    const overdueDays = daysBetween(due.dueDate, todayISO);
    if (overdueDays < minOverdueDays) continue;

    result.push({ customer, lastVisit: due.lastVisit, dueDate: due.dueDate, overdueDays, basis: due.basis, cycleDays: vc.days, cycleBasis: vc.basis });
  }

  // 가장 오래 지난 고객 우선
  return result.sort((a, b) => b.overdueDays - a.overdueDays);
}

/** 재방문 리마인더 메시지 초안 생성 (카카오/문자용) */
export function buildReminderMessage(customer: Customer): string {
  const shopName = SettingsStore.get().name || '저희 매장';
  const name = customer.name || '고객';
  return (
    `[${shopName}] ${name}님, 안녕하세요.\n` + // 이모지는 SMS를 유니코드(LMS 요금)로 만들고 일부 발송사가 지운다 (산출물 감사 2026-11-20)
    `피부 관리 주기가 다가왔어요. 그동안 관리하신 피부 컨디션을 이어가시려면 ` +
    `이번 주 방문을 추천드려요!\n` +
    `예약 문의는 편하게 답장 주세요.${SettingsStore.get().phone ? ` (${SettingsStore.get().phone})` : ''} 감사합니다.`
  );
}
