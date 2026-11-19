// ═══════════════════════════════════════════════════════════════
// reminderEngine — 자동 재방문 리마인더 (킬러 기능 ③, 비코어)
// ───────────────────────────────────────────────────────────────
// 목적: 재방문 이탈(에스테틱 최대 매출 누수)을 막기 위해, 권장 재방문일이
//       지난 고객을 자동 산출한다.
// 산출 규칙(우선순위):
//   1) 최근 시술기록의 '다음 방문 권장일(nextAppointment)'이 있으면 그 날짜
//   2) 없으면 마지막 방문일 + 기본 재방문 주기(기본 28일, 설정 가능)
//   그 날짜가 오늘 이전이고, 아직 예정된(미래) 예약이 없으면 '재방문 대상'.
// ⚠️ 실제 카카오/문자 자동 발송은 회사 NAS 서버의 게이트웨이 연동 후 지원.
//    지금은 대상 산출 + 메시지 초안 생성까지(수동 발송/복사 가능).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, TreatmentLogStore, ReservationStore, SettingsStore } from './store';
import type { Customer, TreatmentLog } from '../types';
import { getPreference, setPreference, migrateLegacyPreference } from './shopPreferences';

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

/** 재방문 권장 주기 저장(7~365일). 범위 밖이면 false. 서버 리마인더도 같은 값을 읽는다. */
export function setRevisitCycleDays(days: number): boolean {
  if (!Number.isInteger(days) || days < MIN_CYCLE_DAYS || days > MAX_CYCLE_DAYS) return false;
  setPreference('revisitCycleDays', days);
  return true;
}

export interface DueCustomer {
  customer: Customer;
  lastVisit: string | null;    // 마지막 방문/시술일
  dueDate: string;             // 권장 재방문일 (YYYY-MM-DD)
  overdueDays: number;         // 지난 일수 (오늘 - dueDate)
  basis: 'recommended' | 'cycle'; // 권장일 기반인지, 주기 추정인지
}

// toISOString()은 UTC 기준이라 KST 자정~오전 9시에 전날로 어긋난다.
// format.ts todayISO와 동일하게 로컬 y/m/d로 조립한다.
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export interface CustomerRevisitInfo {
  dueDate: string;                 // 권장 재방문일 (YYYY-MM-DD)
  daysLeft: number;                // 남은 일수 (음수 = 지남)
  basis: 'recommended' | 'cycle';  // 시술기록 권장일 / 주기 추정
  upcomingReservation: string | null; // 이미 잡힌 다음 예약일
}

/** 둘 다 있으면 나중 날짜 — 시술기록만 보면 예약 완료(방문)로만 다녀간 고객이 '기한 지남'으로 잘못 잡힌다 (정합성 감사 2026-11-19) */
const later = (a?: string | null, b?: string | null): string | null => (a && b ? (a > b ? a : b) : a || b || null);

/** 고객 상세용 — 다음 방문 권장일과 남은 일수 (방문 이력이 없으면 null). 리마인더 목록과 같은 규칙 (2026-11-17) */
export function getCustomerRevisitInfo(customerId: string): CustomerRevisitInfo | null {
  const todayStr = toISO(new Date());
  const upcoming = ReservationStore.getAll()
    .filter(r => r.customerId === customerId && r.date >= todayStr && r.status !== 'cancelled')
    .map(r => r.date)
    .sort()[0] ?? null;
  const logs = TreatmentLogStore.getByCustomer(customerId);
  const lastLog = logs[0];
  const customer = CustomerStore.getAll().find(c => c.id === customerId);
  const lastVisit = later(lastLog?.treatmentDate, customer?.lastVisitDate);
  let dueDate: string;
  let basis: CustomerRevisitInfo['basis'];
  // 권장일(nextAppointment) 뒤에 다시 다녀갔다면(예약 완료만 있고 새 시술 기록이 없는 경우) 그 권장일은 이미 소화된 것 — 마지막 방문 + 주기로 (UX 점검 2026-11-19)
  if (lastLog?.nextAppointment && !(lastVisit && lastVisit >= lastLog.nextAppointment)) { dueDate = lastLog.nextAppointment; basis = 'recommended'; }
  else if (lastVisit) { dueDate = addDays(lastVisit, getRevisitCycleDays()); basis = 'cycle'; }
  else return null;
  const daysLeft = Math.round((new Date(dueDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000);
  return { dueDate, daysLeft, basis, upcomingReservation: upcoming };
}

/**
 * 재방문 권장일이 지난 고객 목록 (오래 지난 순 정렬).
 * @param minOverdueDays 최소 며칠 이상 지났을 때만 포함 (기본 0 = 오늘 포함)
 */
export function getRevisitDueCustomers(minOverdueDays = 0): DueCustomer[] {
  const cycle = getRevisitCycleDays();
  const todayISO = toISO(new Date());
  const customers = CustomerStore.getAll().filter(c => !c.id.startsWith('sample_') && c.isActive !== false); // 익명화(보존기간 경과) 고객 제외
  // 한 번에 버킷 — 고객 3,000명 × 예약 8,000·시술 15,000건을 고객마다 훑으면 폰에서 포커스 복귀 때마다 1초 이상 멈춘다 (성능 감사 2026-11-18)
  const upcoming = new Set<string>();
  for (const r of ReservationStore.getAll()) if (r.date >= todayISO && r.status !== 'cancelled') upcoming.add(r.customerId);
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
    const lastVisit = later(lastLog?.treatmentDate, customer.lastVisitDate);

    let dueDate: string | null = null;
    let basis: DueCustomer['basis'] = 'cycle';

    if (lastLog?.nextAppointment && !(lastVisit && lastVisit >= lastLog.nextAppointment)) { // 상세(getCustomerRevisitInfo)와 같은 규칙 — 권장일 당일 방문도 소화한 것
      dueDate = lastLog.nextAppointment;
      basis = 'recommended';
    } else if (lastVisit) {
      dueDate = addDays(lastVisit, cycle);
      basis = 'cycle';
    } else {
      // 방문 이력이 전혀 없는 고객은 리마인더 대상에서 제외
      continue;
    }

    const overdueDays = Math.floor(
      (new Date(todayISO).getTime() - new Date(dueDate).getTime()) / 86400000
    );
    if (overdueDays < minOverdueDays) continue;

    result.push({ customer, lastVisit, dueDate, overdueDays, basis });
  }

  // 가장 오래 지난 고객 우선
  return result.sort((a, b) => b.overdueDays - a.overdueDays);
}

/** 재방문 리마인더 메시지 초안 생성 (카카오/문자용) */
export function buildReminderMessage(customer: Customer): string {
  const shopName = SettingsStore.get().name || '저희 샵';
  const name = customer.name || '고객';
  return (
    `[${shopName}] ${name}님, 안녕하세요.\n` + // 이모지는 SMS를 유니코드(LMS 요금)로 만들고 일부 발송사가 지운다 (산출물 감사 2026-11-20)
    `피부 관리 주기가 다가왔어요. 그동안 관리하신 피부 컨디션을 이어가시려면 ` +
    `이번 주 방문을 추천드려요!\n` +
    `예약 문의는 편하게 답장 주세요.${SettingsStore.get().phone ? ` (${SettingsStore.get().phone})` : ''} 감사합니다.`
  );
}
