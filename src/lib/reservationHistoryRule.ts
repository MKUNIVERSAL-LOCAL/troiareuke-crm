// ═══════════════════════════════════════════════════════════════
// reservationHistoryRule — 예약 변경 이력 규칙 (순수 모듈, 247, GAP R-3/R-10 계열)
// ───────────────────────────────────────────────────────────────
// 왜: 예약을 고치면 **고친 사실이 어디에도 남지 않았다**. 코어 Reservation 에는 수정 시각·수정자 칸이 없고
//     (코어 수정은 승인 A) 저장은 덮어쓰기라, "나는 3시로 바꿨는데" "우리는 2시로 받았다" 같은 다툼에
//     매장이 댈 근거가 없다. 상용 CRM(Zenoti·Boulevard)은 예약마다 변경 이력을 남긴다.
// 하는 일: 저장 전/후 예약을 비교해 **사람이 읽을 수 있는 변경 줄**을 만든다. 상태 변경도 같은 형식으로.
// 정직성: 기기 로컬 기록이라 다른 PC 에서 한 수정은 그 PC 에만 남는다 → 화면에 "이 PC 기록" 이라고 적는다.
//          (설정 행에 두면 예약 저장마다 설정 전체가 서버로 올라가 다른 PC 의 설정을 덮는다 — 246 리뷰 H-1)
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export type HistoryKind = 'create' | 'edit' | 'status' | 'delete';

export interface HistoryChange {
  /** 바뀐 항목 이름(화면 문구) */
  label: string;
  from: string;
  to: string;
}

export interface HistoryEntry {
  id: string;
  reservationId: string;
  at: string;            // ISO
  kind: HistoryKind;
  /** 바꾼 사람 — 로그인 사용자 이름(없으면 비움) */
  actor?: string;
  changes: HistoryChange[];
}

/** 비교할 예약의 모양 — 코어 Reservation 의 부분집합(순수 모듈이라 타입을 직접 들고 있다) */
export interface HistorySnapshot {
  date: string;
  startTime: string;
  staffName?: string;
  customerName?: string;
  services?: { serviceName: string }[];
  totalPrice?: number;
  memo?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기', confirmed: '예약확정', completed: '완료', cancelled: '취소', noshow: '노쇼',
};

export function statusLabel(status: string | undefined): string {
  return (status && STATUS_LABEL[status]) || status || '';
}

function serviceText(s: HistorySnapshot): string {
  return (s.services ?? []).map(v => v.serviceName).filter(Boolean).join(', ');
}

function priceText(n: number | undefined): string {
  return typeof n === 'number' ? `${n.toLocaleString('ko-KR')}원` : '';
}

/** 메모는 전문을 이력에 남기지 않는다 — 길고, 개인 사정이 적힐 수 있다. 바뀌었다는 사실만 */
function memoText(s: HistorySnapshot): string {
  return (s.memo ?? '').trim() ? '있음' : '없음';
}

/**
 * 저장 전/후를 비교해 바뀐 항목만 돌려준다. 바뀐 것이 없으면 빈 배열(이력을 남기지 않는다).
 * 시간은 날짜와 함께 읽어야 뜻이 통하므로 "날짜·시간" 한 줄로 묶는다.
 */
export function diffReservation(before: HistorySnapshot, after: HistorySnapshot): HistoryChange[] {
  const out: HistoryChange[] = [];
  const whenBefore = `${before.date} ${before.startTime}`;
  const whenAfter = `${after.date} ${after.startTime}`;
  if (whenBefore !== whenAfter) out.push({ label: '날짜·시간', from: whenBefore, to: whenAfter });
  if ((before.staffName ?? '') !== (after.staffName ?? '')) out.push({ label: '담당 직원', from: before.staffName ?? '', to: after.staffName ?? '' });
  if ((before.customerName ?? '') !== (after.customerName ?? '')) out.push({ label: '고객', from: before.customerName ?? '', to: after.customerName ?? '' });
  if (serviceText(before) !== serviceText(after)) out.push({ label: '시술', from: serviceText(before), to: serviceText(after) });
  if ((before.totalPrice ?? 0) !== (after.totalPrice ?? 0)) out.push({ label: '금액', from: priceText(before.totalPrice), to: priceText(after.totalPrice) });
  if (memoText(before) !== memoText(after)) out.push({ label: '메모', from: memoText(before), to: memoText(after) });
  return out;
}

