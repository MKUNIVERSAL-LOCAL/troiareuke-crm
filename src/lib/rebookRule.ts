// ═══════════════════════════════════════════════════════════════
// rebookRule — 결제 직후 "다음 방문 예약" 추천 규칙 (순수 모듈, 231, GAP R-11)
// ───────────────────────────────────────────────────────────────
// 왜: 상용 CRM(Fresha·Boulevard·Zenoti)은 결제(체크아웃) 화면에서 바로 다음 예약을 잡게 한다 —
//     나간 뒤 문자로 부르는 것보다 붙잡기 쉽다. 우리는 재예약률·재방문 리마인더·캠페인은 있었지만
//     "결제한 그 자리에서 다음 예약" 흐름이 없었다.
// 규칙:
//   1) 이미 결제일 이후의 살아 있는 예약이 있으면 추천하지 않는다(같은 말을 두 번 하지 않는다).
//   2) 시술 기록의 "다음 방문 권장일"이 결제일 이후면 그 날짜 (basis 'recommended').
//   3) 아니면 기준일(결제일과 마지막 방문일 중 나중) + 주기. 방문 3회 이상이면 그 고객의 평균 주기(personal),
//      아니면 매장 기본 주기(shop) — 어느 쪽인지 화면에 그대로 적는다(추정을 확정처럼 말하지 않기).
// 날짜는 전부 로컬 YYYY-MM-DD (revisitRule 과 같은 규칙 — toISOString 은 KST 자정~09시에 전날로 어긋난다).
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

import { addDays } from './revisitRule';
import { personalCycleDays } from './visitCycleRule';
import { isUpcomingReservation } from './upcomingRule';

export interface RebookInput {
  /** 기준일 — 방금 등록한 결제의 결제일 */
  paymentDate: string;
  /** 고객의 마지막 방문일(완료 예약 ∪ 시술 기록) */
  lastVisitDate?: string | null;
  /** 최근 시술 기록의 "다음 방문 권장일" */
  nextAppointment?: string | null;
  /** 방문일 목록(서로 다른 날) — 개인 주기 산출용 */
  visitDays?: string[];
  /** 매장 기본 재방문 주기(일) */
  shopCycleDays: number;
  /** 그 고객의 예약 전부(날짜·상태) — 다가오는 예약이 있는지 보는 데만 쓴다 */
  reservations?: { date: string; status: string }[];
}

export interface RebookSuggestion {
  /** 추천 날짜 (YYYY-MM-DD) */
  date: string;
  /** 근거 */
  basis: 'recommended' | 'personal' | 'shop';
  /** 기준일부터 추천일까지 날 수 */
  days: number;
  /** 화면에 그대로 쓰는 근거 문구 */
  reason: string;
}

/** 다음 방문 추천 — 추천할 것이 없으면 null */
export function suggestRebook(i: RebookInput): RebookSuggestion | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.paymentDate)) return null;
  const base = i.lastVisitDate && i.lastVisitDate > i.paymentDate ? i.lastVisitDate : i.paymentDate;

  // 1) 이미 다가오는 예약이 있으면 묻지 않는다 (취소·노쇼 제외, 오늘 완료분 제외 — upcomingRule 과 같은 정의)
  for (const r of i.reservations ?? []) {
    if (isUpcomingReservation(r, i.paymentDate)) return null;
  }

  // 2) 시술 기록의 다음 방문 권장일이 앞으로 남아 있으면 그 날짜
  if (i.nextAppointment && /^\d{4}-\d{2}-\d{2}$/.test(i.nextAppointment) && i.nextAppointment > base) {
    return { date: i.nextAppointment, basis: 'recommended', days: diffDays(base, i.nextAppointment), reason: '시술 기록의 다음 방문 권장일' };
  }

  // 3) 주기로 계산 — 개인 주기(방문 3회 이상)가 있으면 그것, 없으면 매장 기본
  const personal = personalCycleDays(i.visitDays ?? []);
  const shop = Number.isFinite(i.shopCycleDays) && i.shopCycleDays > 0 ? Math.round(i.shopCycleDays) : 0;
  const days = personal?.days ?? shop;
  if (!days) return null; // 주기를 모르면 추천하지 않는다
  return {
    date: addDays(base, days),
    basis: personal ? 'personal' : 'shop',
    days,
    reason: personal ? `이 고객 평균 주기 ${personal.days}일(방문 ${personal.intervals + 1}회 기준)` : `매장 기본 주기 ${days}일`,
  };
}

function diffDays(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO + 'T00:00:00').getTime() - new Date(fromISO + 'T00:00:00').getTime()) / 86_400_000);
}

/** 화면 한 줄 — "12월 18일(목) · 이 고객 평균 주기 21일" */
export function describeRebook(s: RebookSuggestion, formatDate: (iso: string) => string): string {
  return `${formatDate(s.date)} · ${s.reason}`;
}
