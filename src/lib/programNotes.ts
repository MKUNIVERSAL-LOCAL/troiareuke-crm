// programNotes — 회차권 notes 에 "[날짜] …" 기록 줄을 남기는 공용 헬퍼 (비코어, 146)
// 관리 창(ProgramManageModal)·시술 기록 삭제/수정이 같은 형식으로 남겨야 programLedgerRule 이 이력으로 읽는다. notes 는 코어 필드라 서버 동기된다.
// 한계: notes 전체를 다시 쓰므로(코어 update) 두 기기가 같은 회차권을 거의 동시에 바꾸면 한쪽 줄이 유실될 수 있다(마지막 저장 승) — 근본 해결은 서버 delta(승인 A-15a).
// 그때 회차 이력은 "불일치"로 보이며 문구가 다른 기기 동시 수정 가능성을 안내한다 (149 리뷰 M-3).
import { CustomerProgramStore } from './store';
import { todayISO } from './format';

export { totalChangeLine } from './programNoteFormat'; // 형식은 순수 모듈에 — 원장 규칙(lib-units 스펙)이 store 를 끌어오지 않게 (커밋 체인 가드)

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
