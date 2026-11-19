// ═══════════════════════════════════════════════════════════════
// reservationReminder — 내일 예약 안내 (노쇼 방지, 비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 설정의 "예약 리마인더(전날 09:00 자동 발송)"는 발송사 연동 후 서버가 보낸다. 그 전에는 지점이
// 전날 오후에 손으로 보내야 하므로, 내일 예약을 대시보드에 모아 안내 문구 초안을 복사/공유한다.
// ═══════════════════════════════════════════════════════════════

import { ReservationStore, CustomerStore, SettingsStore } from './store';
import type { Reservation } from '../types';

function localISO(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // 예약일은 지역 날짜(YYYY-MM-DD) 기준
}

export function tomorrowISO(today = new Date()): string {
  const t = new Date(today);
  t.setDate(t.getDate() + 1);
  return localISO(t);
}

/** 내일 예약(확정·대기) — 취소·노쇼·완료 제외, 익명화 고객 제외, 시작 시각 순 */
export function getTomorrowReservations(today = new Date()): Reservation[] {
  const target = tomorrowISO(today);
  const inactive = new Set(CustomerStore.getAll().filter(c => c.isActive === false).map(c => c.id));
  return ReservationStore.getAll()
    .filter(r => r.date === target && r.status !== 'cancelled' && r.status !== 'noshow' && r.status !== 'completed' && !inactive.has(r.customerId))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 예약 안내 문구 초안 — 복사/공유용 (발송사 연동 후 서버 자동 발송과 같은 내용) */
export function buildReservationMessage(r: Reservation): string {
  const shop = SettingsStore.get().name || '저희 샵';
  const d = new Date(r.date + 'T00:00:00');
  const dateLabel = Number.isNaN(d.getTime()) ? r.date : `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY[d.getDay()]})`;
  const services = r.services.map(s => s.serviceName).filter(Boolean).join(', ');
  const lines = [
    `[${shop}] ${r.customerName}님, 내일 예약 안내드립니다.`,
    `· 일시: ${dateLabel} ${r.startTime}`,
  ];
  if (services) lines.push(`· 시술: ${services}`);
  if (r.staffName) lines.push(`· 담당: ${r.staffName}`);
  lines.push('일정 변경이나 취소는 미리 알려주시면 감사하겠습니다. 내일 뵙겠습니다 :)');
  return lines.join('\n');
}
