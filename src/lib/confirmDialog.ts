// ═══════════════════════════════════════════════════════════════
// confirmDialog — 앱 디자인의 확인창을 어디서든 Promise 로 띄운다 (비코어, 9차 점검 #30 2026-11-23)
// ───────────────────────────────────────────────────────────────
// 파괴적 동작(익명화·병합·삭제·결제 요청 취소)의 확인이 window.confirm 이라 앱의 다른 창과 디자인이 달랐고,
// 폰(WebView)에서는 네이티브 창이 떠 고객명·건수를 강조할 수 없었다. 호스트(<ConfirmHost/>, Layout)가 없으면 window.confirm 으로 폴백.
// ═══════════════════════════════════════════════════════════════

export interface ConfirmOptions {
  title: string;
  message: string;            // 줄바꿈은 \n
  confirmLabel?: string;      // 기본 '확인'
  cancelLabel?: string;       // 기본 '취소'
  danger?: boolean;           // 되돌릴 수 없는 동작 — 빨간 확인 버튼
}

export interface PendingConfirm extends ConfirmOptions { id: number; resolve: (ok: boolean) => void }

type Listener = (pending: PendingConfirm | null) => void;
let listener: Listener | null = null;
let current: PendingConfirm | null = null;
let seq = 0;

/** 호스트 컴포넌트가 마운트될 때 등록 — 한 번에 하나 */
export function registerConfirmHost(fn: Listener): () => void {
  listener = fn;
  fn(current);
  return () => { if (listener === fn) listener = null; };
}

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (!listener) return Promise.resolve(window.confirm(`${opts.title}\n${opts.message}`)); // 호스트 없는 화면(테스트·예외) — 예전 동작
  if (current) current.resolve(false); // 겹치면 앞 창은 취소로
  return new Promise<boolean>(resolve => {
    current = { ...opts, id: ++seq, resolve: ok => { current = null; listener?.(null); resolve(ok); } };
    listener?.(current);
  });
}
