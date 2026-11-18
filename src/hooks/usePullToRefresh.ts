import { useEffect, useRef, useState } from 'react';

/**
 * 당겨서 새로고침 (모바일, UI 품질 기준 2026-11-18)
 * 페이지 맨 위(scrollY 0)에서 한 손가락으로 아래로 70px 이상 끌었다 놓으면 onRefresh를 부른다.
 * 모달이 열려 있거나(aria-modal), 호출 쪽이 enabled=false(예: 고객 상세 풀스크린)면 무시. 터치 취소(전화 수신 등)는 새로고침하지 않는다.
 * 터치 이벤트에만 반응하므로 PC(마우스)는 영향 없음. 표시는 PullToRefreshIndicator가 맡는다.
 * 핸들러는 ref로 최신 값을 읽고 리스너는 마운트 때 1회만 단다(매 touchmove마다 리스너를 갈아끼우지 않게, 리뷰 2026-11-18).
 */
const THRESHOLD = 70;
const MIN_SPIN_MS = 450;

export function usePullToRefresh(onRefresh: () => void | Promise<void>, opts?: { enabled?: boolean }): { refreshing: boolean; pullDistance: number } {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef<number | null>(null);
  const dist = useRef(0);
  const busy = useRef(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const enabled = useRef(opts?.enabled ?? true);
  enabled.current = opts?.enabled ?? true;

  useEffect(() => {
    const reset = () => { startY.current = null; dist.current = 0; setPullDistance(0); };
    const onStart = (e: TouchEvent) => {
      if (!enabled.current || e.touches.length !== 1 || window.scrollY > 0 || busy.current || document.querySelector('[aria-modal="true"]')) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      if (e.touches.length !== 1 || window.scrollY > 0) { reset(); return; }
      const dy = e.touches[0].clientY - startY.current;
      dist.current = dy > 0 ? Math.min(dy, THRESHOLD * 1.6) : 0;
      setPullDistance(dist.current);
    };
    const onEnd = async () => {
      if (startY.current === null) return;
      const dy = dist.current;
      reset();
      if (dy < THRESHOLD) return;
      busy.current = true;
      setRefreshing(true);
      const started = Date.now();
      try { await cb.current(); } finally {
        const wait = MIN_SPIN_MS - (Date.now() - started);
        window.setTimeout(() => { busy.current = false; setRefreshing(false); }, wait > 0 ? wait : 0);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, []);

  return { refreshing, pullDistance };
}
