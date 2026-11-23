// 뷰포트 미디어쿼리 구독 훅 (비코어)
// Tailwind의 lg(1024px) 분기와 같은 기준으로 "모바일 레이아웃인지"를 알려준다.
// CSS로 숨기는 것만으로는 숨겨진 패널의 컴포넌트가 그대로 마운트되어(NAS 동기화 2회·사진 디코딩 2회)
// 비용이 두 배가 되므로, 활성 레이아웃에서만 무거운 컴포넌트를 렌더하기 위해 쓴다.
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** lg(1024px) 미만 = 모바일 레이아웃 (Layout의 하단 탭바·모바일 패널 기준과 동일) */
export function useIsMobileLayout(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
