import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import UpdateBanner from '../ui/UpdateBanner';
import AnnouncementBanner from '../ui/AnnouncementBanner';
import OfflineBanner from '../ui/OfflineBanner';
import { useAuth } from '../../contexts/AuthContext';
import { useCrmBrand } from '../../hooks/useCrmBrand';
import { BLOCK_STAFF_UI } from '../../lib/buildTarget';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { programName } = useCrmBrand(user?.shopName);

  useEffect(() => {
    document.title = programName;
  }, [programName]);

  // 프로그램 분리: 어드민 전용 exe에서는 지점(일반 CRM) 화면을 표시하지 않는다
  if (BLOCK_STAFF_UI) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 bg-[#1a3a8f] rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-white text-xl font-black">T</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">관리자 전용 프로그램입니다</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            이 프로그램은 관리자 콘솔 전용입니다. 지점 업무는
            <strong className="text-gray-900"> 트로이아르케 CRM </strong>
            프로그램을 사용해주세요.
          </p>
          <button
            onClick={async () => { await logout(); window.location.hash = '#/admin/login'; window.location.reload(); }}
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
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* 메인 콘텐츠 */}
      {/* pb-16 lg:pb-0: 모바일 탭바(h-14=56px) + safe-area 여백 / 데스크톱은 0 */}
      <main className="flex-1 lg:ml-64 min-h-screen overflow-x-hidden pb-16 lg:pb-0">
        {/* 업데이트 배너 */}
        <UpdateBanner />
        {/* 공지사항 배너 */}
        <AnnouncementBanner />
        {/* 오프라인 배너 (모바일 전용 — lg:hidden) */}
        <OfflineBanner />
        {/* 모바일 상단 헤더 */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
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
            <div>
              <p className="max-w-[220px] truncate text-xs font-black text-[#1a3a8f] leading-tight" title={programName}>{programName}</p>
              <p className="text-[9px] text-gray-400">에스테틱 고객관리</p>
            </div>
          </div>
        </div>

        <Outlet />
      </main>

      {/* 하단 탭바 — 모바일 전용 (내부에서 lg:hidden 처리) */}
      <MobileTabBar />
    </div>
  );
}
