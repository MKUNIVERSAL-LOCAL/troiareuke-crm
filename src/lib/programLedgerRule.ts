/**
 * programLedgerRule — 회차권 원장(이력) 파생 규칙 (순수 모듈). 146, GAP P-1.
 * 별도 저장소를 두지 않는다 — 시술 기록(treatment_logs, 서버 동기)이 차감의 정본이고, 관리 창·시술 기록 삭제/수정이 남기는
 * notes 의 "[YYYY-MM-DD] …" 줄이 보정·연장·완료·복원의 기록이다. 둘을 날짜순으로 합쳐 행마다 잔여를 계산한다.
 *  - 등록(총 회차) → 시술(−n) → 총 회차 보정(±k) 이 잔여를 바꾼다. 만료일·완료·되돌림·복원 줄은 잔여를 바꾸지 않는다
 *    (복원은 그 시술 기록 자체가 사라져 use 행이 빠지므로, 다시 더하면 이중 계산).
 *  - 원장 끝 잔여 = 총 회차(보정 반영) − 기록 합 = programSessionsRule 의 파생 잔여와 같아야 한다(다르면 drift).
 */
import { TOTAL_CHANGE_RE } from './programNoteFormat'; // programNotes 는 store 를 import 한다 — 순수 규칙은 형식 모듈만 (커밋 체인 가드)

export type ProgramLedgerKind = 'purchase' | 'use' | 'restore' | 'total' | 'expiry' | 'complete' | 'reopen' | 'note';

export interface ProgramLedgerRow {
  id: string;
  date: string;               // YYYY-MM-DD
  sort: string;               // 정렬 키(date + time/createdAt)
  kind: ProgramLedgerKind;
  delta: number | null;       // 잔여 변화(회차제만), 정보성 행은 null
  remaining: number | null;   // 이 행 뒤 잔여(회차제만)
  text: string;
  refId?: string;
}

export interface LedgerProgram {
  id: string;
  programName: string;
  totalSessions: number | null;
  pricePaid: number;
  purchaseDate: string;
  notes?: string;
}
export interface LedgerLog {
  id: string;
  treatmentDate: string;
  treatmentTime?: string;
  createdAt: string;
  sessionsUsed: number;
  staffName?: string;
  treatmentDetails?: string;
}

export const PROGRAM_LEDGER_LABEL: Record<ProgramLedgerKind, string> = {
  purchase: '등록', use: '시술', restore: '복원', total: '회차 보정', expiry: '만료일', complete: '완료', reopen: '진행중', note: '기록',
};

const NOTE_LINE = /^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/;

/** notes 한 줄 → 행(종류·delta). 총 회차 A회 → B회 는 delta B−A */
export function parseNoteLine(line: string, idx: number): ProgramLedgerRow | null {
  const m = NOTE_LINE.exec(line.trim());
  if (!m) return null;
  const [, date, text] = m;
  const body = text.split(' — ')[0]; // " — 사유" 뒤의 자유 텍스트는 종류 판정에 쓰지 않는다 (149 리뷰 M-4)
  const total = TOTAL_CHANGE_RE.exec(body);
  let kind: ProgramLedgerKind = 'note';
  let delta: number | null = null;
  if (total) { kind = 'total'; delta = Number(total[2]) - Number(total[1]); }
  else if (/복원/.test(body)) kind = 'restore';
  else if (/만료일/.test(body)) kind = 'expiry';
  else if (/완료 → 진행중/.test(body)) kind = 'reopen';
  else if (/완료 처리|진행중 → 완료/.test(body)) kind = 'complete';
  return { id: `note-${idx}`, date, sort: `${date}T99:${String(idx).padStart(4, '0')}`, kind, delta, remaining: null, text };
}

export function buildProgramLedger(cp: LedgerProgram, logs: LedgerLog[], formatPrice: (n: number) => string): ProgramLedgerRow[] {
  const sessionBased = cp.totalSessions !== null;
  const rows: ProgramLedgerRow[] = [];
  rows.push({
    id: 'purchase', date: cp.purchaseDate, sort: `${cp.purchaseDate}T00:00:00`, kind: 'purchase',
    delta: sessionBased ? cp.totalSessions : null, remaining: null,
    text: `${cp.programName} 등록${sessionBased ? ` · 총 ${cp.totalSessions}회` : ' · 기간제'} · ${formatPrice(cp.pricePaid)}`,
  });
  for (const t of logs) {
    const n = Math.max(0, Number(t.sessionsUsed) || 0);
    rows.push({
      id: `use-${t.id}`, date: t.treatmentDate, sort: `${t.treatmentDate}T${t.treatmentTime || '12:00'}:${t.createdAt}`, kind: 'use',
      delta: sessionBased ? -n : null, remaining: null, refId: t.id,
      text: [`${n}회 차감`, t.staffName, t.treatmentDetails].filter(Boolean).join(' · '),
    });
  }
  (cp.notes || '').split('\n').forEach((line, i) => { const r = parseNoteLine(line, i); if (r) rows.push(r); });
  rows.sort((a, b) => a.sort.localeCompare(b.sort));
  // 총 회차 보정은 "등록 시 총 회차"에 이미 반영된 최종값이므로, 등록 행은 보정 전 값에서 출발해야 한다 — 보정 delta 합을 되돌려 시작값을 구한다
  if (sessionBased) {
    const adjust = rows.filter(r => r.kind === 'total').reduce((s, r) => s + (r.delta || 0), 0);
    let remaining = (cp.totalSessions as number) - adjust;
    for (const r of rows) {
      if (r.kind === 'purchase') { r.delta = remaining; r.remaining = remaining; r.text = r.text.replace(`총 ${cp.totalSessions}회`, `총 ${remaining}회`); continue; }
      if (r.delta !== null) remaining += r.delta;
      r.remaining = Math.max(0, remaining);
    }
  }
  return rows;
}

/** 원장 끝 잔여(회차제) — 파생 잔여(remainingSessions)와 같아야 한다 */
export function ledgerRemaining(rows: ProgramLedgerRow[]): number | null {
  const last = [...rows].reverse().find(r => r.remaining !== null);
  return last ? last.remaining : null;
}
