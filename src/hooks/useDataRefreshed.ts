import { useEffect, useRef } from 'react';
import { DATA_REFRESHED_EVENT } from '../lib/liveRefresh';

/** 서버 재조회(liveRefresh) 뒤 목록을 다시 읽는다 — 콜백은 최신 것을 쓰고 리스너는 1회만 등록 (16차 #H3) */
export function useDataRefreshed(onRefreshed: () => void): void {
  const ref = useRef(onRefreshed);
  ref.current = onRefreshed;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(DATA_REFRESHED_EVENT, handler);
    return () => window.removeEventListener(DATA_REFRESHED_EVENT, handler);
  }, []);
}
