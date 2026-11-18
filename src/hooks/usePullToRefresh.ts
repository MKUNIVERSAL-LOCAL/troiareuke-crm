import { useEffect, useRef, useState } from 'react';

/**
 * 당겨서 새로고침 (모바일, UI 품질 기준 2026-11-18)
 * 페이지 맨 위(scrollY 0)에서 아래로 70px 이상 끌었다 놓으면 onRefresh를 부른다. 모달이 열려 있거나 스크롤 중이면 무시.
 * 터치 이벤트에만 반응하므로 PC(마우스)는 영향 없음. 표시는 PullToRefreshIndicator가 맡는다.
 */
const THRESHOLD = 70;
const MIN_SPIN_MS = 450;

export function usePullToRefresh(onRefresh: () => void | Promise<void>): { refreshing: boolean; pullDistance: number } {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef<number | null>(null);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing || document.querySelector('[aria-modal="true"]')) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      if (window.scrollY > 0) { startY.current = null; setPullDistance(0); return; }
      const dy = e.touches[0].clientY - startY.current;
      setPullDistance(dy > 0 ? Math.min(dy, THRESHOLD * 1.6) : 0);
    };
    const onEnd = async () => {
      if (startY.current === null) return;
      const dy = pullDistance;
      startY.current = null;
      setPullDistance(0);
      if (dy < THRESHOLD) return;
      setRefreshing(true);
      const started = Date.now();
      try { await cb.current(); } finally {
        const wait = MIN_SPIN_MS - (Date.now() - started);
        window.setTimeout(() => setRefreshing(false), wait > 0 ? wait : 0);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [pullDistance, refreshing]);

  return { refreshing, pullDistance };
}
