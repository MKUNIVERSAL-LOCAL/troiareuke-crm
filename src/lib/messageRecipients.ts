/**
 * 발송 이력 → 수신 고객 id 사이드맵(이 PC, 비코어) — 고객 활동 타임라인(204)·발송 이력 고객 필터(205)·다시 보내기가 읽는다.
 * 코어 MessageHistory 의 서버 매핑(toDbMessageHistory)에 없는 필드는 서버 모드 재조회(liveRefresh 60초·포커스) 때 사라지므로
 * 이력 행에 두지 않고 캠페인 발송 기록(campaign_sends)처럼 별도 로컬 키에 둔다 (206, 203~205 리뷰 H-1). 다른 PC 의 발송은 B-4 뒤.
 */
import { getShopId } from './store';

interface MessageRecipientRecord { historyId: string; customerIds: string[]; at: string }
const KEY = () => `crm_${getShopId()}_msg_history_recipients`;
/** 이력 300건분만 보관 — 세그먼트 대량 발송의 id 배열이 localStorage(5MB)를 비대화하지 않게 (203~205 리뷰 M-1) */
const MAX_RECORDS = 300;
/** 그보다 오래된 기록은 쓸모가 없다 — 재발송·타임라인이 보는 창(발송 이력 화면과 같은 체감) (210, 206 리뷰 L-4: at 이 쓰이지 않던 것) */
const MAX_AGE_DAYS = 365;

function read(): MessageRecipientRecord[] {
  try { const raw = localStorage.getItem(KEY()); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}

/** 발송 이력을 저장한 직후 그 id 로 수신 고객을 기록한다. 실패해도 이력 자체는 남는다(타임라인 줄만 빠짐) */
export function rememberRecipients(historyId: string, customerIds: string[]): void {
  if (customerIds.length === 0) return;
  const now = Date.now();
  const fresh = read().filter(r => {
    if (r.historyId === historyId) return false;
    const t = new Date(r.at).getTime();
    return Number.isNaN(t) || now - t < MAX_AGE_DAYS * 86_400_000; // 날짜가 깨진 옛 기록은 건수 상한에 맡긴다
  });
  const next = [...fresh, { historyId, customerIds, at: new Date().toISOString() }];
  const kept = next.length > MAX_RECORDS ? next.slice(next.length - MAX_RECORDS) : next;
  try { localStorage.setItem(KEY(), JSON.stringify(kept)); } catch (e) { console.warn('[messageRecipients] 수신 고객 기록 실패', e); }
}

/** 이력 id → 수신 고객 id. 기록이 없으면(204 전 이력·다른 PC 발송) undefined */
export function recipientsOf(historyId: string): string[] | undefined {
  return read().find(r => r.historyId === historyId)?.customerIds;
}

/** 고객이 수신한 이력 id 집합 — 타임라인이 이력 전수를 훑기 전에 비었는지 먼저 본다 */
export function historyIdsForCustomer(customerId: string): Set<string> {
  return new Set(read().filter(r => r.customerIds.includes(customerId)).map(r => r.historyId));
}

/** 이력 id → 수신 고객 id 전체 — 발송 이력 화면이 목록 한 번에 쓴다(행마다 localStorage 를 읽지 않게) */
export function recipientIndex(): Map<string, string[]> {
  return new Map(read().map(r => [r.historyId, r.customerIds]));
}
