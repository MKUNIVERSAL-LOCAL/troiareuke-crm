// programNotes — 회차권 notes 에 "[날짜] …" 기록 줄을 남기는 공용 헬퍼 (비코어, 146)
// 관리 창(ProgramManageModal)·시술 기록 삭제/수정이 같은 형식으로 남겨야 programLedgerRule 이 이력으로 읽는다. notes 는 코어 필드라 서버 동기된다.
import { CustomerProgramStore } from './store';
import { todayISO } from './format';

export function programNoteLine(text: string, reason?: string, date = todayISO()): string {
  return `[${date}] ${text}${reason && reason.trim() ? ` — ${reason.trim()}` : ''}`;
}

/** 회차권에 기록 줄을 덧붙인다(없는 회차권이면 false) */
export function appendProgramNote(customerProgramId: string, text: string, reason?: string): boolean {
  const cp = CustomerProgramStore.getById(customerProgramId);
  if (!cp) return false;
  const line = programNoteLine(text, reason);
  return CustomerProgramStore.update(customerProgramId, { notes: cp.notes ? `${cp.notes}\n${line}` : line }) !== null;
}
