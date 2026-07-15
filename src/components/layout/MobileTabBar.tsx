import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, ClipboardList,
  MoreHorizontal, TrendingUp, Settings, LogOut, X,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

const TAB_ITEMS = [
  { to: '/', label: '홈', icon: LayoutDashboard, ariaLabel: '홈으로 이동' },
  { to: '/customers', label: '고객', icon: Users, ariaLabel: '고객 관리로 이동' },
  { to: '/reservations', label: '예약', icon: Calendar, ariaLabel: '예약 관리로 이동' },
  { to: '/treatments', label: '시술', icon: ClipboardList, ariaLabel: '시술 기록으로 이동' },
] as const;

export default function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      setMoreOpen(false);
    } catch {
      window.alert('아직 서버에 저장되지 않은 변경이 있거나 서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 로그아웃해주세요.');
    }
  };

  const handleNavigate = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <>
      {/* 탭바 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-slate-200 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-14">
          {TAB_ITEMS.map(({ to, label, icon: Icon, ariaLabel }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={ariaLabel}
              className={({ isActive }) =>
                clsx(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors',
                  isActive
                    ? 'text-[#1a3a8f]'
                    : 'text-slate-400 hover:text-slate-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className={clsx('text-[10px]', isActive ? 'font-semibold' : 'font-normal')}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* 더보기 탭 */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="더보기 메뉴 열기"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-slate-400 hover:text-slate-500 transition-colors"
          >
            <MoreHorizontal size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-normal">더보기</span>
          </button>
        </div>
      </nav>

      {/* 더보기 bottom sheet */}
      {moreOpen && (
        <>
          {/* 오버레이 */}
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMoreOpen(false)}
          />

          {/* 패널 */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="더보기 메뉴"
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl lg:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* 드래그 핸들 */}
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-2" />

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <span className="text-sm font-bold text-gray-900">더보기</span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="닫기"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* 메뉴 목록 */}
            <div className="py-2">
              {/* 매출 — admin 이상만 */}
              {user?.role !== 'staff' && (
                <button
                  onClick={() => handleNavigate('/sales')}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} className="text-purple-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-800">매출</span>
                </button>
              )}

              <button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Settings size={20} className="text-slate-600" />
                </div>
                <span className="text-sm font-medium text-gray-800">설정</span>
              </button>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                  <LogOut size={20} className="text-red-500" />
                </div>
                <span className="text-sm font-medium text-red-600">로그아웃</span>
              </button>
            </div>

            {/* 사용자 정보 */}
            <div className="mx-5 mt-1 mb-4 p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1a3a8f] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">{(user?.name ?? 'U')[0]}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user?.shopName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                {user?.role && (
                  <span className={clsx(
                    'ml-auto flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full',
                    user.role === 'superadmin'
                      ? 'bg-purple-100 text-purple-700'
                      : user.role === 'admin'
                        ? 'bg-blue-100 text-[#1a3a8f]'
                        : 'bg-slate-200 text-slate-600',
                  )}>
                    {user.role === 'superadmin' ? '슈퍼관리자' : user.role === 'admin' ? '관리자' : '직원'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
