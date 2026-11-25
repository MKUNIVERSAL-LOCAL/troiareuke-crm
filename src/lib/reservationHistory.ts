// reservationHistory — 예약 변경 이력 저장 (비코어, 247)
// 저장 위치: **이 기기 localStorage** `crm_<shop>_reservation_history`(stockLedger·rebookLog 와 같은 방식).
//   설정 행에 두면 예약을 저장할 때마다 preferences 묶음 전체가 서버로 올라가 다른 PC 의 설정을 덮는다(246 리뷰 H-1).
//   지점 공용 이력은 서버 컬렉션 승인(B-2/S-7) 뒤 같은 행 형식을 올리는 어댑터로 — 승인 큐 25.
// 규칙은 reservationHistoryRule.ts(순수). 여기서는 저장과 읽기만 한다.
import { getShopId, safeSetItem } from './store';
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

/** 예약을 새로 등록했다 — 첫 줄이 "등록" 으로 시작하게 */
export function logReservationCreate(reservationId: string, snapshot: HistorySnapshot, actor?: string): void {
  record(reservationId, 'create', [{ label: '등록', from: '', to: `${snapshot.date} ${snapshot.startTime}` }], actor);
}

/** 그 예약의 이력(최근 것이 위로) */
export function reservationHistory(reservationId: string): HistoryEntry[] {
  return historyFor(read(), reservationId);
}
