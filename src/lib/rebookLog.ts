// rebookLog — 체크아웃 재예약 안내의 결과 기록 (비코어, 243 / 246 리뷰 H-1 반영)
//
// 저장 위치: **이 기기 localStorage** `crm_<shop>_rebook_log` (stockLedger·messageRecipients 와 같은 방식).
//   처음에는 설정 행(preferences)에 뒀지만, 설정 행 저장은 코어가 preferences **묶음 전체를 PUT upsert** 한다.
//   결제마다 그 쓰기가 일어나면 다른 PC 가 방금 바꾼 월 마감·매출 목표·수당 요율·태그 목록이
//   옛 스냅샷으로 덮여 조용히 사라질 수 있었다(실측 지표 payload 70KB, 오프라인 outbox 누적 5.7MB).
//   지표 한 줄 때문에 운영 설정을 잃을 수는 없다 → 기기 로컬로 내리고 화면에 "이 PC 기록" 이라고 적는다.
//   지점 공용 집계는 서버 컬렉션 승인(B-2/S-7) 뒤에 같은 행 형식을 올리는 어댑터로 처리한다(승인 큐 23).
// 규칙·집계는 rebookStatsRule.ts(순수). 여기서는 저장과 예약 조회만 한다.
import { ReservationStore, getShopId, safeSetItem } from './store';
import { todayISO } from './format';
import {
  sanitizeRebookLog, trimRebookLog, entriesInMonth, summarizeRebook, rebookKey,
  type RebookLogEntry, type RebookSummary,
} from './rebookStatsRule';

/** 기록 보관 기간(일) */
const KEEP_DAYS = 180;

const KEY = () => `crm_${getShopId()}_rebook_log`;

interface Stored { entries: RebookLogEntry[]; droppedMonths: string[] }

function keepFrom(): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() - KEEP_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return { entries: [], droppedMonths: [] };
    const parsed = JSON.parse(raw);
    const entries = sanitizeRebookLog(Array.isArray(parsed) ? parsed : parsed?.entries);
    const droppedMonths = Array.isArray(parsed?.droppedMonths) ? parsed.droppedMonths.filter((m: unknown) => typeof m === 'string') : [];
    return { entries, droppedMonths };
  } catch {
    return { entries: [], droppedMonths: [] };
  }
}

// 315: `getRebookLog` 를 지웠다 — 243 이 지표를 만들 때 두었다가 집계를 `rebookStats` 로 옮기며
// 호출자가 0이 됐다(CLAUDE.md 2절: 미사용 export 금지). 필요하면 `read().entries` 한 줄이면 된다.

function save(entries: RebookLogEntry[], droppedMonths: string[]): void {
  const trimmed = trimRebookLog(entries, keepFrom());
  const next: Stored = { entries: trimmed.entries, droppedMonths: [...new Set([...droppedMonths, ...trimmed.droppedMonths])].sort() };
  safeSetItem(KEY(), JSON.stringify(next));
}

/**
 * 추천이 화면에 떴다 — 기록하고 id 를 돌려준다.
 * 같은 고객·같은 추천일 기록이 이미 있으면 **새로 만들지 않고 그 id 를 돌려준다**
 * (시술·제품 결제를 따로 등록하면 같은 방문에 안내가 두 번 뜬다 — 246 리뷰 M-1).
 * 저장이 실패해도 안내 자체는 떠야 하므로 예외를 삼키고 null 을 돌려준다.
 */
export function logRebookShown(entry: { customerId: string; suggestedDate: string; basis?: string }): string | null {
  try {
    const { entries, droppedMonths } = read();
    const key = rebookKey(entry);
    const existing = entries.find(e => rebookKey(e) === key);
    if (existing) return existing.id;
    const shownAt = new Date().toISOString();
    const id = `${entry.customerId}-${shownAt}`;
    save([...entries, {
      id,
      customerId: entry.customerId,
      suggestedDate: entry.suggestedDate,
      ...(entry.basis ? { basis: entry.basis } : {}),
      shownAt,
      day: todayISO(), // 매장 기준 날짜 — ISO 는 UTC 라 자정 전후로 달이 어긋난다
    }], droppedMonths);
    return id;
  } catch {
    return null;
  }
}

/** [예약 잡기] 를 눌렀다 */
export function logRebookClicked(id: string | null): void {
  if (!id) return;
  try {
    const { entries, droppedMonths } = read();
    const hit = entries.find(e => e.id === id);
    if (!hit || hit.clickedAt) return;
    save(entries.map(e => (e.id === id ? { ...e, clickedAt: new Date().toISOString() } : e)), droppedMonths);
  } catch {
    /* 지표 기록 실패가 예약 화면 이동을 막지 않는다 */
  }
}

/** 이달(또는 지정한 달, YYYY-MM) 재예약 안내 성과 + 그 달 기록이 보관 한도로 잘렸는지 */
export function rebookStatsFor(yearMonth: string): { summary: RebookSummary; truncated: boolean } {
  const { entries, droppedMonths } = read();
  const inMonth = entriesInMonth(entries, yearMonth);
  const truncated = droppedMonths.includes(yearMonth);
  if (inMonth.length === 0) return { summary: summarizeRebook([], []), truncated };
  const ids = new Set(inMonth.map(e => e.customerId));
  const reservations = ReservationStore.getAll()
    .filter(r => ids.has(r.customerId))
    .map(r => ({ customerId: r.customerId, date: r.date, status: r.status }));
  return { summary: summarizeRebook(inMonth, reservations), truncated };
}
