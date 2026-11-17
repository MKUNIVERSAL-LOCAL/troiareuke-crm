// ═══════════════════════════════════════════════════════════════
// overlayStack — 열린 오버레이(모달·시트·라이트박스·카메라) 스택 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// Esc(PC)와 Android 하드웨어 뒤로가기(모바일 앱)가 "가장 위에 뜬 것 하나"만 닫게 한다.
// 전에는 ui/Modal만 Esc 스택을 갖고 카메라·라이트박스는 capture+stopPropagation으로 끼어들었고,
// 뒤로가기는 오버레이를 무시하고 라우터 back을 해 화면이 통째로 바뀌었다.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';

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
