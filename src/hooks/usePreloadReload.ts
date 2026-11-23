import { useEffect } from 'react';

/**
 * 웹(PWA) 재배포 뒤 열려 있던 탭이 옛 해시의 지연 청크(xlsx·차트·PDF)를 못 받을 때 — 한 번만 새로고침해 새 번들로.
 * 두 번째부터는 기본 동작(오류 throw)을 막지 않아 호출처(loadXlsx의 한국어 메시지·ErrorBoundary)가 실제 오류를 받는다
 * (preventDefault를 무조건 하면 import()가 undefined로 resolve돼 엉뚱한 TypeError가 난다 — 리뷰 2026-11-18).
 * 패키지 빌드(Electron·앱)는 로컬 파일이라 보통 발생하지 않는다(발생해도 1회 새로고침 뒤 오류 전달). 지점·어드민 레이아웃 양쪽에서 호출.
 */
const FLAG = 'crm_preload_reloaded'; // 마지막 자동 새로고침 시각 — 10분 안에는 다시 새로고침하지 않고 실제 오류를 전달
const WINDOW_MS = 10 * 60_000;

export function usePreloadReload(): void {
  useEffect(() => {
    const onPreloadError = (e: Event) => {
      const at = Number(sessionStorage.getItem(FLAG) || 0);
      if (Date.now() - at < WINDOW_MS) return;
      e.preventDefault();
      sessionStorage.setItem(FLAG, String(Date.now()));
      window.location.reload();
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => window.removeEventListener('vite:preloadError', onPreloadError);
  }, []);
}
