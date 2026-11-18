import { useEffect } from 'react';

/**
 * 웹(PWA) 재배포 뒤 열려 있던 탭이 옛 해시의 지연 청크(xlsx·차트·PDF)를 못 받을 때 — 한 번만 새로고침해 새 번들로.
 * 두 번째부터는 기본 동작(오류 throw)을 막지 않아 호출처(loadXlsx의 한국어 메시지·ErrorBoundary)가 실제 오류를 받는다
 * (preventDefault를 무조건 하면 import()가 undefined로 resolve돼 엉뚱한 TypeError가 난다 — 리뷰 2026-11-18).
 * 패키지 빌드(Electron·앱)는 로컬 파일이라 해당 없음. 지점·어드민 레이아웃 양쪽에서 호출.
 */
const FLAG = 'crm_preload_reloaded';

export function usePreloadReload(): void {
  useEffect(() => {
    const onPreloadError = (e: Event) => {
      if (sessionStorage.getItem(FLAG)) return;
      e.preventDefault();
      sessionStorage.setItem(FLAG, '1');
      window.location.reload();
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => window.removeEventListener('vite:preloadError', onPreloadError);
  }, []);
}
