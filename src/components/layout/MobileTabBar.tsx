import { useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, ClipboardList,
  MoreHorizontal, TrendingUp, Settings, LogOut, X, Tag, Package, UserCog, MessageSquare, Bot, Link2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { canOpenRoute } from '../../lib/permissions';
import { featureForPath } from '../../lib/featureRegistry';
import { isFeatureEnabled, resetFeatureFlags } from '../../lib/featureFlags';
import { clearLocalPhotoCacheForLogout, keepLocalLogoutWarning } from '../../lib/photoStore';
import { useFeatureFlagsTick } from '../../hooks/useFeature';
import { useFocusTrap, useOverlayClose } from '../../lib/overlayStack';

const TAB_ITEMS = [
  { to: '/', label: '홈', icon: LayoutDashboard, ariaLabel: '홈으로 이동' },
  { to: '/customers', label: '고객', icon: Users, ariaLabel: '고객 관리로 이동' },
  { to: '/reservations', label: '예약', icon: Calendar, ariaLabel: '예약 관리로 이동' },
  { to: '/treatments', label: '시술', icon: ClipboardList, ariaLabel: '시술 기록으로 이동' },
] as const;

export default function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  useOverlayClose(moreOpen, () => setMoreOpen(false)); // Android 뒤로가기·Esc로 더보기 시트 닫기
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(moreOpen, sheetRef); // 시트 안에서 Tab 순환, 닫히면 더보기 탭으로 (55)
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useFeatureFlagsTick();

  // 어드민이 끈 모듈은 탭에서 제외
  const visibleTabs = TAB_ITEMS.filter((item) => {
    const def = featureForPath(item.to);
    return !def || isFeatureEnabled(def.id);
  });
  const salesEnabled = isFeatureEnabled('module.sales');
  // 더보기 = 상단 서랍(Sidebar)과 같은 메뉴 — 어드민이 끈 모듈은 같은 기준으로 제외. 서랍에만 있던 AI 챗봇·API 가이드를 추가 (3차 UX 점검 2026-11-19)
  const MORE_LINKS = [
    { to: '/programs', label: '시술 프로그램', icon: Tag, bg: 'bg-blue-50', fg: 'text-blue-600' },
    { to: '/products', label: '제품/재고', icon: Package, bg: 'bg-amber-50', fg: 'text-amber-700' },
    { to: '/staff', label: '직원 관리', icon: UserCog, bg: 'bg-teal-50', fg: 'text-teal-600' },
    { to: '/messaging', label: '문자/카카오 발송', icon: MessageSquare, bg: 'bg-emerald-50', fg: 'text-emerald-700' },
    { to: '/ai-chat', label: 'AI 분석 챗봇', icon: Bot, bg: 'bg-violet-50', fg: 'text-violet-700' },
    { to: '/api-guide', label: 'API 연동 가이드', icon: Link2, bg: 'bg-slate-100', fg: 'text-slate-700' },
  ].filter(l => { const def = featureForPath(l.to); return (!def || isFeatureEnabled(def.id)) && canOpenRoute(user?.role, l.to); }); // 직원 계정은 직원 관리 제외 — PC 사이드바와 같은 규칙 (13차 점검)

  const handleLogout = () => {
    const warning = keepLocalLogoutWarning(); // 이 기기 보관 사진은 로그아웃하면 사라진다 — 한 확인창에 같은 문장으로 (리뷰 2026-11-19)
    if (!window.confirm(warning ? `로그아웃할까요?\n${warning}` : '로그아웃할까요?')) return; // 설정 바로 아래라 손가락 미스로 재로그인하던 것 방지 (3차 UX 점검 2026-11-19)
    setMoreOpen(false);
    resetFeatureFlags(); // 계정 간 플래그 잔류 방지
    clearLocalPhotoCacheForLogout(); // 공용 기기 개인정보 보호 — 서버 모드에서만
    logout();
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
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex h-14">
          {visibleTabs.map(({ to, label, icon: Icon, ariaLabel }) => (
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
                    : 'text-slate-500 hover:text-slate-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className={clsx('text-xs', isActive ? 'font-semibold' : 'font-normal')}>
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
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-slate-500 hover:text-slate-700 transition-colors"
          >
            <MoreHorizontal size={20} strokeWidth={1.8} />
            <span className="text-xs font-normal">더보기</span>
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
            ref={sheetRef}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl lg:hidden outline-none"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))' }}
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
              {/* 매출 — admin 이상 + 어드민 허용 시만 */}
              {canOpenRoute(user?.role, '/sales') && salesEnabled && (
                <button
                  onClick={() => handleNavigate('/sales')}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} className="text-primary-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-800">매출·손익</span>
                </button>
              )}

              {MORE_LINKS.map(l => (
                <button
                  key={l.to}
                  onClick={() => handleNavigate(l.to)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className={`w-10 h-10 ${l.bg} rounded-xl flex items-center justify-center`}>
                    <l.icon size={20} className={l.fg} />
                  </div>
                  <span className="text-sm font-medium text-gray-800">{l.label}</span>
                </button>
              ))}

              {canOpenRoute(user?.role, '/settings') && (
              <button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Settings size={20} className="text-slate-600" />
                </div>
                <span className="text-sm font-medium text-gray-800">설정</span>
              </button>
              )}

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                  <LogOut size={20} className="text-red-600" />
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
                  <p className="text-sm font-semibold text-gray-900 truncate">{user?.shopName || '샵 정보 미설정'}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                {user?.role && (
                  <span className={clsx(
                    'ml-auto flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full',
                    user.role === 'superadmin'
                      ? 'bg-primary-600 text-white'
                      : user.role === 'admin'
                        ? 'bg-primary-100 text-primary-700'
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
