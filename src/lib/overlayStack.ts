// ═══════════════════════════════════════════════════════════════
// overlayStack — 열린 오버레이(모달·시트·라이트박스·카메라) 스택 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// Esc(PC)와 Android 하드웨어 뒤로가기(모바일 앱)가 "가장 위에 뜬 것 하나"만 닫게 한다.
// 전에는 ui/Modal만 Esc 스택을 갖고 카메라·라이트박스는 capture+stopPropagation으로 끼어들었고,
// 뒤로가기는 오버레이를 무시하고 라우터 back을 해 화면이 통째로 바뀌었다.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, type RefObject } from 'react';

interface Entry { close: () => void; escape: boolean }
const stack: Entry[] = [];

let escListenerInstalled = false;
function ensureEscListener() {
  if (escListenerInstalled || typeof window === 'undefined') return;
  escListenerInstalled = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.isComposing) return; // IME 조합 중 Esc는 입력 취소
    if (appLocked) return; // 잠금 PIN 입력(body 포털)에서 누른 Esc가 뒤의 모달을 닫지 않게
    const top = stack[stack.length - 1];
    if (top?.escape) top.close();
  });
}

/** 가장 위 오버레이를 닫는다. 닫은 게 있으면 true (뒤로가기 처리용) */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

// 앱 잠금 중에는 뒤로가기로 잠금 뒤 화면을 바꾸지 못하게 — AppLockOverlay가 갱신
let appLocked = false;
export function setAppLocked(v: boolean): void { appLocked = v; }
export function isAppLocked(): boolean { return appLocked; }

/**
 * 오버레이가 열려 있는 동안 스택에 올린다.
 * @param escape false면 Esc로는 닫지 않고 뒤로가기만 받는다 (입력이 많은 폼 모달·모바일 고객 상세)
 */
export function useOverlayClose(isOpen: boolean, onClose: () => void, opts?: { escape?: boolean }): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // 부모가 인라인 람다를 넘겨도 리스너를 다시 달지 않게
  const escape = opts?.escape ?? true;
  useEffect(() => {
    if (!isOpen) return;
    const entry: Entry = { close: () => closeRef.current(), escape };
    stack.push(entry);
    ensureEscListener();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [isOpen, escape]);
}

// ── 포커스 트랩 (PC 키보드 흐름, 2026-11-18) ──
// 열리면 첫 입력란(터치 기기는 카드 자체 — 키보드가 튀어오르지 않게)에 포커스, Tab/Shift+Tab은 카드 안에서 순환,
// 닫히면 열었던 요소로 되돌린다. 중첩 모달은 각자 자기 카드에서만 듣고 전파를 멈춰 바깥 트랩과 겹치지 않는다.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FIRST_FIELD = 'input:not([disabled]):not([type="hidden"]):not([readonly]),select:not([disabled]),textarea:not([disabled])';
export function useFocusTrap(isOpen: boolean, ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    if (!isOpen) return;
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
    const explicit = root.querySelector<HTMLElement>('[data-autofocus],[autofocus]');
    const target = explicit ?? (touch ? null : root.querySelector<HTMLElement>(FIRST_FIELD)) ?? (touch ? root : items()[0]) ?? root;
    if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
    const t = window.setTimeout(() => target.focus({ preventScroll: true }), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || active === root)) { e.preventDefault(); first.focus(); }
      e.stopPropagation();
    };
    root.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      root.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
    };
  }, [isOpen, ref]);
}
