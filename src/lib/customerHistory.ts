// customerHistory — 고객 정보 변경 이력 저장 (비코어, 252)
// 저장 위치: **이 기기 localStorage** `crm_<shop>_customer_history`(247 예약 이력과 같은 방식).
//   설정 행에 두면 고객을 저장할 때마다 preferences 전체가 서버로 올라가 다른 PC 의 설정을 덮는다(246 리뷰 H-1).
//   지점 공용 이력은 서버 컬렉션 승인(B-2/S-7) 뒤 — 승인 큐 25 와 함께 처리한다.
// 규칙은 customerHistoryRule.ts(순수). 여기서는 저장·읽기·정리만 한다.
import { getShopId, safeSetItem } from './store';
import { todayISO } from './format';
import {
  sanitizeCustomerHistory, trimCustomerHistory, customerHistoryFor, diffCustomer, gradeChange,
  type CustomerHistoryEntry, type CustomerHistoryKind, type CustomerSnapshot, type CustomerChange,
} from './customerHistoryRule';

const KEEP_DAYS = 180;
const KEY = () => `crm_${getShopId()}_customer_history`;

function keepFrom(): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() - KEEP_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): CustomerHistoryEntry[] {
  try {
    return sanitizeCustomerHistory(JSON.parse(localStorage.getItem(KEY()) || '[]'));
  } catch {
    return [];
  }
}

function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 이번 세션에서 이력 저장이 한 번이라도 실패했는가 — 카드가 "기록 없음" 을 거짓으로 말하지 않게 (254 리뷰 M-3) */
let writeFailed = false;
export function historyWriteFailed(): boolean {
  return writeFailed;
}

function entry(customerId: string, kind: CustomerHistoryKind, changes: CustomerChange[], actor?: string): CustomerHistoryEntry {
  return { id: genId(), customerId, at: new Date().toISOString(), kind, ...(actor ? { actor } : {}), changes };
}

/** 여러 건을 **한 번에** 쓴다 — 일괄 적용에서 고객마다 전체 배열을 다시 쓰던 비용을 없앤다 (254 리뷰 H-3) */
function write(entries: CustomerHistoryEntry[]): boolean {
  if (entries.length === 0) return true;
  try {
    const next = trimCustomerHistory([...read(), ...entries], keepFrom());
    safeSetItem(KEY(), JSON.stringify(next));
    // 되읽어 확인한다 — safeSetItem 은 용량 초과를 삼킨다
    const saved = read();
    const ok = saved.length >= Math.min(next.length, 1) && saved.some(e => e.id === entries[entries.length - 1].id);
    if (!ok) writeFailed = true;
    return ok;
  } catch {
    writeFailed = true; // 이력 저장 실패가 고객 저장을 되돌리게 하지는 않는다(기록만 남긴다)
    return false;
  }
}

function record(customerId: string, kind: CustomerHistoryKind, changes: CustomerChange[], actor?: string): void {
  if (changes.length === 0) return;
  write([entry(customerId, kind, changes, actor)]);
}

/** 고객 정보를 고쳤다 — 저장 전/후를 비교해 바뀐 항목만 남긴다 */
export function logCustomerEdit(customerId: string, before: CustomerSnapshot, after: CustomerSnapshot, actor?: string): void {
  record(customerId, 'edit', diffCustomer(before, after), actor);
}

/** 등급만 바꿨다(뱃지 드롭다운·등급 제안 일괄 적용) */
export function logCustomerGrade(customerId: string, from: string | undefined, to: string, actor?: string): void {
  record(customerId, 'grade', gradeChange(from, to), actor);
}

/**
 * 등급 일괄 적용 — 고객마다 한 줄씩이지만 **저장은 한 번**이다 (254 리뷰 H-3).
 * @returns 저장 성공 여부
 */
export function logCustomerGradeBatch(rows: { id: string; from?: string; to: string }[], actor?: string): boolean {
  const entries = rows
    .map(r => ({ r, changes: gradeChange(r.from, r.to) }))
    .filter(x => x.changes.length > 0)
    .map(x => entry(x.r.id, 'grade', x.changes, actor));
  return write(entries);
}

/** 태그 일괄 변경 등 — 고객마다 바뀐 항목을 모아 한 번에 저장한다 (254 리뷰 H-2·H-3) */
export function logCustomerEditBatch(rows: { id: string; before: CustomerSnapshot; after: CustomerSnapshot }[], actor?: string): boolean {
  const entries = rows
    .map(r => ({ r, changes: diffCustomer(r.before, r.after) }))
    .filter(x => x.changes.length > 0)
    .map(x => entry(x.r.id, 'edit', x.changes, actor));
  return write(entries);
}

/** 고객 병합 — 남는 고객에 "고객 병합" 으로 남긴다 (254 리뷰 H-2) */
export function logCustomerMerge(customerId: string, before: CustomerSnapshot, after: CustomerSnapshot, actor?: string): void {
  const changes = diffCustomer(before, after);
  write([entry(customerId, 'merge', changes.length > 0 ? changes : [{ label: '병합', from: '', to: '다른 고객 기록을 합침' }], actor)]);
}

/** 그 고객의 이력(최근 것이 위로) */
export function customerHistory(customerId: string): CustomerHistoryEntry[] {
  return customerHistoryFor(read(), customerId);
}

/**
 * 익명화·삭제 때 그 고객 이력을 지운다 — 이력에 남은 이름·태그도 개인정보다 (250 리뷰 H-4 와 같은 짝).
 * @returns 지운 건수
 */
export function clearCustomerHistory(customerId: string): number {
  try {
    const all = read();
    const next = all.filter(e => e.customerId !== customerId);
    if (next.length === all.length) return 0;
    safeSetItem(KEY(), JSON.stringify(next));
    return all.length - next.length;
  } catch {
    return 0;
  }
}
