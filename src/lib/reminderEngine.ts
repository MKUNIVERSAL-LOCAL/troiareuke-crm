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
import type { Customer } from '../types';

const CYCLE_KEY = 'troiareuke_revisit_cycle_days';
const DEFAULT_CYCLE_DAYS = 28;

/** 기본 재방문 주기(일) — 설정에서 변경 가능(기기별 localStorage) */
export function getRevisitCycleDays(): number {
  try {
    const v = parseInt(localStorage.getItem(CYCLE_KEY) || '', 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_CYCLE_DAYS;
  } catch {
    return DEFAULT_CYCLE_DAYS;
  }
}

export function setRevisitCycleDays(days: number): void {
  try { localStorage.setItem(CYCLE_KEY, String(days)); } catch { /* noop */ }
}

export interface DueCustomer {
  customer: Customer;
  lastVisit: string | null;    // 마지막 방문/시술일
  dueDate: string;             // 권장 재방문일 (YYYY-MM-DD)
  overdueDays: number;         // 지난 일수 (오늘 - dueDate)
  basis: 'recommended' | 'cycle'; // 권장일 기반인지, 주기 추정인지
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/**
 * 재방문 권장일이 지난 고객 목록 (오래 지난 순 정렬).
 * @param minOverdueDays 최소 며칠 이상 지났을 때만 포함 (기본 0 = 오늘 포함)
 */
export function getRevisitDueCustomers(minOverdueDays = 0): DueCustomer[] {
  const cycle = getRevisitCycleDays();
  const todayISO = toISO(new Date());
  const customers = CustomerStore.getAll().filter(c => !c.id.startsWith('sample_'));
  const allReservations = ReservationStore.getAll();

  const result: DueCustomer[] = [];

  for (const customer of customers) {
    // 미래 예약이 이미 있으면 리마인더 제외 (이미 재방문 예정)
    const hasUpcoming = allReservations.some(
      r => r.customerId === customer.id && r.date >= todayISO && r.status !== 'cancelled'
    );
    if (hasUpcoming) continue;

    const logs = TreatmentLogStore.getByCustomer(customer.id); // 최신순 정렬됨
    const lastLog = logs[0];
    const lastVisit = lastLog?.treatmentDate || customer.lastVisitDate || null;

    let dueDate: string | null = null;
    let basis: DueCustomer['basis'] = 'cycle';

    if (lastLog?.nextAppointment) {
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
    `[${shopName}] ${name}님, 안녕하세요 😊\n` +
    `피부 관리 주기가 다가왔어요. 그동안 관리하신 피부 컨디션을 이어가시려면 ` +
    `이번 주 방문을 추천드려요!\n` +
    `예약 문의는 편하게 답장 주세요. 감사합니다.`
  );
}
