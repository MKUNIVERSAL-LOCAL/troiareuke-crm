/**
 * 이중 제출 잠금 (순수, 221 — GAP P-4) — 저장 버튼을 빠르게 두 번 누르면 같은 결제가 두 건 저장돼 매출이 부푼다.
 * 서버 멱등키는 B-2 뒤(승인)라, 그 전까지 클라이언트에서 "한 번만 통과" 를 보장한다.
 * 쓰는 쪽: 저장 시작 전 `acquire()` 가 false 면 그대로 돌아가고, 폼이 닫힐 때(또는 저장 실패로 다시 쓸 수 있게 될 때) `release()`.
 * 플래그를 즉시 풀지 않는 이유: 같은 폼에서 두 번째 클릭이 다음 이벤트 루프에 들어와도 막아야 한다.
 */
export interface SubmitLock {
  /** 통과하면 true(잠긴다), 이미 잠겼으면 false */
  acquire(): boolean;
  release(): void;
  readonly locked: boolean;
}

export function createSubmitLock(): SubmitLock {
  let locked = false;
  return {
    acquire() { if (locked) return false; locked = true; return true; },
    release() { locked = false; },
    get locked() { return locked; },
  };
}
