// programNoteFormat — 회차권 notes 기록 줄의 형식 (순수, store 미참조 — lib-units 스펙이 programLedgerRule 을 통해 읽는다). 149 리뷰 M-4
// 쓰는 쪽(programNotes·관리 창)과 읽는 쪽(programLedgerRule)이 같은 형식을 쓴다.
export const TOTAL_CHANGE_RE = /총 회차 (\d+)회 → (\d+)회/;

export function totalChangeLine(from: number, to: number): string {
  return `총 회차 ${from}회 → ${to}회`;
}
