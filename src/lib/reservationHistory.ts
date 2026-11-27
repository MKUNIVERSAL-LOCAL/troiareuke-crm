// reservationHistory — 예약 변경 이력 저장 (비코어, 247)
// 저장 위치: **이 기기 localStorage** `crm_<shop>_reservation_history`(stockLedger·rebookLog 와 같은 방식).
//   설정 행에 두면 예약을 저장할 때마다 preferences 묶음 전체가 서버로 올라가 다른 PC 의 설정을 덮는다(246 리뷰 H-1).
//   지점 공용 이력은 서버 컬렉션 승인(B-2/S-7) 뒤 같은 행 형식을 올리는 어댑터로 — 승인 큐 25.
// 규칙은 reservationHistoryRule.ts(순수). 여기서는 저장과 읽기만 한다.
import { getShopId, safeSetItem, ReservationStore } from './store';
import { todayISO } from './format';
import {
  sanitizeHistory, trimHistory, historyFor, diffReservation, statusChange,
  type HistoryEntry, type HistoryKind, type HistorySnapshot,
} from './reservationHistoryRule';

const KEEP_DAYS = 180;
const KEY = () => `crm_${getShopId()}_reservation_history`;

function keepFrom(): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() - KEEP_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): HistoryEntry[] {
  try {
    return sanitizeHistory(JSON.parse(localStorage.getItem(KEY()) || '[]'));
  } catch {
    return [];
  }
}

function append(entry: HistoryEntry): void {
  try {
    safeSetItem(KEY(), JSON.stringify(trimHistory([...read(), entry], keepFrom())));
  } catch {
    /* 이력 저장 실패가 예약 저장을 되돌리게 하지 않는다 */
  }
}

function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function record(reservationId: string, kind: HistoryKind, changes: { label: string; from: string; to: string }[], actor?: string): void {
  if (kind !== 'create' && changes.length === 0) return; // 바뀐 것이 없으면 남기지 않는다
  append({ id: genId(), reservationId, at: new Date().toISOString(), kind, ...(actor ? { actor } : {}), changes });
}

/** 예약을 고쳤다 — 저장 전/후를 비교해 바뀐 항목만 남긴다 */
export function logReservationEdit(reservationId: string, before: HistorySnapshot, after: HistorySnapshot, actor?: string): void {
  record(reservationId, 'edit', diffReservation(before, after), actor);
}

/** 상태를 바꿨다(취소·노쇼·복구·완료) */
export function logReservationStatus(reservationId: string, from: string | undefined, to: string, actor?: string): void {
  record(reservationId, 'status', statusChange(from, to), actor);
}

/** 예약을 새로 등록했다 — 머리말이 이미 "등록" 이라 줄에는 날짜·시간만 적는다 (250 리뷰 L-5) */
export function logReservationCreate(reservationId: string, snapshot: HistorySnapshot, actor?: string): void {
  record(reservationId, 'create', [{ label: '날짜·시간', from: '', to: `${snapshot.date} ${snapshot.startTime}` }], actor);
}

/** 예약을 삭제했다 — "그 예약 받은 적 없다" 분쟁의 핵심 경로라 흔적을 남긴다 (250 리뷰 H-3) */
export function logReservationDelete(reservationId: string, snapshot: HistorySnapshot, actor?: string): void {
  record(reservationId, 'delete', [{ label: '삭제', from: `${snapshot.date} ${snapshot.startTime}`, to: '' }], actor);
}

/**
 * 그 고객의 예약 이력을 지운다 — 익명화·고객 삭제가 이 기록을 몰라 **실명이 최대 180일 남았다** (250 리뷰 H-4).
 * 244 의 취소 사유 정리(clearFreeTextReasonsOfCustomer)와 같은 짝이다.
 */
export function clearHistoryOfCustomer(customerId: string): number {
  try {
    const mine = new Set(ReservationStore.getAll().filter(r => r.customerId === customerId).map(r => r.id));
    if (mine.size === 0) return 0;
    const all = read();
    const next = all.filter(e => !mine.has(e.reservationId));
    if (next.length === all.length) return 0;
    safeSetItem(KEY(), JSON.stringify(next));
    return all.length - next.length;
  } catch {
    return 0;
  }
}

/** 예약 한 건의 이력을 지운다 — 예약을 삭제할 때 호출(삭제 기록만 남기거나 전부 정리) */
// 315: `clearHistoryOfReservation` 을 지웠다 — 250 이 개인정보 정리를 **고객 단위**
// (`clearHistoryOfCustomer`)로 바꾸면서 호출자가 0이 됐다(CLAUDE.md 2절).

/** 그 예약의 이력(최근 것이 위로) */
export function reservationHistory(reservationId: string): HistoryEntry[] {
  return historyFor(read(), reservationId);
}