/** 상태 변경 한 줄 */
export function statusChange(from: string | undefined, to: string): HistoryChange[] {
  if (statusLabel(from) === statusLabel(to)) return [];
  return [{ label: '상태', from: statusLabel(from), to: statusLabel(to) }];
}

/** 화면 한 줄 — "날짜·시간 2026-11-26 14:00 → 2026-11-27 15:00" */
export function describeChange(c: HistoryChange): string {
  if (!c.from) return `${c.label} ${c.to} 로 입력`;
  if (!c.to) return `${c.label} ${c.from} 지움`;
  return `${c.label} ${c.from} → ${c.to}`;
}

/** 이력 한 건의 머리말 — "11-26 14:03 · 김실장" */
export function describeEntryHead(e: HistoryEntry, formatTime: (iso: string) => string): string {
  const who = e.actor ? ` · ${e.actor}` : '';
  const what = e.kind === 'create' ? '등록' : e.kind === 'status' ? '상태 변경' : e.kind === 'delete' ? '삭제' : '수정';
  return `${formatTime(e.at)}${who} · ${what}`;
}

const MAX_HISTORY_ENTRIES = 1000;   // 기기 전체
export const MAX_PER_RESERVATION = 20;     // 한 예약당

function isEntry(e: unknown): e is HistoryEntry {
  if (!e || typeof e !== 'object') return false;
  const r = e as HistoryEntry;
  return typeof r.reservationId === 'string' && r.reservationId.length > 0
    && typeof r.at === 'string' && r.at.length > 0
    && Array.isArray(r.changes);
}

export function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryEntry[] = [];
  for (const raw of value) {
    if (!isEntry(raw)) continue;
    const changes = raw.changes
      .filter(c => c && typeof c.label === 'string')
      .map(c => ({ label: String(c.label).slice(0, 20), from: String(c.from ?? '').slice(0, 60), to: String(c.to ?? '').slice(0, 60) }));
    if (changes.length === 0 && raw.kind !== 'create' && raw.kind !== 'delete') continue; // 바뀐 것이 없는 기록은 보여 줄 것이 없다
    out.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : `${raw.reservationId}-${raw.at}`,
      reservationId: raw.reservationId,
      at: raw.at,
      kind: raw.kind === 'create' || raw.kind === 'status' || raw.kind === 'delete' ? raw.kind : 'edit',
      ...(raw.actor ? { actor: String(raw.actor).slice(0, 20) } : {}),
      changes,
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * 저장소를 지킨다: 한 예약당 최근 MAX_PER_RESERVATION 건, 전체 MAX_HISTORY_ENTRIES 건, keepFrom 이전은 버린다.
 * 오래된 것부터 버리고 최근 것을 남긴다(다툼은 보통 최근 일로 생긴다).
 */
export function trimHistory(entries: HistoryEntry[], keepFrom: string, max = MAX_HISTORY_ENTRIES): HistoryEntry[] {
  const fresh = entries.filter(e => e.at.slice(0, 10) >= keepFrom);
  const perCount = new Map<string, number>();
  const kept: HistoryEntry[] = [];
  // 뒤(최근)에서부터 세어 예약당 상한을 적용
  for (let idx = fresh.length - 1; idx >= 0; idx -= 1) {
    const e = fresh[idx];
    const n = (perCount.get(e.reservationId) ?? 0) + 1;
    if (n > MAX_PER_RESERVATION) continue;
    perCount.set(e.reservationId, n);
    kept.push(e);
  }
  kept.reverse();
  return kept.length > max ? kept.slice(kept.length - max) : kept;
}

/** 그 예약의 이력 — 최근 것이 위로 */
export function historyFor(entries: HistoryEntry[], reservationId: string): HistoryEntry[] {
  return entries.filter(e => e.reservationId === reservationId).sort((a, b) => b.at.localeCompare(a.at));
}

export const HISTORY_CAVEAT = '이 PC 에서 한 변경만 남습니다(다른 PC·폰에서 한 변경은 그 기기에 남습니다). 최근 1000건·예약당 20건·180일까지 보관합니다.';

/** 이력이 하나도 없을 때도 그 사실을 말한다 — 전에는 섹션과 함께 경고까지 사라져 "한 번도 안 바뀌었다" 로 읽혔다 (250 리뷰 H-3) */
export const HISTORY_EMPTY = '이 PC 에 남은 변경 기록이 없습니다 — 다른 PC·폰에서 등록·변경한 내용은 그 기기에 남습니다.';
