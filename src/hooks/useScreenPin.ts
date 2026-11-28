// 화면 PIN 상태 훅 (비코어, 224 — 218 리뷰 H-3)
// 매출 화면을 PIN 으로 잠근 매장에서 대시보드 금액 카드가 그대로 보이면 게이트를 우회하는 길이 된다.
// 금액을 그리는 쪽이 이 훅으로 "그 화면이 지금 잠겨 있는지" 를 보고 함께 가린다. PIN 을 통과하면 바로 다시 보인다.
import { useEffect, useState } from 'react';
import { screenNeedsPin, APP_LOCK_CHANGED_EVENT } from '../lib/appLock';

/** 그 경로가 지금 PIN 을 물어야 하는 상태인가 — PIN 통과·설정 변경·본사 초기화에 따라 다시 계산된다 */
export function useScreenPinLocked(pathname: string): boolean {
  const [locked, setLocked] = useState(() => screenNeedsPin(pathname) !== null);
  useEffect(() => {
    const recompute = () => setLocked(screenNeedsPin(pathname) !== null);
    recompute();
    window.addEventListener(APP_LOCK_CHANGED_EVENT, recompute);
    return () => window.removeEventListener(APP_LOCK_CHANGED_EVENT, recompute);
  }, [pathname]);
  return locked;
}
