// ═══════════════════════════════════════════════════════════════
// confirmDialog — 앱 디자인의 확인창을 어디서든 Promise 로 띄운다 (비코어, 9차 점검 #30 2026-11-23)
// ───────────────────────────────────────────────────────────────
// 파괴적 동작(익명화·병합·삭제·결제 요청 취소)의 확인이 window.confirm 이라 앱의 다른 창과 디자인이 달랐고,
// 폰(WebView)에서는 네이티브 창이 떠 고객명·건수를 강조할 수 없었다. 호스트(<ConfirmHost/>, Layout)가 없으면 window.confirm 으로 폴백.
// ═══════════════════════════════════════════════════════════════

/** 확인창에서 함께 고를 수 있는 보기(취소 사유 등) — 선택 사항이고, 고르지 않아도 확인은 된다 (244) */
export interface ConfirmChoice { id: string; label: string }

export interface ConfirmOptions {
  title: string;
  message: string;            // 줄바꿈은 \n
  confirmLabel?: string;      // 기본 '확인'
  cancelLabel?: string;       // 기본 '취소'
  danger?: boolean;           // 되돌릴 수 없는 동작 — 빨간 확인 버튼
  /** 보기 목록 — 주면 본문 아래에 칩으로 그리고, 고른 값이 결과의 choice 로 온다 (244) */
  choices?: ConfirmChoice[];
  /** 보기 묶음 제목 — 기본 '사유 (선택)' */
  choiceTitle?: string;
  /** 직접 입력 칸을 함께 보여 줄지 (기본 true, choices 가 있을 때만) */
  allowOtherText?: boolean;
  /** 창을 닫은 뒤 포커스를 돌려줄 요소 — 메뉴 항목에서 연 경우 메뉴가 먼저 사라져 열었던 버튼이 DOM 에 없으므로 ⋯ 버튼 같은 남는 요소를 넘긴다 (15차 #M2) */
  returnFocusTo?: HTMLElement | null;
}

/** 확인 결과 — choice 는 고른 보기 id 또는 직접 입력한 말, 고르지 않았으면 null */
export interface ConfirmResult { ok: boolean; choice: string | null }

export interface PendingConfirm extends ConfirmOptions { id: number; resolve: (r: ConfirmResult) => void }

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
  return askConfirmWithChoice(opts).then(r => r.ok);
}

/** 확인 + 사유 선택 — 사유를 고르지 않아도 확인은 진행된다(선택 입력) (244) */
export function askConfirmWithChoice(opts: ConfirmOptions): Promise<ConfirmResult> {
  if (!listener) return Promise.resolve({ ok: window.confirm(`${opts.title}\n${opts.message}`), choice: null }); // 호스트 없는 화면(테스트·예외) — 예전 동작
  if (current) current.resolve({ ok: false, choice: null }); // 겹치면 앞 창은 취소로
  return new Promise<ConfirmResult>(resolve => {
    current = {
      ...opts, id: ++seq,
      resolve: result => {
        current = null; listener?.(null); resolve(result);
        const back = opts.returnFocusTo;
        if (back) window.setTimeout(() => { if (document.contains(back)) back.focus({ preventScroll: true }); }, 0); // 포커스 트랩의 opener(body) 복귀 뒤에 덮어쓴다
      },
    };
    listener?.(current);
  });
}
