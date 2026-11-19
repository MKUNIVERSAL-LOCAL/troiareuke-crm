import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import UpdateBanner from '../ui/UpdateBanner';
import MobileUpdateBanner from '../ui/MobileUpdateBanner';
import ToastHost from '../ui/ToastHost';
import AnnouncementBanner from '../ui/AnnouncementBanner';
import OfflineBanner from '../ui/OfflineBanner';
import AppLockOverlay from '../AppLockOverlay';
import FeatureRouteGate from '../FeatureGate';
import ErrorBoundary from '../ui/ErrorBoundary';
import { usePreloadReload } from '../../hooks/usePreloadReload';
import { useOverlayClose } from '../../lib/overlayStack';
import { useAuth } from '../../contexts/AuthContext';
import { useCrmBrand } from '../../hooks/useCrmBrand';
import { BLOCK_STAFF_UI } from '../../lib/buildTarget';
import { refreshFeatureFlags } from '../../lib/featureFlags';
import { clearLocalPhotoCacheForLogout } from '../../lib/photoStore';
import { notify } from '../../lib/notify';

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useOverlayClose(sidebarOpen, () => setSidebarOpen(false)); // 모바일 서랍 메뉴 — Android 뒤로가기·Esc로 닫기
  const { user, logout } = useAuth();
  const { programName } = useCrmBrand(user?.shopName);

  useEffect(() => {
    document.title = programName;
  }, [programName]);

  // 어드민 원격 기능 플래그 동기화 — 실패해도 캐시/기본값으로 동작
  useEffect(() => {
    refreshFeatureFlags();
  }, []);

  // 처리되지 않은 Promise 거부 — 콘솔에만 남고 화면은 멀쩡해 보이는 "조용한 실패"를 막는다 (실패 경로 감사 2026-11-18). 10초에 한 번만 알림
  useEffect(() => {
    let last = 0;
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error('[app] 처리되지 않은 오류:', e.reason);
      const now = Date.now();
      if (now - last < 10_000) return;
      last = now;
      const msg = e.reason instanceof Error ? e.reason.message : typeof e.reason === 'string' ? e.reason : ''; // 객체 reason은 "[object Object]"로 보이지 않게
      notify(`작업 중 오류가 났습니다${msg ? `: ${msg.slice(0, 80)}` : ''} — 화면을 새로고침해도 같다면 관리자에게 알려주세요.`);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);
  usePreloadReload(); // 옛 지연 청크 404 → 1회 새로고침 (hooks/usePreloadReload)

  // 프로그램 분리: 어드민 전용 exe에서는 지점(일반 CRM) 화면을 표시하지 않는다
  if (BLOCK_STAFF_UI) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 bg-[#1a3a8f] rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-white text-xl font-bold">T</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">관리자 전용 프로그램입니다</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            이 프로그램은 관리자 콘솔 전용입니다. 지점 업무는
            <strong className="text-gray-900"> 더마솔루션 </strong>
            프로그램을 사용해주세요.
          </p>
          <button
            onClick={async () => { clearLocalPhotoCacheForLogout(); await logout(); window.location.hash = '#/admin/login'; window.location.reload(); }} // 어드민 계정은 지점 사진을 보관하지 않으므로 보관 사진 확인은 생략
            className="px-5 py-2.5 bg-[#1a3a8f] hover:bg-[#0d2260] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            관리자 로그인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[25] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* 메인 콘텐츠 */}
      {/* pb-tabbar-safe lg:pb-0: 모바일 탭바(h-14=56px) + 기기 하단 safe-area / 데스크톱은 0 */}
      <main className="flex-1 lg:ml-64 min-h-screen overflow-x-hidden pb-tabbar-safe lg:pb-0">
        {/* 공통 알림(토스트) — notify() 표시 영역 */}
        <ToastHost />
        {/* 업데이트 배너 — PC(포터블) / 모바일 앱(스토어 버전 안내), 각자 해당 플랫폼에서만 렌더 */}
        <UpdateBanner />
        <MobileUpdateBanner />
        {/* 공지사항 배너 */}
        <AnnouncementBanner />
        {/* 앱 잠금(PIN) — 설정에서 켠 기기에서만 (2026-11-18) */}
        <AppLockOverlay />
        {/* 모바일 상단: 오프라인·전송 대기 배너 + 헤더를 한 덩어리로 고정 — 따로 sticky였을 때 배너(z-30)가 스크롤 중 헤더(z-10) 위를 덮었다.
            상태바 safe-area는 덩어리 맨 위에 한 번만 (7차 UX 점검 2026-11-20) */}
        <div className="lg:hidden sticky top-0 z-20 pt-safe bg-white shadow-sm">
        <OfflineBanner />
        <div className="flex items-center gap-3 px-4 pb-3 pt-3 bg-white border-b border-gray-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
            aria-label="사이드바 열기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#1a3a8f] rounded-lg flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <p className="max-w-[220px] truncate text-sm font-bold text-[#1a3a8f] leading-tight" title={programName}>{programName}</p>
          </div>
        </div>
        </div>

        {/* 화면 렌더 예외 → 흰 화면 대신 복구 UI. 라우트가 바뀌면 자동 초기화 (2026-11-17) */}
        <ErrorBoundary resetKey={location.pathname}>
          <FeatureRouteGate>
            <Outlet />
          </FeatureRouteGate>
        </ErrorBoundary>
      </main>

      {/* 하단 탭바 — 모바일 전용 (내부에서 lg:hidden 처리) */}
      <MobileTabBar />
    </div>
  );
}
